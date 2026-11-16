import { useEffect, useRef, useState, type ReactNode } from "react";
import { imgUrl, reportError, uploadImage } from "./store";

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Lightbox({ ids, start, onClose }: { ids: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => (x + 1) % ids.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + ids.length) % ids.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ids.length, onClose]);
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={imgUrl(ids[i])} alt="" onClick={(e) => { e.stopPropagation(); setI((x) => (x + 1) % ids.length); }} />
      {ids.length > 1 && <div className="lightbox-count">{i + 1} / {ids.length}</div>}
      <button className="icon lightbox-close" aria-label="Close">✕</button>
    </div>
  );
}

/** Thumbnails that open full-size; optionally editable (add / remove). */
export function Images({ ids, onChange, size = 72 }: { ids: string[]; onChange?: (ids: string[]) => void; size?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files?.length || !onChange) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(files)) added.push(await uploadImage(f));
      onChange([...ids, ...added]);
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  if (!ids.length && !onChange) return null;
  return (
    <div className="thumbs">
      {ids.map((id, i) => (
        <div className="thumb" key={id} style={{ width: size, height: size }}>
          <img src={imgUrl(id)} alt="" loading="lazy" onClick={() => setOpen(i)} />
          {onChange && <button type="button" className="thumb-x" aria-label="Remove photo" onClick={() => onChange(ids.filter((x) => x !== id))}>✕</button>}
        </div>
      ))}
      {onChange && (
        <button type="button" className="thumb add" style={{ width: size, height: size }} onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "…" : "+ Photo"}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      {open !== null && <Lightbox ids={ids} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function confirmDelete(what: string) {
  return window.confirm(`Delete ${what}? This can't be undone.`);
}

export const when = (t: number) => new Date(t).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
