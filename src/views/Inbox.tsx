import { useState } from "react";
import { api, load, remove, reportError, save, uid, useApp } from "../store";
import type { Idea, InboxItem } from "../types";
import { confirmDelete, Empty, Images, when } from "../ui";
import { IdeaForm } from "./Rooms";

const PLATFORM: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", xiaohongshu: "Xiaohongshu", web: "Link" };

export async function addLink(body: { url?: string; text?: string; title?: string; note?: string }) {
  await api("/api/inbox", { method: "POST", body: JSON.stringify(body) });
  await load();
}

function Item({ item }: { item: InboxItem }) {
  const { rooms, ai } = useApp();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Idea | null>(null);
  const s = item.suggestion;

  const suggest = async () => {
    setBusy(true);
    try {
      await api(`/api/inbox/${item.id}/analyze`, { method: "POST" });
      await load();
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Could not analyse this post");
    } finally {
      setBusy(false);
    }
  };
  const makeIdea = () => {
    const room = rooms.find((r) => r.name.toLowerCase() === (s?.room || "").toLowerCase()) || rooms.find((r) => r.name === "Unsorted") || rooms[0];
    if (!room) return reportError("Add a room first");
    setDraft({
      id: uid(), roomId: room.id, title: s?.title || "", details: s?.details || item.title || "", motivation: s?.motivation || item.note || "",
      worries: s?.worries || "", pending: s?.pending || "", status: "considering", images: item.images, sourceUrl: item.url, createdAt: Date.now(),
    });
  };

  return (
    <article className={`card inbox-item ${item.status}`}>
      <div className="inbox-head">
        <span className={`pill plat ${item.platform}`}>{PLATFORM[item.platform] || "Link"}</span>
        <span className="muted">{when(item.createdAt)}{item.by ? ` · ${item.by}` : ""}{item.author ? ` · @${item.author}` : ""}</span>
        <span className="grow" />
        {item.status === "converted" && <span className="pill decided">Idea made</span>}
      </div>
      {item.title && <p className="pre clamp">{item.title}</p>}
      <a href={item.url} target="_blank" rel="noreferrer" className="inbox-link">{item.url}</a>
      <textarea rows={2} defaultValue={item.note || ""} placeholder="What do you like about it? (helps the idea suggestion)" onBlur={(e) => e.target.value !== (item.note || "") && save("inbox", { ...item, note: e.target.value })} />
      <Images ids={item.images} onChange={(images) => save("inbox", { ...item, images })} />
      <small className="muted">Add screenshots of the key moments: that's what the idea suggestion and renders can actually see.</small>
      {s && (
        <div className="note why suggestion">
          <b>Suggested idea{s.room ? ` · ${s.room}` : ""}</b>
          <p><strong>{s.title}</strong>{s.details ? ` — ${s.details}` : ""}</p>
        </div>
      )}
      <div className="bar tight">
        {ai.ready && <button disabled={busy} onClick={suggest}>{busy ? "Thinking…" : s ? "Suggest again" : "✦ Suggest idea"}</button>}
        <button className="primary" onClick={makeIdea}>Make idea</button>
        <span className="grow" />
        {item.status !== "archived" && <button className="link" onClick={() => save("inbox", { ...item, status: "archived" })}>Archive</button>}
        <button className="link danger" onClick={() => confirmDelete("this saved post") && remove("inbox", item.id)}>Delete</button>
      </div>
      {draft && <IdeaForm idea={draft} onClose={() => setDraft(null)} />}
    </article>
  );
}

export default function Inbox() {
  const { inbox, ideas } = useApp();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await addLink({ text: url.trim() });
      setUrl("");
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Could not save that link");
    } finally {
      setBusy(false);
    }
  };

  // An inbox post counts as converted once an idea points at its link.
  const used = new Set(ideas.map((i) => i.sourceUrl).filter(Boolean));
  const items = inbox
    .map((i) => (used.has(i.url) && i.status === "new" ? { ...i, status: "converted" as const } : i))
    .filter((i) => showArchived || i.status !== "archived")
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <section>
      <h1>Inbox</h1>
      <p className="lede">Drop TikTok, Instagram or any other links here as you find them, then turn the good ones into ideas.</p>
      <form className="inline-add standalone" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link…" inputMode="url" />
        <button className="primary" disabled={busy || !url.trim()}>{busy ? "Saving…" : "Save"}</button>
      </form>
      {items.length === 0 ? <Empty>Nothing saved yet.<br /><small>On Android, install this site to your home screen and it appears in the Share menu. On iPhone, see the README for a one-tap Shortcut.</small></Empty>
        : <div className="grid">{items.map((i) => <Item key={i.id} item={i} />)}</div>}
      {inbox.some((i) => i.status === "archived") && <button className="link" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide" : "Show"} archived</button>}
    </section>
  );
}
