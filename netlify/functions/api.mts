import type { Config } from "@netlify/functions";
import * as auth from "./lib/auth.mts";
import * as db from "./lib/store.mts";
import { buildPrompt } from "./lib/render.mts";
import { generateJson, hasGemini, imageModel, type Part } from "./lib/gemini.mts";

export const config: Config = { path: "/api/*" };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
const fail = (status: number, error: string) => json({ error }, status);

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5.5 * 1024 * 1024;

export default async (req: Request) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const route = `${req.method} ${parts[0] || ""}`;
  try {
    // ---- public routes ----
    if (route === "GET config") return json(auth.publicConfig());
    if (req.method === "POST" && parts[0] === "auth") {
      if (parts[1] === "google") {
        // Google posts here as a full-page redirect (ux_mode "redirect"), which works where its
        // pop-up flow doesn't: iPhone home-screen apps and in-app browsers end on a blank page.
        const back = (error?: string, cookie?: string) =>
          new Response(null, {
            status: 303,
            headers: {
              Location: error ? `/?signin_error=${encodeURIComponent(error)}` : "/",
              "Cache-Control": "no-store",
              ...(cookie ? { "Set-Cookie": cookie } : {}),
            },
          });
        const form = new URLSearchParams(await req.text());
        const credential = form.get("credential");
        if (!credential) return back("Google didn't send a sign-in. Please try again.");
        // Double-submit check: Google's script sets this cookie on our site and echoes it in the form.
        const csrf = form.get("g_csrf_token");
        const csrfCookie = (req.headers.get("cookie") || "").match(/(?:^|;\s*)g_csrf_token=([^;]+)/)?.[1];
        if (!csrf || csrf !== csrfCookie) return back("Sign-in check failed. Please try again.");
        try {
          return back(undefined, auth.sessionCookie(await auth.verifyGoogle(credential)));
        } catch (e) {
          return back(e instanceof Error ? e.message : "Sign-in failed");
        }
      }
      if (parts[1] === "dev") {
        const user = auth.devUser();
        if (!user) return fail(404, "Not available");
        return json({ user }, 200, { "Set-Cookie": auth.sessionCookie(user) });
      }
      if (parts[1] === "logout") return json({ ok: true }, 200, { "Set-Cookie": auth.clearCookie() });
    }

    // ---- share shortcut: token OR signed-in user ----
    const user = auth.getUser(req);
    if (route === "POST inbox" && parts.length === 1) {
      if (!user && !auth.hasIngestToken(req)) return fail(401, "Unauthorized");
      return json(await addToInbox((await req.json()) as Record<string, string>, user?.name || "Shared"));
    }

    if (!user) return fail(401, "Unauthorized");

    // ---- signed-in routes ----
    if (route === "GET state") {
      return json({ user, ...(await db.getState()), ai: { ready: hasGemini(), imageModel: imageModel() } });
    }

    if (parts[0] === "home" && req.method === "PUT") {
      return json(await db.patchHome((await req.json()) as Record<string, unknown>));
    }

    if (parts[0] === "c" && db.isCollection(parts[1] || "") && db.validId(parts[2])) {
      const col = parts[1] as db.Collection;
      if (req.method === "PUT") {
        const body = (await req.json()) as db.Item;
        return json(await db.upsert(col, { ...body, id: parts[2] }));
      }
      if (req.method === "DELETE") {
        await db.remove(col, parts[2]);
        return json({ ok: true });
      }
    }

    if (parts[0] === "img") {
      if (req.method === "POST") {
        const type = (req.headers.get("content-type") || "").split(";")[0];
        if (!IMAGE_TYPES.includes(type)) return fail(415, "Only JPEG, PNG, WebP or GIF images");
        const bytes = await req.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return fail(413, "Image is empty or too large");
        const wanted = url.searchParams.get("id");
        const id = db.validId(wanted) ? wanted : db.newId();
        await db.putImage(id, bytes, type);
        return json({ id });
      }
      if (db.validId(parts[1])) {
        if (req.method === "GET") {
          const img = await db.getImage(parts[1]);
          if (!img) return fail(404, "Not found");
          return new Response(img.bytes, {
            headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=31536000, immutable" },
          });
        }
        if (req.method === "DELETE") {
          await db.deleteImage(parts[1]);
          return json({ ok: true });
        }
      }
    }

    if (route === "POST render") {
      const b = (await req.json()) as Record<string, unknown>;
      if (!db.validId(b.roomId)) return fail(400, "Pick a room");
      const render: db.Item = {
        id: db.newId(),
        roomId: b.roomId,
        ideaIds: Array.isArray(b.ideaIds) ? b.ideaIds.filter(db.validId) : [],
        note: String(b.note || "").slice(0, 1000),
        aspect: ["16:9", "4:3", "1:1", "3:4", "9:16"].includes(String(b.aspect)) ? b.aspect : "16:9",
        parentImageId: db.validId(b.parentImageId) ? b.parentImageId : undefined,
        status: hasGemini() ? "pending" : "error",
        error: hasGemini() ? "" : "Image generation isn't switched on yet: add GEMINI_API_KEY in Netlify. The brief below can be pasted into any image tool meanwhile.",
        by: user.name,
        createdAt: Date.now(),
      };
      render.prompt = b.parentPrompt ? String(b.parentPrompt).slice(0, 6000) : await buildPrompt(render);
      return json(await db.upsert("renders", render));
    }

    if (route === "POST inbox" && parts[2] === "analyze" && db.validId(parts[1])) {
      return json(await analyzeInboxItem(parts[1]));
    }

    if (route === "POST import") {
      const b = (await req.json()) as { home?: Record<string, unknown>; collections?: Record<string, db.Item[]> };
      if (b.home) await db.patchHome(b.home);
      for (const [col, items] of Object.entries(b.collections || {})) {
        if (!db.isCollection(col) || !Array.isArray(items)) continue;
        // Adds and updates only; nothing already in the app is deleted.
        await Promise.all(items.filter((i) => db.validId(i?.id)).map((i) => db.upsert(col, i)));
      }
      return json({ ok: true });
    }

    return fail(404, "Not found");
  } catch (e) {
    console.error(e);
    return fail(500, e instanceof Error ? e.message : "Server error");
  }
};

