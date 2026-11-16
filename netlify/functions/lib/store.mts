import { getStore } from "@netlify/blobs";

export const COLLECTIONS = ["rooms", "ideas", "todos", "expenses", "renders", "inbox", "contacts"] as const;
export type Collection = (typeof COLLECTIONS)[number];
export type Item = { id: string; [k: string]: unknown };

const data = () => getStore({ name: "reno-data", consistency: "strong" });
const images = () => getStore({ name: "reno-images", consistency: "strong" });

export const isCollection = (s: string): s is Collection => (COLLECTIONS as readonly string[]).includes(s);
export const validId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s);

// One blob per item: two people saving different things at the same moment can never overwrite
// each other. Editing the very same item at the same moment is last-write-wins.
const itemKey = (col: Collection, id: string) => `c/${col}/${id}`;

export async function getCollection(col: Collection): Promise<Item[]> {
  const s = data();
  const { blobs } = await s.list({ prefix: `c/${col}/` });
  const items = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" }) as Promise<Item | null>));
  return items.filter((i): i is Item => !!i);
}

export async function getItem(col: Collection, id: string): Promise<Item | null> {
  return (await data().get(itemKey(col, id), { type: "json" })) as Item | null;
}

/** Create, or merge the given fields into the existing item. */
export async function upsert(col: Collection, item: Item): Promise<Item> {
  const next = { ...(await getItem(col, item.id)), ...item, updatedAt: Date.now() };
  await data().setJSON(itemKey(col, item.id), next);
  return next;
}

export async function remove(col: Collection, id: string) {
  await data().delete(itemKey(col, id));
}

export async function getHome(): Promise<Record<string, unknown>> {
  return ((await data().get("home", { type: "json" })) as Record<string, unknown> | null) ?? {};
}

export async function patchHome(patch: Record<string, unknown>) {
  const next = { ...(await getHome()), ...patch, updatedAt: Date.now() };
  await data().setJSON("home", next);
  return next;
}

export async function getState() {
  const [home, ...cols] = await Promise.all([getHome(), ...COLLECTIONS.map(getCollection)]);
  return { home, ...Object.fromEntries(COLLECTIONS.map((c, i) => [c, cols[i]])) };
}

export async function putImage(id: string, bytes: ArrayBuffer, type: string) {
  await images().set(id, bytes, { metadata: { type } });
}

export async function getImage(id: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const r = await images().getWithMetadata(id, { type: "arrayBuffer" });
  if (!r) return null;
  return { bytes: r.data, type: String(r.metadata?.type || "image/jpeg") };
}

export async function deleteImage(id: string) {
  await images().delete(id);
}

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
