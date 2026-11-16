# Reno HQ

A private web app for planning a home renovation together: home details and plans, room-by-room
ideas, AI room renders, a to-do list, spending, and an inbox for TikTok / Instagram finds.

Built with React + Vite, Netlify Functions and Netlify Blobs (no separate database to sign up for).
Your data lives in Netlify's storage for the site. Nothing personal is kept in this repository.

## What's in it

| Tab | What it does |
| --- | --- |
| **Home** | Address, flat type, floor area, key facts, links, contacts, plans and documents. Pick which image is the floor plan used for renders. Backup download / import lives here too. |
| **Rooms** | Ideas grouped by room, each with photos, details, motivation, worries, things still to decide, a status (considering / decided / dropped) and a source link. **Render room** turns the chosen ideas, their photos and the floor plan into an image, which you can then refine with follow-up instructions. |
| **To-do** | Checklist in sections, with due dates, owner and notes. |
| **Spend** | Budget, committed vs paid, breakdown by category, per-item records with deposits. |
| **Inbox** | Paste or share a link. TikTok and YouTube links pull in the caption and cover image automatically. Add screenshots, get an AI-suggested idea, and turn it into an idea in one tap. |

## Deploying to Netlify

1. In Netlify: **Add new site → Import an existing project** and pick this repository. The build
   settings come from `netlify.toml`, so just deploy.
2. Create a Google sign-in client (free):
   - Go to <https://console.cloud.google.com/apis/credentials> → **Create credentials → OAuth client ID**
     → type **Web application**.
   - Under **Authorised JavaScript origins** add your site address, e.g. `https://your-site.netlify.app`.
   - Under **Authorised redirect URIs** add the same address followed by `/api/auth/google`, e.g.
     `https://your-site.netlify.app/api/auth/google`. (Sign-in is a full-page redirect, because
     Google's pop-up ends on a blank page on iPhone.)
   - Copy the **Client ID**.
3. In Netlify: **Site configuration → Environment variables**, add:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | The client ID from step 2 |
   | `ALLOWED_EMAILS` | Comma-separated Google accounts allowed in, e.g. `me@gmail.com,partner@gmail.com` |
   | `SESSION_SECRET` | Any long random string (e.g. from `openssl rand -hex 32`) |
   | `GEMINI_API_KEY` | Optional. From <https://aistudio.google.com/apikey>. Switches on renders and idea suggestions. |
   | `INGEST_TOKEN` | Optional. Any long random string, used by the iPhone share shortcut below. |

4. Trigger a redeploy so the variables take effect, open the site and sign in with Google.
5. On the **Home** tab, use **Import file…** to load your import/backup file.

Only the accounts in `ALLOWED_EMAILS` can sign in; everyone else is rejected by the server, and no
data or image is served without a valid session.

Optional overrides: `GEMINI_IMAGE_MODEL` (default `gemini-nano-banana-2.1`) and `GEMINI_TEXT_MODEL`
(default `gemini-3.8-flash`).

## Sharing from TikTok / Instagram

- **Android:** open the site in Chrome → menu → **Add to Home screen / Install**. "Reno HQ" then
  appears in the Share sheet of TikTok, Instagram and every other app.
- **iPhone:** iOS doesn't let web apps appear in the Share sheet, so use a Shortcut:
  1. Shortcuts app → **+** → name it "Save to Reno".
  2. Tap **ⓘ → Show in Share Sheet**, accept **URLs** and **Text**.
  3. Add the action **Get Contents of URL**: URL `https://your-site.netlify.app/api/inbox`,
     Method **POST**, Header `Authorization` = `Bearer <your INGEST_TOKEN>`, Request Body **JSON**
     with a field `text` set to **Shortcut Input**.
  4. In TikTok / Instagram: **Share → Save to Reno**.
- Or just paste the link into the Inbox tab.

What the app can see from a link: TikTok and YouTube publish the caption and cover image for public
posts, so those arrive automatically. Instagram publishes neither, so an Instagram link arrives as a
bare link. For any post, add a few screenshots of the moments you care about: screenshots are what
the idea suggestion and the renders actually look at.

## Running locally

```bash
npm install
```

```bash
DEV_LOGIN_EMAIL=you@example.com npm run dev
```

`npm run dev` runs `netlify dev` (needs the Netlify CLI: `npm i -g netlify-cli`). Locally, a
"Local dev sign-in" button replaces Google sign-in; it never exists on the deployed site.

## How it's put together

- `src/` – the React app. `store.ts` holds state and talks to the API; `views/` has one file per tab.
- `netlify/functions/api.mts` – the whole JSON API under `/api/*` (auth, data, images, inbox, import).
- `netlify/functions/render-background.mts` – background function that calls Gemini for a render.
- `netlify/functions/lib/` – storage (one blob per item, so two people saving at once can't overwrite
  each other), auth (Google ID token → signed session cookie), Gemini client, render brief builder.
