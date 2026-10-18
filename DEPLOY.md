# Deployment Guide — Vercel + Railway

Pargot.ai has two long-lived pieces that deploy independently:

```
                        ┌─────────────────────────────┐
   Browser (anywhere)   │                             │
       │                │   Vercel                    │
       │  HTTPS         │   ├── web/  (Next.js)      │
       └────────────────┤   │   /api/token            │
                        │   │   /api/support  (GET+POST)
                        │   │   /                     │
                        │   │                         │
                        └───┬─────────────────────────┘
                            │ LiveKit JWT
                            ▼
   ┌────────────────────────────────────────────┐
   │  LiveKit Cloud (managed)                   │
   │  - WebRTC SFU                              │
   │  - Dispatches agent jobs into rooms        │
   └────────┬───────────────────────────────────┘
            │ websocket job
            ▼
   ┌────────────────────────────────────────────┐
   │  Railway                                   │
   │  └── agent/  (Python worker)               │
   │       interviewer.py start                 │
   │       └─► google.genai (Gemini Live)       │
   └────────────────────────────────────────────┘
```

- **Vercel** hosts the Next.js frontend + the `/api/support` and `/api/token` routes.
- **Railway** hosts the long-running Python LiveKit agent worker.
- **LiveKit Cloud** is the WebRTC backbone. It connects browsers to the room and dispatches jobs to the worker — both Vercel and Railway just need its API credentials.
- **Google AI Studio** provides the Gemini API key used by both pieces (live audio on the worker; structured-output coach on the web side).

---

## Prerequisites

Create free accounts on:

