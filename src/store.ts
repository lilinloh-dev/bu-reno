import { useSyncExternalStore } from "react";
import type { AppState, CollectionName, Collections, Home } from "./types";

let state: AppState | null = null;
let inFlight = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: AppState | null) => { state = next; emit(); };

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (typeof init.body === "string") headers["Content-Type"] = "application/json";
  const r = await fetch(path, { credentials: "same-origin", ...init, headers });
  if (r.status === 202 || r.status === 204) return undefined as T;
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status, body.error || `Request failed (${r.status})`);
  return body as T;
}

export const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);

export function useApp(): AppState {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
  if (!s) throw new Error("State not loaded");
  return s;
}

/** Returns false when not signed in. */
export async function load(): Promise<boolean> {
  try {
    const fresh = await api<AppState>("/api/state");
    if (inFlight === 0) set(fresh);
    return true;
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) { set(null); return false; }
    throw e;
  }
}

let onError: (msg: string) => void = (m) => console.error(m);
export const setErrorHandler = (fn: (msg: string) => void) => { onError = fn; };

async function tracked<T>(p: () => Promise<T>): Promise<T | undefined> {
  inFlight++;
  try {
    return await p();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Something went wrong");
    load().catch(() => {});
    return undefined;
  } finally {
    inFlight--;
  }
}

/** Create or update. Shows the change straight away, then saves. */
export function save<K extends CollectionName>(col: K, item: Collections[K][number]) {
  if (!state) return;
  const list = state[col] as { id: string }[];
  const exists = list.some((x) => x.id === item.id);
  set({ ...state, [col]: exists ? list.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...list, item] });
  return tracked(() => api(`/api/c/${col}/${item.id}`, { method: "PUT", body: JSON.stringify(item) }));
}

export function remove(col: CollectionName, id: string) {
  if (!state) return;
  set({ ...state, [col]: (state[col] as { id: string }[]).filter((x) => x.id !== id) });
  return tracked(() => api(`/api/c/${col}/${id}`, { method: "DELETE" }));
}

export function saveHome(patch: Partial<Home>) {
  if (!state) return;
  set({ ...state, home: { ...state.home, ...patch } });
  return tracked(() => api("/api/home", { method: "PUT", body: JSON.stringify(patch) }));
}

/** Shrinks photos in the browser so uploads stay small and quick on mobile data. */
export async function shrinkImage(file: Blob, max = 1800): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 900_000 && file.type === "image/jpeg") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not read that image"))), "image/jpeg", 0.85));
}

export async function uploadImage(file: Blob, id?: string): Promise<string> {
  const blob = await shrinkImage(file);
  const r = await api<{ id: string }>(`/api/img${id ? `?id=${id}` : ""}`, { method: "POST", body: blob, headers: { "Content-Type": blob.type } });
  return r.id;
}

export const imgUrl = (id: string) => `/api/img/${id}`;
export const money = (n: number) => new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(n || 0);
export const reportError = (m: string) => onError(m);

/** Saved posts that nobody has turned into an idea or archived yet. */
export function unsortedInbox(s: Pick<AppState, "inbox" | "ideas">) {
  const used = new Set(s.ideas.map((i) => i.sourceUrl).filter(Boolean));
  return s.inbox.filter((i) => i.status === "new" && !used.has(i.url));
}
