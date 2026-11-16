import { useRef, useState } from "react";
import { api, imgUrl, load, money, remove, reportError, save, saveHome, uid, unsortedInbox, uploadImage, useApp } from "../store";
import { COLLECTION_NAMES, type Contact, type Home as HomeT } from "../types";
import { confirmDelete, Field, Lightbox, Modal } from "../ui";

function HomeForm({ onClose }: { onClose: () => void }) {
  const { home } = useApp();
  const [d, setD] = useState<HomeT>({ ...home, facts: home.facts || [], links: home.links || [] });
  const up = (p: Partial<HomeT>) => setD((x) => ({ ...x, ...p }));
  const facts = d.facts || [], links = d.links || [];
  const submit = () => {
    saveHome({ name: d.name, address: d.address, type: d.type, area: d.area, style: d.style, notes: d.notes,
      facts: facts.filter((f) => f.k.trim() || f.v.trim()), links: links.filter((l) => l.url.trim()) });
    onClose();
  };
  return (
    <Modal wide title="Home details" onClose={onClose} footer={<><span className="grow" /><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" onClick={submit}>Save</button></>}>
      <div className="row">
        <Field label="Name"><input value={d.name || ""} onChange={(e) => up({ name: e.target.value })} /></Field>
        <Field label="Flat type"><input value={d.type || ""} onChange={(e) => up({ type: e.target.value })} placeholder="5-room HDB BTO" /></Field>
      </div>
      <Field label="Address"><input value={d.address || ""} onChange={(e) => up({ address: e.target.value })} /></Field>
      <Field label="Floor area"><input value={d.area || ""} onChange={(e) => up({ area: e.target.value })} placeholder="113 sqm / 1,216 sq ft" /></Field>
      <Field label="Overall style" hint="Used in every room render, so describe the look you both want."><textarea rows={2} value={d.style || ""} onChange={(e) => up({ style: e.target.value })} /></Field>
      <Field label="Key facts">
        <div className="pairs">
          {facts.map((f, i) => (
            <div className="pair" key={i}>
              <input value={f.k} placeholder="Label" onChange={(e) => up({ facts: facts.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })} />
              <input value={f.v} placeholder="Value" onChange={(e) => up({ facts: facts.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)) })} />
              <button type="button" className="icon" aria-label="Remove" onClick={() => up({ facts: facts.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="link" onClick={() => up({ facts: [...facts, { k: "", v: "" }] })}>+ Add fact</button>
        </div>
      </Field>
      <Field label="Links">
        <div className="pairs">
          {links.map((l, i) => (
            <div className="pair" key={i}>
              <input value={l.label} placeholder="Label" onChange={(e) => up({ links: links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <input value={l.url} placeholder="https://…" onChange={(e) => up({ links: links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" className="icon" aria-label="Remove" onClick={() => up({ links: links.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="link" onClick={() => up({ links: [...links, { label: "", url: "" }] })}>+ Add link</button>
        </div>
      </Field>
      <Field label="Notes"><textarea rows={5} value={d.notes || ""} onChange={(e) => up({ notes: e.target.value })} /></Field>
    </Modal>
  );
}

function ContactForm({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { contacts } = useApp();
  const isNew = !contacts.some((c) => c.id === contact.id);
  const [d, setD] = useState(contact);
  const up = (p: Partial<Contact>) => setD((x) => ({ ...x, ...p }));
  return (
    <Modal title={isNew ? "New contact" : "Edit contact"} onClose={onClose} footer={
      <>
        {!isNew && <button className="danger ghost" onClick={() => { if (confirmDelete(d.name)) { remove("contacts", d.id); onClose(); } }}>Delete</button>}
        <span className="grow" /><button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => { if (!d.name.trim()) return reportError("Add a name"); save("contacts", d); onClose(); }}>Save</button>
      </>
    }>
      <div className="row">
        <Field label="Name"><input autoFocus={isNew} value={d.name} onChange={(e) => up({ name: e.target.value })} /></Field>
        <Field label="Role"><input value={d.role || ""} onChange={(e) => up({ role: e.target.value })} placeholder="ID, contractor, aircon…" /></Field>
      </div>
      <div className="row">
        <Field label="Phone"><input type="tel" value={d.phone || ""} onChange={(e) => up({ phone: e.target.value })} /></Field>
        <Field label="Email"><input type="email" value={d.email || ""} onChange={(e) => up({ email: e.target.value })} /></Field>
      </div>
      <Field label="Link"><input value={d.link || ""} onChange={(e) => up({ link: e.target.value })} placeholder="Website or Instagram" /></Field>
      <Field label="Notes"><textarea rows={3} value={d.notes || ""} onChange={(e) => up({ notes: e.target.value })} placeholder="Quote, impressions, address" /></Field>
    </Modal>
  );
}

function Backup() {
  const app = useApp();
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const toB64 = (blob: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(blob); });

  const exportAll = async () => {
    try {
      const ids = new Set<string>();
      app.ideas.forEach((i) => i.images.forEach((x) => ids.add(x)));
      app.inbox.forEach((i) => i.images.forEach((x) => ids.add(x)));
      app.renders.forEach((r) => r.imageId && ids.add(r.imageId));
      (app.home.docs || []).forEach((d) => ids.add(d.imageId));
      const images: Record<string, { type: string; data: string }> = {};
      let n = 0;
      for (const id of ids) {
        setBusy(`Saving photo ${++n} of ${ids.size}…`);
        const r = await fetch(imgUrl(id));
        if (r.ok) { const b = await r.blob(); images[id] = { type: b.type, data: await toB64(b) }; }
      }
      const collections = Object.fromEntries(COLLECTION_NAMES.map((c) => [c, app[c]]));
      const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), home: app.home, collections, images })], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `reno-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy("");
    }
  };

  const importFile = async (f?: File) => {
    if (!f) return;
    setResult("");
    try {
      const data = JSON.parse(await f.text());
      if (!data.collections && !data.home) throw new Error("That file isn't a Reno HQ backup");
      const imgs = Object.entries((data.images || {}) as Record<string, { type: string; data: string }>);
      let n = 0;
      for (const [id, img] of imgs) {
        setBusy(`Uploading photo ${++n} of ${imgs.length}…`);
        const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
        await uploadImage(new Blob([bytes], { type: img.type }), id);
      }
      // Small batches, so a big file can't run into the server's time or size limits part-way.
      const all = Object.entries((data.collections || {}) as Record<string, unknown[]>)
        .flatMap(([col, items]) => (Array.isArray(items) ? items.map((item) => ({ col, item })) : []));
      let saved = 0, skipped = 0;
      for (let i = 0; i < all.length || i === 0; i += 20) {
        setBusy(all.length ? `Saving ${Math.min(i + 20, all.length)} of ${all.length}…` : "Saving…");
        const collections: Record<string, unknown[]> = {};
        for (const { col, item } of all.slice(i, i + 20)) (collections[col] ||= []).push(item);
        const r = await api<{ saved: number; skipped: number }>("/api/import", { method: "POST", body: JSON.stringify({ home: i === 0 ? data.home : undefined, collections }) });
        saved += r.saved;
        skipped += r.skipped;
      }
      await load();
      setResult(`Imported ${saved} item${saved === 1 ? "" : "s"}${data.home ? " and the home details" : ""}.${skipped ? ` ${skipped} could not be read and were skipped.` : ""}`);
    } catch (e) {
      setResult("The import stopped before it finished. Nothing was removed; it is safe to import the same file again.");
      reportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy("");
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div className="card">
      <h3>Backup</h3>
      <p className="muted">Download everything (including photos) as one file, or load a backup or import file. Importing adds to and updates what's here; it never deletes.</p>
      <div className="bar tight">
        <button disabled={!!busy} onClick={exportAll}>Download backup</button>
        <button disabled={!!busy} onClick={() => file.current?.click()}>Import file…</button>
        {busy && <span className="muted"><span className="spinner" /> {busy}</span>}
      </div>
      {result && <p className="callout" role="status">{result}</p>}
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
    </div>
  );
}

export default function Home({ go }: { go: (tab: string) => void }) {
  const { home, user, todos, expenses, ideas, inbox, contacts, ai } = useApp();
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [doc, setDoc] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const docs = home.docs || [];
  const committed = expenses.reduce((s, e) => s + e.amount, 0);
  const open = todos.filter((t) => !t.done).length;

  const addDocs = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const f of Array.from(files)) added.push({ imageId: await uploadImage(f, undefined), title: f.name.replace(/\.[^.]+$/, "") });
      saveHome({ docs: [...docs, ...added] });
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }); location.reload(); };

  return (
    <section>
      <div className="hero card">
        <div>
          <p className="eyebrow">{home.type || "Our home"}</p>
          <h1>{home.name || "Our home"}</h1>
          {home.address && <p className="address"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(home.address)}`} target="_blank" rel="noreferrer">{home.address}</a></p>}
          {home.area && <p className="muted">{home.area}</p>}
        </div>
        <button onClick={() => setEditing(true)}>Edit details</button>
      </div>

      <div className="tiles">
        <button className="tile" onClick={() => go("spend")}><span>Committed</span><b>{money(committed)}</b><small>{home.budget ? `of ${money(home.budget)} budget` : "No budget set"}</small></button>
        <button className="tile" onClick={() => go("todos")}><span>To-dos open</span><b>{open}</b><small>{todos.length - open} done</small></button>
        <button className="tile" onClick={() => go("rooms")}><span>Ideas</span><b>{ideas.length}</b><small>{ideas.filter((i) => i.status === "decided").length} decided</small></button>
        <button className="tile" onClick={() => go("inbox")}><span>Inbox</span><b>{unsortedInbox({ inbox, ideas }).length}</b><small>saved posts to sort</small></button>
      </div>

      <div className="two">
        <div className="card">
          <h3>Key facts</h3>
          {(home.facts || []).length === 0 ? <p className="muted">Add sizes, key dates, tile specs and anything else you keep looking up.</p> : (
            <dl className="facts">{(home.facts || []).map((f, i) => <div key={i}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}</dl>
          )}
          {home.style && <><h3>Overall style</h3><p>{home.style}</p></>}
          {(home.links || []).length > 0 && <><h3>Links</h3><ul className="links">{(home.links || []).map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noreferrer">{l.label || l.url} ↗</a></li>)}</ul></>}
        </div>
        <div className="card">
          <h3>Notes</h3>
          {home.notes ? <p className="pre">{home.notes}</p> : <p className="muted">Nothing yet.</p>}
          <h3>Contacts <button className="link" onClick={() => setContact({ id: uid(), name: "", createdAt: Date.now() })}>+ Add</button></h3>
          {contacts.length === 0 && <p className="muted">Keep your ID, contractors and suppliers here.</p>}
          <ul className="contacts">
            {contacts.map((c) => (
              <li key={c.id}>
                <button className="contact" onClick={() => setContact(c)}><b>{c.name}</b>{c.role && <small>{c.role}</small>}</button>
                {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bar">
        <h2>Plans & documents</h2><span className="grow" />
        <button disabled={busy} onClick={() => file.current?.click()}>{busy ? "Uploading…" : "+ Add image"}</button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => addDocs(e.target.files)} />
      </div>
      {docs.length === 0 ? <p className="muted">Upload your floor plan, site plan and spec sheets (as images or screenshots).</p> : (
        <div className="docs">
          {docs.map((d, i) => (
            <figure key={d.imageId} className={home.floorPlanImageId === d.imageId ? "plan" : ""}>
              <img src={imgUrl(d.imageId)} alt={d.title} loading="lazy" onClick={() => setDoc(i)} />
              <figcaption>
                <input defaultValue={d.title} aria-label="Title" onBlur={(e) => e.target.value !== d.title && saveHome({ docs: docs.map((x) => (x.imageId === d.imageId ? { ...x, title: e.target.value } : x)) })} />
                <div>
                  <button className="link" onClick={() => saveHome({ floorPlanImageId: home.floorPlanImageId === d.imageId ? "" : d.imageId })}>{home.floorPlanImageId === d.imageId ? "★ Floor plan for renders" : "☆ Use as floor plan"}</button>
                  <button className="link danger" onClick={() => confirmDelete(`"${d.title}"`) && saveHome({ docs: docs.filter((x) => x.imageId !== d.imageId) })}>Remove</button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <h2 className="section">Settings</h2>
      <div className="two">
        <div className="card">
          <h3>Account</h3>
          <p>Signed in as <b>{user.name}</b> <span className="muted">({user.email})</span></p>
          <p className={ai.ready ? "ok-text" : "muted"}>{ai.ready ? `Renders are on (${ai.imageModel}).` : "Renders are off until a Gemini API key is added in Netlify."}</p>
          <button onClick={logout}>Sign out</button>
        </div>
        <Backup />
      </div>

      {editing && <HomeForm onClose={() => setEditing(false)} />}
      {contact && <ContactForm contact={contact} onClose={() => setContact(null)} />}
      {doc !== null && <Lightbox ids={docs.map((d) => d.imageId)} start={doc} onClose={() => setDoc(null)} />}
    </section>
  );
}