// ---------- inbox ----------

const platformOf = (host: string) =>
  /tiktok\.com$/.test(host) ? "tiktok" : /instagram\.com$/.test(host) ? "instagram" : /(youtube\.com|youtu\.be)$/.test(host) ? "youtube" : /xiaohongshu\.com|xhslink\.com$/.test(host) ? "xiaohongshu" : "web";

async function fetchWithTimeout(u: string, ms = 6000) {
  return fetch(u, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "Mozilla/5.0 (compatible; link-preview)" } });
}

async function storeRemoteImage(u: string): Promise<string | undefined> {
  try {
    const r = await fetchWithTimeout(u);
    const type = (r.headers.get("content-type") || "").split(";")[0];
    if (!r.ok || !IMAGE_TYPES.includes(type)) return;
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return;
    const id = db.newId();
    await db.putImage(id, bytes, type);
    return id;
  } catch {
    return;
  }
}

async function addToInbox(b: Record<string, string>, by: string) {
  // Share sheets often put the link inside the text rather than the url field.
  const raw = b.url || (`${b.text || ""} ${b.title || ""}`.match(/https?:\/\/\S+/) || [""])[0];
  let link: URL;
  try {
    link = new URL(raw);
  } catch {
    throw new Error("No link found in what was shared");
  }
  if (link.protocol !== "https:" && link.protocol !== "http:") throw new Error("Unsupported link");
  const platform = platformOf(link.hostname);
  const item: db.Item = {
    id: db.newId(), url: link.href, platform, title: (b.title || "").slice(0, 300), author: "",
    note: (b.note || (b.url ? b.text : "") || "").slice(0, 2000), images: [], status: "new", by, createdAt: Date.now(),
  };
  // TikTok and YouTube publish caption + cover image for any public post. Instagram does not.
  const oembed = platform === "tiktok" ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(link.href)}`
    : platform === "youtube" ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.href)}` : "";
  if (oembed) {
    try {
      const r = await fetchWithTimeout(oembed);
      if (r.ok) {
        const o = (await r.json()) as Record<string, string>;
        item.title = String(o.title || item.title || "").slice(0, 500);
        item.author = o.author_name || "";
        if (o.thumbnail_url) {
          const id = await storeRemoteImage(o.thumbnail_url);
          if (id) item.images = [id];
        }
      }
    } catch { /* keep the bare link */ }
  }
  return db.upsert("inbox", item);
}

async function analyzeInboxItem(id: string) {
  const [item, rooms] = await Promise.all([db.getItem("inbox", id), db.getCollection("rooms")]);
  if (!item) throw new Error("Inbox item not found");
  const input: Part[] = [{
    type: "text",
    text: [
      "A couple renovating their flat saved this social media post as inspiration.",
      "From the caption, their note and the attached screenshots, work out the single renovation idea they most likely want to keep.",
      `Rooms in their flat: ${rooms.map((r) => r.name).join(", ")}.`,
      `Post link: ${item.url}`,
      item.title ? `Caption: ${item.title}` : "",
      item.note ? `Their note: ${item.note}` : "",
      "Write plainly and concretely. Leave a field empty rather than inventing detail the post does not show.",
    ].filter(Boolean).join("\n"),
  }];
  for (const imgId of ((item.images as string[]) || []).slice(0, 8)) {
    const img = await db.getImage(imgId);
    if (img) input.push({ type: "image", mime_type: img.type, data: Buffer.from(img.bytes).toString("base64") });
  }
  const str = (description: string) => ({ type: "string", description });
  const suggestion = await generateJson<Record<string, string>>(input, {
    type: "object",
    properties: {
      room: str("Best matching room name, copied exactly from the list"),
      title: str("Short name of the idea, 2 to 5 words"),
      details: str("What it is: materials, dimensions, mechanism, placement"),
      motivation: str("Why it is appealing"),
      worries: str("Practical downsides or risks to check"),
      pending: str("Open questions to decide before committing"),
    },
    required: ["room", "title", "details"],
  });
  return db.upsert("inbox", { id, suggestion });
}
