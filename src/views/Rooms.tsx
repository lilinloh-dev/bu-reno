import { useEffect, useMemo, useState } from "react";
import { api, imgUrl, load, remove, reportError, save, uid, useApp } from "../store";
import type { Idea, IdeaStatus, Render, Room } from "../types";
import { confirmDelete, Empty, Field, Images, Lightbox, Modal, when } from "../ui";

const STATUS: Record<IdeaStatus, string> = { considering: "Considering", decided: "Decided", rejected: "Dropped" };

export function IdeaForm({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const { rooms, ideas, user } = useApp();
  const isNew = !ideas.some((i) => i.id === idea.id);
  const [d, setD] = useState<Idea>(idea);
  const up = (p: Partial<Idea>) => setD((x) => ({ ...x, ...p }));
  const submit = () => {
    if (!d.title.trim()) return reportError("Give the idea a name");
    save("ideas", { ...d, title: d.title.trim(), by: d.by || user.name });
    onClose();
  };
  return (
    <Modal title={isNew ? "New idea" : "Edit idea"} onClose={onClose} footer={
      <>
        {!isNew && <button className="danger ghost" onClick={() => { if (confirmDelete(`"${d.title}"`)) { remove("ideas", d.id); onClose(); } }}>Delete</button>}
        <span className="grow" />
        <button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" onClick={submit}>Save</button>
      </>
    }>
      <Field label="Idea"><input autoFocus={isNew} value={d.title} onChange={(e) => up({ title: e.target.value })} placeholder="e.g. Hidden switches" /></Field>
      <div className="row">
        <Field label="Room">
          <select value={d.roomId} onChange={(e) => up({ roomId: e.target.value })}>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={d.status} onChange={(e) => up({ status: e.target.value as IdeaStatus })}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Details"><textarea rows={3} value={d.details || ""} onChange={(e) => up({ details: e.target.value })} placeholder="What it is: size, material, model, where it goes" /></Field>
      <Field label="Motivation"><textarea rows={2} value={d.motivation || ""} onChange={(e) => up({ motivation: e.target.value })} placeholder="Why we want it" /></Field>
      <Field label="Worries"><textarea rows={2} value={d.worries || ""} onChange={(e) => up({ worries: e.target.value })} placeholder="What could go wrong, and possible fixes" /></Field>
      <Field label="Still to decide"><textarea rows={2} value={d.pending || ""} onChange={(e) => up({ pending: e.target.value })} /></Field>
      <Field label="Photos"><Images ids={d.images} onChange={(images) => up({ images })} /></Field>
      <Field label="Source link"><input type="url" value={d.sourceUrl || ""} onChange={(e) => up({ sourceUrl: e.target.value })} placeholder="TikTok / Instagram / shop link" /></Field>
    </Modal>
  );
}

export const blankIdea = (roomId: string): Idea => ({ id: uid(), roomId, title: "", status: "considering", images: [], createdAt: Date.now() });

function IdeaCard({ idea, onEdit }: { idea: Idea; onEdit: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <article className={`card idea ${idea.status}`}>
      {idea.images.length > 0 && (
        <div className="idea-cover" onClick={() => setOpen(0)}>
          <img src={imgUrl(idea.images[0])} alt="" loading="lazy" />
          {idea.images.length > 1 && <span className="badge">+{idea.images.length - 1}</span>}
        </div>
      )}
      <div className="idea-body" onClick={onEdit}>
        <div className="idea-head">
          <h3>{idea.title}</h3>
          <span className={`pill ${idea.status}`}>{STATUS[idea.status]}</span>
        </div>
        {idea.details && <p className="pre">{idea.details}</p>}
        {idea.motivation && <div className="note why"><b>Motivation</b><p className="pre">{idea.motivation}</p></div>}
        {idea.worries && <div className="note worry"><b>Worries</b><p className="pre">{idea.worries}</p></div>}
        {idea.pending && <div className="note pending"><b>Still to decide</b><p className="pre">{idea.pending}</p></div>}
        {!idea.details && !idea.motivation && !idea.worries && !idea.pending && <p className="muted">Nothing filled in yet. Tap to add details.</p>}
      </div>
      {idea.sourceUrl && <a className="idea-src" href={idea.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}
      {open !== null && <Lightbox ids={idea.images} start={open} onClose={() => setOpen(null)} />}
    </article>
  );
}

function RenderDialog({ room, onClose }: { room: Room; onClose: () => void }) {
  const { ideas, home, ai } = useApp();
  const roomIdeas = ideas.filter((i) => i.roomId === room.id);
  const [picked, setPicked] = useState<string[]>(roomIdeas.filter((i) => i.status !== "rejected").map((i) => i.id));
  const [note, setNote] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const photos = roomIdeas.filter((i) => picked.includes(i.id)).reduce((n, i) => n + i.images.length, 0);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<Render>("/api/render", { method: "POST", body: JSON.stringify({ roomId: room.id, ideaIds: picked, note, aspect }) });
      if (r.status === "pending") {
        fetch("/.netlify/functions/render-background", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) }).catch(() => {});
      }
      await load();
      onClose();
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Could not start the render");
      setBusy(false);
    }
  };
  return (
    <Modal title={`Render ${room.name}`} onClose={onClose} footer={
      <><span className="grow" /><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={go}>{busy ? "Starting…" : ai.ready ? "Generate render" : "Write brief"}</button></>
    }>
      {!ai.ready && <p className="callout">Image generation isn't switched on yet (no Gemini key in Netlify). You'll get the written brief, which you can paste into any image tool.</p>}
      <Field label="Ideas to show">
        <div className="checks">
          {roomIdeas.length === 0 && <span className="muted">No ideas in this room yet. The render will use the room and home style only.</span>}
          {roomIdeas.map((i) => (
            <label key={i.id} className="check">
              <input type="checkbox" checked={picked.includes(i.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, i.id] : picked.filter((x) => x !== i.id))} />
              <span>{i.title}{i.status === "rejected" && <em> (dropped)</em>}{i.images.length > 0 && <small> · {i.images.length} photo{i.images.length > 1 ? "s" : ""}</small>}</span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Extra direction" hint={`Uses ${photos} idea photo${photos === 1 ? "" : "s"}${home.floorPlanImageId ? " and your floor plan" : ""}. Home style: ${home.style || "not set (add it on the Home tab)"}`}>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. view from the doorway, evening lighting, walnut instead of oak" />
      </Field>
      <Field label="Shape">
        <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
          <option value="16:9">Wide (16:9)</option><option value="4:3">Standard (4:3)</option><option value="1:1">Square</option><option value="3:4">Tall (3:4)</option><option value="9:16">Phone (9:16)</option>
        </select>
      </Field>
    </Modal>
  );
}

function RenderCard({ render }: { render: Render }) {
  const [open, setOpen] = useState(false);
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState(false);
  const doRefine = async () => {
    if (!refine.trim() || !render.imageId) return;
    setBusy(true);
    try {
      const r = await api<Render>("/api/render", { method: "POST", body: JSON.stringify({ roomId: render.roomId, ideaIds: render.ideaIds, note: refine, aspect: render.aspect, parentImageId: render.imageId, parentPrompt: render.prompt }) });
      if (r.status === "pending") fetch("/.netlify/functions/render-background", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) }).catch(() => {});
      setRefine("");
      await load();
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Could not start the render");
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="card render">
      {render.status === "done" && render.imageId && <img className="render-img" src={imgUrl(render.imageId)} alt="Room render" loading="lazy" onClick={() => setOpen(true)} />}
      {render.status === "pending" && <div className="render-wait"><span className="spinner" />Generating… usually under a minute</div>}
      {render.status === "error" && <div className="render-err">{render.error}</div>}
      <div className="render-meta">
        <span className="muted">{when(render.createdAt)}{render.by ? ` · ${render.by}` : ""}{render.parentImageId ? " · refined" : ""}</span>
        <span className="grow" />
        <button className="link" onClick={() => navigator.clipboard?.writeText(render.prompt)}>Copy brief</button>
        <button className="link danger" onClick={() => confirmDelete("this render") && remove("renders", render.id)}>Delete</button>
      </div>
      <details><summary>Brief{render.note ? `: ${render.note}` : ""}</summary><p className="pre muted">{render.prompt}</p></details>
      {render.status === "done" && (
        <div className="refine">
          <input value={refine} onChange={(e) => setRefine(e.target.value)} placeholder="Change something… e.g. make the cabinets darker" onKeyDown={(e) => e.key === "Enter" && doRefine()} />
          <button disabled={busy || !refine.trim()} onClick={doRefine}>Refine</button>
        </div>
      )}
      {open && render.imageId && <Lightbox ids={[render.imageId]} start={0} onClose={() => setOpen(false)} />}
    </article>
  );
}