1. **GitHub** — to push the code so Vercel + Railway can pull it.
2. **LiveKit Cloud** → [cloud.livekit.io](https://cloud.livekit.io). Free tier (no card required) is enough for development. After signup, create a project and copy three values from **Settings → Keys**:
   - `LIVEKIT_URL` (looks like `wss://your-project-xxxx.livekit.cloud`)
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
3. **Google AI Studio** → [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey). Create an API key (no card needed). Copy it as `GOOGLE_API_KEY`.
4. **Vercel** → [vercel.com](https://vercel.com). Sign in with GitHub.
5. **Railway** → [railway.app](https://railway.app). Sign in with GitHub. Free hobby tier starts with $5 of monthly usage; agent uses ~$2–4/month.

> ⚠ The same four secrets (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GOOGLE_API_KEY`) are needed on **both** Vercel and Railway. Frontend mints LiveKit tokens; worker connects to rooms. They must use the same LiveKit project.

---

## Step 1 — Push to GitHub

From the repo root:

```bash
git init
git add .
git commit -m "Initial Pargot.ai commit"
git branch -M main
git remote add origin https://github.com/<you>/pargot.git
git push -u origin main
```

The root `.gitignore` already excludes `.env*`, `.venv/`, `node_modules/`, `.next/`, and `.claude/`. Sanity-check before pushing:

```bash
git ls-files | grep -E '\.env($|\.)' | grep -v example   # should be empty
```

---

## Step 2 — Deploy the agent worker to Railway

The worker should be online **before** the frontend, so when a user clicks Start the agent is already polling for jobs.

1. **railway.app** → **New Project** → **Deploy from GitHub repo** → pick your repo.
2. Railway opens the project. Click into the auto-created service → **Settings**.
3. **Root Directory**: `agent`
   This tells Railway to treat `agent/` as the build root.
4. **Build**: Railway detects `agent/Dockerfile` and builds the image from it automatically.
5. **Start Command**: leave blank — the Dockerfile runs `python interviewer.py start`.
   (`start` is LiveKit's production mode. `dev` is for local development only and watches files.)
6. **Variables** tab → add all four:

   | Key | Value |
   |---|---|
   | `LIVEKIT_URL` | `wss://your-project-xxxx.livekit.cloud` |
   | `LIVEKIT_API_KEY` | `APIxxxxxxxxxxxxx` |
   | `LIVEKIT_API_SECRET` | `secret-xxx…` |
   | `GOOGLE_API_KEY` | `AIza…` |
   | `INTERVIEWER_MODEL` | `gemini-2.5` *(optional — `gemini-3.1` switches to the preview live model)* |

7. **Networking**: the worker does **not** expose an HTTP port. It's a pure outbound WebSocket consumer. Leave the public domain disabled.
8. **Deploy**. Once the build finishes, open the **Deploy Logs** tab. You should see something like:
   ```
   INFO pargot.interviewer Using interviewer model: gemini-2.5  →  gemini-2.5-flash-native-audio-preview-12-2025
   INFO livekit.agents starting worker {"version": "1.5.x", ...}
   INFO livekit.agents registered worker {"id": "AW_xxx", "region": "us-east"}
   ```
   `registered worker` is the green light — the worker is connected to LiveKit Cloud and waiting for jobs.

### Common Railway issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `ModuleNotFoundError: livekit` | Railway didn't use the Dockerfile | Verify Root Directory = `agent` (so it sees `agent/Dockerfile`) |
| Worker logs `INVALID_ARGUMENT: API key not valid` | Wrong `GOOGLE_API_KEY` | Re-copy from aistudio.google.com |
| Worker logs nothing after `starting worker` | Wrong `LIVEKIT_URL` (e.g. `https://` instead of `wss://`) | Use the URL exactly as shown in LiveKit Cloud Settings |

---

## Step 3 — Deploy the frontend to Vercel

1. **vercel.com** → **Add New** → **Project** → import your GitHub repo.
2. **Root Directory**: `web`
   Click **Edit** beside the auto-detected root and set it to `web`.
3. **Framework Preset**: Next.js (auto-detected, no action needed).
4. **Build Command**: leave default (`pnpm build`).
5. **Install Command**: leave default (`pnpm install` — Vercel auto-picks pnpm from `pnpm-lock.yaml`).
6. **Environment Variables**: add the same four:

   | Key | Value | Notes |
   |---|---|---|
   | `LIVEKIT_URL` | `wss://your-project-xxxx.livekit.cloud` | same as Railway |
   | `LIVEKIT_API_KEY` | `APIxxxxxxxxxxxxx` | same as Railway |
   | `LIVEKIT_API_SECRET` | `secret-xxx…` | same as Railway |
   | `GOOGLE_API_KEY` | `AIza…` | same as Railway |

   Optionally add `GROQ_API_KEY` for a faster coach.

   **Public deployment? Turn on auth mode.** Without it, `/api/token` is open and anyone with the URL can spend your LiveKit + Gemini quota. Add:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_AUTH_ENABLED` | `true` |
   | `AUTH_SECRET` | output of `npx auth secret` |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client; add `https://<your-domain>/api/auth/callback/google` as a redirect URI |
   | `DATABASE_URL` | Neon pooled connection string (free tier) |
   | `DAILY_INTERVIEW_LIMIT` / `NEXT_PUBLIC_DAILY_INTERVIEW_LIMIT` | e.g. `3` |

   Run `pnpm db:push` once (locally, pointed at the same `DATABASE_URL`) to create the tables.

   Apply to **Production, Preview, and Development** environments.
7. Click **Deploy**. First build takes ~2 minutes.
8. Vercel gives you a URL like `pargot-xxx.vercel.app`. Open it.

### Verifying the deploy

Open browser DevTools → Network tab → click **Start interview**:

- `GET /api/support` → 200 with `{ok: true, model: "gemini-2.5-flash"}` (health probe)
- `POST /api/token` → 200 with `{participantToken: "...", serverUrl: "wss://..."}` (JWT)
- WebSocket to `wss://your-project-xxxx.livekit.cloud` opens

If you see the welcome page render and the loader transition to the interview view, you're done. The agent worker on Railway picks up the dispatch and starts speaking.

### Common Vercel issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `404` on `/api/support` | Vercel deployed from repo root, not `web/` | Re-edit Root Directory in project Settings → General |
| Coach panel never updates | `GOOGLE_API_KEY` missing in Vercel env | Add it; redeploy (Settings → Deployments → Redeploy) |
| `Token endpoint failed` toast on Start | `LIVEKIT_API_*` missing or mismatched between web and agent | Verify all three LiveKit vars match exactly on both platforms |
| Build fails: "Module not found: zod" | Old `pnpm-lock.yaml` committed without the new dep | `cd web && pnpm install && git add pnpm-lock.yaml && git commit -m "lock zod" && git push` |

---

## Step 4 — End-to-end smoke test

1. Open the Vercel URL in two devices (e.g. laptop + phone) using **different LiveKit room names** — each fresh browser session creates a new room.
2. Click Start on each. Both should connect within ~3s and Alex should greet you.
3. Watch the Railway logs while a session is live — you should see:
   ```
   INFO pargot.interviewer Connecting to room <random-room-id>
   ```
4. On Vercel: **Functions** tab → `/api/support` invocations should show ~200ms response times.

---

## Architecture notes for production

### Serverless coach state is per-instance

The `/api/support` route uses **module-level state** (`modelAvailability`, `probeTimers`) for the smart rate-limit fallback. On Vercel:

- **Warm instance**: state persists across requests routed to the same Lambda. Fallback chain works as documented.
- **Cold start**: new instance, fresh state. The chain re-discovers any rate-limited models on the first failure.
- **Background `setTimeout` probes**: Vercel terminates functions after the response is sent. Probes scheduled via `setTimeout` will NOT fire reliably on serverless — they only fire if a subsequent request lands on the same warm instance before the function is reaped.

**Net effect**: the smart fallback still works, just with weaker memory across cold starts. If quota errors become persistent enough that this matters, the right next step is to move state into Vercel KV or Upstash Redis. For most usage this is fine.

### Cost estimate (hobby usage)

| Item | Typical | Notes |
|---|---|---|
| Vercel Hobby | $0 | 100 GB bandwidth, unlimited serverless invocations |
| Railway Hobby | $2–4/mo | Worker is light: ~50 MB RAM, almost no CPU when idle |
| LiveKit Cloud Free | $0 | 50 simultaneous participants, 25,000 minutes/month |
| Google AI Studio Free | $0 | Per-day token caps. Gemini 2.5 Flash and Lite are free-tier eligible |
| **Total** | **~$3/mo** | Mostly Railway |

### Scaling beyond hobby

- **Multiple concurrent interviews**: Railway scales the worker process — each `python interviewer.py start` instance can handle ~5 concurrent rooms before CPU becomes a concern. Add replicas via Railway → Service → Settings → Replicas.
- **Worker per region**: If users are global, deploy two Railway services (e.g. one in `us-east`, one in `eu-west`). Set `LIVEKIT_REGION` env var to route jobs.
- **Coach quota**: free-tier Gemini limits hit fast at ~50 interviews/day. The three-tier fallback (2.5 → 3.1-lite → Gemma) covers most overflow; for higher volume, upgrade to a paid AI Studio plan or move to Vertex AI.

---

## Alternative — LiveKit Cloud Workers (managed)

LiveKit Cloud has its own managed worker hosting that removes Railway from the picture entirely:

```
LiveKit Cloud Workers → docs.livekit.io/agents/ops/deployment/cloud-workers
```

You upload the agent code, LiveKit runs it adjacent to their SFU (lowest latency), and you skip the Railway $3/mo. The trade-off is vendor lock-in to LiveKit. Railway gives you full control of the runtime; Cloud Workers gives you zero ops. Both work — pick based on whether you ever want to switch off LiveKit.

---

## Rollback

- **Vercel**: Deployments tab → click any previous deployment → "Promote to Production"
- **Railway**: Deployments → click a previous deploy → "Redeploy"
- **Code**: `git revert <bad-commit> && git push` triggers fresh deploys on both platforms automatically (assuming you connected the GitHub auto-deploy webhook — default for both).

---

## What's NOT covered here

- Custom domain (Vercel: Settings → Domains; Railway: Networking tab)
- Multi-tenant LiveKit (separate projects per customer)
- CI/CD pipelines beyond the default GitHub auto-deploy
