import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "reno_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export type User = { email: string; name: string; picture?: string };

const env = (k: string) => process.env[k] || "";
const isDev = () => env("NETLIFY_DEV") === "true";

function secret() {
  const s = env("SESSION_SECRET");
  if (s) return s;
  if (isDev()) return "dev-only-secret";
  throw new Error("SESSION_SECRET is not set");
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export const allowedEmails = () =>
  env("ALLOWED_EMAILS").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export function publicConfig() {
  return {
    googleClientId: env("GOOGLE_CLIENT_ID"),
    devLogin: isDev() && !!env("DEV_LOGIN_EMAIL"),
    configured: !!(env("GOOGLE_CLIENT_ID") && env("SESSION_SECRET") && allowedEmails().length),
  };
}

export function sessionCookie(user: User) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString("base64url");
  const secure = isDev() ? "" : " Secure;";
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function getUser(req: Request): User | null {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (p.exp < Date.now() / 1000) return null;
    // Removing someone from ALLOWED_EMAILS locks them out immediately.
    if (!isDev() && !allowedEmails().includes(String(p.email).toLowerCase())) return null;
    return { email: p.email, name: p.name, picture: p.picture };
  } catch {
    return null;
  }
}

/** Token for the phone share shortcut (iOS can't share into a web app directly). */
export function hasIngestToken(req: Request) {
  const t = env("INGEST_TOKEN");
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(t);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verify a Google Sign-In ID token and check the email is on the allow-list. */
export async function verifyGoogle(credential: string): Promise<User> {
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!r.ok) throw new Error("Google did not accept that sign-in");
  const t = (await r.json()) as Record<string, string>;
  if (t.aud !== env("GOOGLE_CLIENT_ID")) throw new Error("Sign-in was issued for a different app");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(t.iss)) throw new Error("Unexpected issuer");
  if (String(t.email_verified) !== "true") throw new Error("Google email is not verified");
  const email = String(t.email).toLowerCase();
  if (!allowedEmails().includes(email)) throw new Error(`${email} is not allowed to use this app`);
  return { email, name: t.given_name || t.name || email, picture: t.picture };
}

export function devUser(): User | null {
  if (!isDev() || !env("DEV_LOGIN_EMAIL")) return null;
  return { email: env("DEV_LOGIN_EMAIL"), name: env("DEV_LOGIN_EMAIL").split("@")[0] };
}
