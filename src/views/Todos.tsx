import { useMemo, useState } from "react";
import { remove, save, uid, useApp } from "../store";
import type { Todo } from "../types";
import { confirmDelete, Empty, Field, Modal } from "../ui";

function TodoForm({ todo, groups, onClose }: { todo: Todo; groups: string[]; onClose: () => void }) {
  const [d, setD] = useState(todo);
  const up = (p: Partial<Todo>) => setD((x) => ({ ...x, ...p }));
  return (
    <Modal title="Edit to-do" onClose={onClose} footer={
      <>
        <button className="danger ghost" onClick={() => { if (confirmDelete("this to-do")) { remove("todos", d.id); onClose(); } }}>Delete</button>
        <span className="grow" /><button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => { save("todos", { ...d, group: d.group.trim() || "General" }); onClose(); }}>Save</button>
      </>
    }>
      <Field label="To-do"><textarea rows={2} value={d.title} onChange={(e) => up({ title: e.target.value })} /></Field>
      <div className="row">
        <Field label="Section"><input list="todo-groups" value={d.group} onChange={(e) => up({ group: e.target.value })} /><datalist id="todo-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></Field>
        <Field label="Due"><input type="date" value={d.due || ""} onChange={(e) => up({ due: e.target.value })} /></Field>
      </div>
      <Field label="Who"><input value={d.assignee || ""} onChange={(e) => up({ assignee: e.target.value })} placeholder="Name" /></Field>
      <Field label="Notes"><textarea rows={3} value={d.notes || ""} onChange={(e) => up({ notes: e.target.value })} /></Field>
    </Modal>
  );
}

export default function Todos() {
  const { todos } = useApp();
  const [editing, setEditing] = useState<Todo | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newGroup, setNewGroup] = useState("");

  const groups = useMemo(() => {
    const order: string[] = [];
    [...todos].sort((a, b) => a.order - b.order).forEach((t) => { if (!order.includes(t.group)) order.push(t.group); });
    return order;
  }, [todos]);
  const done = todos.filter((t) => t.done).length;
  const today = new Date().toISOString().slice(0, 10);

  const add = (group: string) => {
    const title = (drafts[group] || "").trim();
    if (!title) return;
    save("todos", { id: uid(), title, group, done: false, order: Math.max(0, ...todos.map((t) => t.order)) + 1, createdAt: Date.now() });
    setDrafts({ ...drafts, [group]: "" });
  };
  const addGroup = () => {
    const g = newGroup.trim();
    if (!g) return;
    save("todos", { id: uid(), title: "First step", group: g, done: false, order: Math.max(0, ...todos.map((t) => t.order)) + 1, createdAt: Date.now() });
    setNewGroup("");
  };

  return (
    <section>
      <h1>To-do</h1>
      <div className="bar">
        <div className="progress" aria-label={`${done} of ${todos.length} done`}><div style={{ width: `${todos.length ? (done / todos.length) * 100 : 0}%` }} /></div>
        <span className="muted nowrap">{done} / {todos.length} done</span>
        <label className="check"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /><span>Hide done</span></label>
      </div>
      {groups.length === 0 && <Empty>Nothing to do yet. Add a section below.</Empty>}
      {groups.map((g) => {
        const all = todos.filter((t) => t.group === g).sort((a, b) => a.order - b.order);
        const items = all.filter((t) => !hideDone || !t.done);
        return (
          <div className="card todo-group" key={g}>
            <h3>{g}<span className="muted"> {all.filter((t) => t.done).length}/{all.length}</span></h3>
            <ul>
              {items.map((t) => (
                <li key={t.id} className={t.done ? "done" : ""}>
                  <input type="checkbox" checked={t.done} onChange={(e) => save("todos", { ...t, done: e.target.checked })} aria-label={t.title} />
                  <div className="todo-text" onClick={() => setEditing(t)}>
                    <span>{t.title}</span>
                    {(t.due || t.assignee || t.notes) && <small>
                      {t.due && <b className={!t.done && t.due < today ? "overdue" : ""}>{new Date(t.due).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}</b>}
                      {t.assignee && <span>{t.assignee}</span>}{t.notes && <span>{t.notes}</span>}
                    </small>}
                  </div>
                </li>
              ))}
            </ul>
            <form className="inline-add" onSubmit={(e) => { e.preventDefault(); add(g); }}>
              <input value={drafts[g] || ""} onChange={(e) => setDrafts({ ...drafts, [g]: e.target.value })} placeholder="Add a to-do…" />
              <button disabled={!(drafts[g] || "").trim()}>Add</button>
            </form>
          </div>
        );
      })}
      <form className="inline-add standalone" onSubmit={(e) => { e.preventDefault(); addGroup(); }}>
        <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New section, e.g. Defects check" />
        <button disabled={!newGroup.trim()}>Add section</button>
      </form>
      {editing && <TodoForm todo={editing} groups={groups} onClose={() => setEditing(null)} />}
    </section>
  );
}