export default function Rooms() {
  const { rooms, ideas, renders } = useApp();
  const sorted = useMemo(() => [...rooms].sort((a, b) => a.order - b.order), [rooms]);
  const [roomId, setRoomId] = useState(() => localStorage.getItem("reno.room") || "");
  const room = sorted.find((r) => r.id === roomId) || sorted[0];
  const [editing, setEditing] = useState<Idea | null>(null);
  const [rendering, setRendering] = useState(false);
  const [filter, setFilter] = useState<"all" | IdeaStatus>("all");

  useEffect(() => { if (room) localStorage.setItem("reno.room", room.id); }, [room?.id]);

  // While a render is cooking, check back every few seconds.
  const waiting = renders.some((r) => r.status === "pending");
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => load().catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [waiting]);

  const addRoom = () => {
    const name = window.prompt("Room name")?.trim();
    if (!name) return;
    const r = { id: uid(), name, order: Math.max(0, ...rooms.map((x) => x.order)) + 1 };
    save("rooms", r);
    setRoomId(r.id);
  };

  if (!room) return <section><h1>Rooms & ideas</h1><Empty>No rooms yet.<br /><button className="primary" onClick={addRoom}>Add your first room</button></Empty></section>;

  const roomIdeas = ideas.filter((i) => i.roomId === room.id && (filter === "all" || i.status === filter)).sort((a, b) => a.createdAt - b.createdAt);
  const roomRenders = renders.filter((r) => r.roomId === room.id).sort((a, b) => b.createdAt - a.createdAt);
  const renameRoom = () => { const name = window.prompt("Rename room", room.name)?.trim(); if (name) save("rooms", { ...room, name }); };
  const deleteRoom = () => {
    if (ideas.some((i) => i.roomId === room.id)) return reportError("Move or delete this room's ideas first");
    if (confirmDelete(`the room "${room.name}"`)) remove("rooms", room.id);
  };

  return (
    <section>
      <h1>Rooms & ideas</h1>
      <div className="chips" role="tablist">
        {sorted.map((r) => {
          const n = ideas.filter((i) => i.roomId === r.id).length;
          return <button key={r.id} role="tab" aria-selected={r.id === room.id} className={`chip${r.id === room.id ? " on" : ""}`} onClick={() => setRoomId(r.id)}>{r.name}{n > 0 && <span>{n}</span>}</button>;
        })}
        <button className="chip dashed" onClick={addRoom}>+ Room</button>
      </div>

      <div className="bar">
        <h2>{room.name}</h2>
        <button className="link" onClick={renameRoom}>Rename</button>
        <button className="link danger" onClick={deleteRoom}>Delete</button>
        <span className="grow" />
        <select className="compact" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter ideas">
          <option value="all">All ideas</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => setRendering(true)}>✦ Render room</button>
        <button className="primary" onClick={() => setEditing(blankIdea(room.id))}>+ Idea</button>
      </div>

      {roomIdeas.length === 0 ? <Empty>No ideas here yet.</Empty> : (
        <div className="grid">{roomIdeas.map((i) => <IdeaCard key={i.id} idea={i} onEdit={() => setEditing(i)} />)}</div>
      )}

      {roomRenders.length > 0 && <>
        <h2 className="section">Renders</h2>
        <div className="grid renders">{roomRenders.map((r) => <RenderCard key={r.id} render={r} />)}</div>
      </>}

      {editing && <IdeaForm idea={editing} onClose={() => setEditing(null)} />}
      {rendering && <RenderDialog room={room} onClose={() => setRendering(false)} />}
    </section>
  );
}
