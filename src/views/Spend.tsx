import { useMemo, useState } from "react";
import { money, remove, reportError, save, saveHome, uid, useApp } from "../store";
import type { Expense } from "../types";
import { confirmDelete, Empty, Field, Modal } from "../ui";

export const CATEGORIES = ["Contractor / ID", "Carpentry", "Electrical", "Plumbing", "Flooring & tiles", "Painting", "Aircon", "Appliances", "Furniture", "Lighting", "Smart home", "Fixtures & fittings", "Fees & permits", "Other"];

function ExpenseForm({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { rooms, expenses } = useApp();
  const isNew = !expenses.some((e) => e.id === expense.id);
  const [d, setD] = useState(expense);
  const [amount, setAmount] = useState(expense.amount ? String(expense.amount) : "");
  const [paid, setPaid] = useState(expense.paid ? String(expense.paid) : "");
  const up = (p: Partial<Expense>) => setD((x) => ({ ...x, ...p }));
  const submit = () => {
    const a = Number(amount) || 0, p = Number(paid) || 0;
    if (!d.item.trim()) return reportError("What is this for?");
    if (a < 0 || p < 0) return reportError("Amounts can't be negative");
    save("expenses", { ...d, item: d.item.trim(), amount: a, paid: p });
    onClose();
  };
  return (
    <Modal title={isNew ? "Add spending" : "Edit spending"} onClose={onClose} footer={
      <>
        {!isNew && <button className="danger ghost" onClick={() => { if (confirmDelete(`"${d.item}"`)) { remove("expenses", d.id); onClose(); } }}>Delete</button>}
        <span className="grow" /><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" onClick={submit}>Save</button>
      </>
    }>
      <Field label="Item"><input autoFocus={isNew} value={d.item} onChange={(e) => up({ item: e.target.value })} placeholder="e.g. Kitchen carpentry" /></Field>
      <div className="row">
        <Field label="Total cost (S$)" hint="Quoted or agreed price"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
        <Field label="Paid so far (S$)" hint="Deposits and instalments"><input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" /></Field>
      </div>
      {Number(amount) > 0 && <button type="button" className="link" onClick={() => setPaid(amount)}>Mark fully paid</button>}
      <div className="row">
        <Field label="Category"><select value={d.category} onChange={(e) => up({ category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Room"><select value={d.roomId || ""} onChange={(e) => up({ roomId: e.target.value || undefined })}><option value="">Whole home</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      </div>
      <div className="row">
        <Field label="Vendor"><input value={d.vendor || ""} onChange={(e) => up({ vendor: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={d.date || ""} onChange={(e) => up({ date: e.target.value })} /></Field>
      </div>
      <Field label="Paid by"><input value={d.paidBy || ""} onChange={(e) => up({ paidBy: e.target.value })} placeholder="Name" /></Field>
      <Field label="Notes"><textarea rows={2} value={d.notes || ""} onChange={(e) => up({ notes: e.target.value })} /></Field>
    </Modal>
  );
}

export default function Spend() {
  const { expenses, rooms, home } = useApp();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [cat, setCat] = useState("");
  const budget = home.budget || 0;
  const committed = expenses.reduce((s, e) => s + e.amount, 0);
  const paid = expenses.reduce((s, e) => s + e.paid, 0);
  const byCat = useMemo(() => {
    const m = new Map<string, { total: number; paid: number }>();
    expenses.forEach((e) => { const c = m.get(e.category) || { total: 0, paid: 0 }; c.total += e.amount; c.paid += e.paid; m.set(e.category, c); });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [expenses]);
  const max = Math.max(1, ...byCat.map(([, v]) => v.total));
  const list = expenses.filter((e) => !cat || e.category === cat).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);
  const setBudget = () => {
    const v = window.prompt("Total renovation budget (S$)", budget ? String(budget) : "");
    if (v === null) return;
    const n = Number(v.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) saveHome({ budget: n });
  };
  const blank = (): Expense => ({ id: uid(), item: "", category: cat || CATEGORIES[0], amount: 0, paid: 0, date: new Date().toISOString().slice(0, 10), createdAt: Date.now() });
  const left = budget - committed;

  return (
    <section>
      <h1>Spending</h1>
      <div className="tiles">
        <button className="tile" onClick={setBudget}><span>Budget</span><b>{budget ? money(budget) : "Set budget"}</b><small>Tap to change</small></button>
        <div className="tile"><span>Committed</span><b>{money(committed)}</b><small>Quoted or agreed</small></div>
        <div className="tile"><span>Paid</span><b>{money(paid)}</b><small>{money(committed - paid)} still owed</small></div>
        {budget > 0 && <div className={`tile ${left < 0 ? "bad" : "good"}`}><span>{left < 0 ? "Over budget" : "Left to commit"}</span><b>{money(Math.abs(left))}</b><small>{Math.round((committed / budget) * 100)}% of budget committed</small></div>}
      </div>

      {byCat.length > 0 && (
        <div className="card cats">
          <h3>By category <span className="muted legend"><i className="sw paid" />Paid <i className="sw owed" />Owed</span></h3>
          {byCat.map(([c, v]) => (
            <button key={c} className={`cat-row${cat === c ? " on" : ""}`} onClick={() => setCat(cat === c ? "" : c)}>
              <span className="cat-name">{c}</span>
              <span className="cat-bar"><i className="paid" style={{ width: `${(v.paid / max) * 100}%` }} /><i className="owed" style={{ width: `${(Math.max(0, v.total - v.paid) / max) * 100}%` }} /></span>
              <span className="cat-amt">{money(v.total)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="bar">
        <h2>{cat || "All items"}</h2>
        {cat && <button className="link" onClick={() => setCat("")}>Show all</button>}
        <span className="grow" />
        <button className="primary" onClick={() => setEditing(blank())}>+ Spending</button>
      </div>
      {list.length === 0 ? <Empty>Nothing recorded yet. Add quotes as you get them, then update "paid so far" as you pay.</Empty> : (
        <div className="card table">
          {list.map((e) => {
            const status = e.paid <= 0 ? "Not paid" : e.paid < e.amount ? "Part paid" : "Paid";
            return (
              <button className="tr" key={e.id} onClick={() => setEditing(e)}>
                <span className="td-main"><b>{e.item}</b><small>{[e.category, rooms.find((r) => r.id === e.roomId)?.name, e.vendor, e.date && new Date(e.date).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "2-digit" })].filter(Boolean).join(" · ")}</small></span>
                <span className="td-amt"><b>{money(e.amount)}</b><small className={`st ${status === "Paid" ? "ok" : status === "Part paid" ? "part" : ""}`}>{status}{status === "Part paid" ? ` ${money(e.paid)}` : ""}</small></span>
              </button>
            );
          })}
        </div>
      )}
      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
