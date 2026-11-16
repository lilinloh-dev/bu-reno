import { useCallback, useEffect, useRef, useState } from "react";
import { api, load, setErrorHandler, unsortedInbox, useApp } from "./store";
import Home from "./views/Home";
import Rooms from "./views/Rooms";
import Todos from "./views/Todos";
import Spend from "./views/Spend";
import Inbox, { addLink } from "./views/Inbox";

type Config = { googleClientId: string; devLogin: boolean; configured: boolean };
declare global {
  interface Window { google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } } }
}

const TABS = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "rooms", label: "Rooms", icon: "▦" },
  { id: "todos", label: "To-do", icon: "✓" },
  { id: "spend", label: "Spend", icon: "$" },
  { id: "inbox", label: "Inbox", icon: "↓" },
];

function SignIn({ onDone }: { onDone: () => void }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const btn = useRef<HTMLDivElement>(null);

  useEffect(() => { api<Config>("/api/config").then(setCfg).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!cfg?.googleClientId) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      window.google!.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: async (r: { credential: string }) => {
          try {
            await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: r.credential }) });
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign-in failed");
          }
        },
      });
      if (btn.current) window.google!.accounts.id.renderButton(btn.current, { theme: "outline", size: "large", shape: "pill", text: "signin_with" });
    };
    document.head.appendChild(s);
    return () => s.remove();
  }, [cfg?.googleClientId, onDone]);

  return (
    <main className="signin">
      <img src="/icon.svg" alt="" width="56" height="56" />
      <h1>Reno HQ</h1>
      <p className="muted">Our renovation, in one place.</p>
      <div ref={btn} />
      {cfg && !cfg.googleClientId && !cfg.devLogin && <p className="callout">Google sign-in isn't set up yet. Add <code>GOOGLE_CLIENT_ID</code>, <code>ALLOWED_EMAILS</code> and <code>SESSION_SECRET</code> in Netlify (see the README).</p>}
      {cfg?.devLogin && <button className="primary" onClick={() => api("/api/auth/dev", { method: "POST" }).then(onDone)}>Local dev sign-in</button>}
      {error && <p className="callout bad">{error}</p>}
    </main>
  );
}

function Shell() {
  const app = useApp();
  const { user } = app;
  const [tab, setTab] = useState(() => (location.hash.slice(1) && TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : "home"));
  const go = useCallback((t: string) => { setTab(t); history.replaceState(null, "", `#${t}`); window.scrollTo(0, 0); }, []);
  const fresh = unsortedInbox(app).length;

  // Links shared into the installed app (Android share menu) arrive as query parameters.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const shared = { url: q.get("share_url") || "", text: q.get("share_text") || "", title: q.get("share_title") || "" };
    if (!shared.url && !shared.text) return;
    history.replaceState(null, "", "/#inbox");
    setTab("inbox");
    addLink(shared).catch(() => {});
  }, []);

  // Pick up the other person's changes.
  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && load().catch(() => {});
    const t = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  return (
    <div className="shell">
      <nav className="nav" aria-label="Sections">
        <div className="brand"><img src="/icon.svg" alt="" width="28" height="28" /><b>Reno HQ</b></div>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
            <i aria-hidden>{t.icon}</i><span>{t.label}</span>{t.id === "inbox" && fresh > 0 && <em>{fresh}</em>}
          </button>
        ))}
        <div className="who">{user.name}</div>
      </nav>
      <main className="main">
        {tab === "home" && <Home go={go} />}
        {tab === "rooms" && <Rooms />}
        {tab === "todos" && <Todos />}
        {tab === "spend" && <Spend />}
        {tab === "inbox" && <Inbox />}
      </main>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<"loading" | "in" | "out" | "error">("loading");
  const [toast, setToast] = useState("");
  const boot = useCallback(() => {
    load().then((ok) => setStatus(ok ? "in" : "out")).catch(() => setStatus("error"));
  }, []);
  useEffect(() => {
    setErrorHandler((m) => { setToast(m); setTimeout(() => setToast(""), 5000); });
    boot();
  }, [boot]);

  return (
    <>
      {status === "loading" && <main className="signin"><span className="spinner big" /></main>}
      {status === "error" && <main className="signin"><p>Couldn't reach the server.</p><button onClick={boot}>Try again</button></main>}
      {status === "out" && <SignIn onDone={boot} />}
      {status === "in" && <Shell />}
      {toast && <div className="toast" role="alert">{toast}</div>}
    </>
  );
}
