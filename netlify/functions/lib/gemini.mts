// Gemini Interactions API (https://aistudio.google.com/docs) — plain fetch, no SDK.
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";

export const imageModel = () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";
export const textModel = () => process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
export const hasGemini = () => !!process.env.GEMINI_API_KEY;

export type Part =
  | { type: "text"; text: string }
  | { type: "image"; mime_type: string; data: string };

type Content = { type: string; text?: string; data?: string; mime_type?: string };
type Interaction = { status?: string; steps?: { type: string; content?: Content[] }[]; error?: { message?: string } };

async function interact(body: Record<string, unknown>): Promise<Content[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in Netlify yet");
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json", "Api-Revision": API_REVISION },
    body: JSON.stringify({ ...body, store: false }),
  });
  const json = (await r.json().catch(() => ({}))) as Interaction;
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${json.error?.message || r.statusText}`);
  return (json.steps || []).filter((s) => s.type === "model_output").flatMap((s) => s.content || []);
}

export async function generateImage(input: Part[], aspect: string) {
  const out = await interact({
    model: imageModel(),
    input,
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: aspect, image_size: "2K" },
  });
  const img = [...out].reverse().find((c) => c.type === "image" && c.data);
  if (!img?.data) {
    const said = out.filter((c) => c.type === "text").map((c) => c.text).join(" ").slice(0, 300);
    throw new Error(said ? `Gemini returned no image: ${said}` : "Gemini returned no image");
  }
  return { bytes: Buffer.from(img.data, "base64"), type: img.mime_type || "image/jpeg" };
}

export async function generateJson<T>(input: Part[], schema: Record<string, unknown>): Promise<T> {
  const out = await interact({
    model: textModel(),
    input,
    response_format: { type: "text", mime_type: "application/json", schema },
  });
  const text = out.filter((c) => c.type === "text").map((c) => c.text).join("");
  return JSON.parse(text) as T;
}
