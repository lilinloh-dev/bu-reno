import { getCollection, getHome, getItem, getImage, putImage, upsert, newId, type Item } from "./store.mts";
import { generateImage, type Part } from "./gemini.mts";

type Idea = Item & { title?: string; details?: string; motivation?: string; images?: string[] };

const MAX_REFERENCE_IMAGES = 10;
const b64 = (b: ArrayBuffer) => Buffer.from(b).toString("base64");

/** Human-readable brief. Shown in the app and sent to the image model. */
export async function buildPrompt(render: Item): Promise<string> {
  const [home, rooms, ideas] = await Promise.all([getHome(), getCollection("rooms"), getCollection("ideas")]);
  const room = rooms.find((r) => r.id === render.roomId);
  const chosen = (ideas as Idea[]).filter((i) => (render.ideaIds as string[]).includes(i.id));
  const lines = [
    `Photorealistic interior design render of the ${room?.name || "room"} in a ${home.type || "flat"}` +
      (home.area ? ` (${home.area})` : "") + ".",
    home.style ? `Overall style of the home: ${home.style}.` : "",
    chosen.length ? "The render must clearly show these design decisions:" : "",
    ...chosen.map((i) => `- ${i.title}${i.details ? `: ${String(i.details).replace(/\n+/g, "; ").replace(/:;/g, ":")}` : ""}`),
    render.note ? `Extra direction: ${render.note}` : "",
    "Eye-level wide-angle view, natural daylight, realistic proportions for a Singapore HDB flat (about 2.6 m ceiling).",
    "No people, no text, no logos, no watermarks.",
  ];
  return lines.filter(Boolean).join("\n");
}

async function imagePart(id: string): Promise<Part | null> {
  const img = await getImage(id);
  return img ? { type: "image", mime_type: img.type, data: b64(img.bytes) } : null;
}

/** Runs the image model for a pending render record and stores the result. */
export async function runRender(renderId: string) {
  const render = await getItem("renders", renderId);
  if (!render || render.status !== "pending") return;
  try {
    const [home, ideas] = await Promise.all([getHome(), getCollection("ideas")]);
    const input: Part[] = [];

    if (render.parentImageId) {
      // Refinement: edit the earlier render instead of starting again.
      const prev = await imagePart(String(render.parentImageId));
      if (prev) {
        input.push({ type: "text", text: "This is the current render of the room. Keep the same room, camera angle and everything not mentioned; apply only the change requested below." }, prev);
      }
      input.push({ type: "text", text: `Change requested: ${render.note || "improve realism"}\n\nOriginal brief for context:\n${render.prompt}` });
    } else {
      input.push({ type: "text", text: String(render.prompt) });
      if (home.floorPlanImageId) {
        const plan = await imagePart(String(home.floorPlanImageId));
        if (plan) input.push({ type: "text", text: "Floor plan of the whole flat. Use it only for this room's shape, proportions and where windows and doors are. Do not draw the plan itself." }, plan);
      }
      let used = 0;
      for (const idea of (ideas as Idea[]).filter((i) => (render.ideaIds as string[]).includes(i.id))) {
        for (const imgId of idea.images || []) {
          if (used >= MAX_REFERENCE_IMAGES) break;
          const part = await imagePart(imgId);
          if (!part) continue;
          input.push({ type: "text", text: `Inspiration photo for "${idea.title}". Borrow the look of this item or idea, not the rest of the photo.` }, part);
          used++;
        }
      }
    }

    const out = await generateImage(input, String(render.aspect || "16:9"));
    const imageId = newId();
    await putImage(imageId, out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength) as ArrayBuffer, out.type);
    await upsert("renders", { id: renderId, status: "done", imageId, error: "" });
  } catch (e) {
    await upsert("renders", { id: renderId, status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}
