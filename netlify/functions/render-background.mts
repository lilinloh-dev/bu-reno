// Background function: image generation can take longer than a normal request allows.
import { getUser } from "./lib/auth.mts";
import { validId } from "./lib/store.mts";
import { runRender } from "./lib/render.mts";

export default async (req: Request) => {
  if (!getUser(req)) return new Response("Unauthorized", { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!validId(id)) return new Response("Bad id", { status: 400 });
  await runRender(id);
  return new Response(null, { status: 202 });
};
