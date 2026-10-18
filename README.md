# Pargot.ai

**Open-source PM mock interviews you can run on your own laptop.** Talk to a live AI voice interviewer while a real-time coach tracks your framework, ticks off what you've covered, and gives feedback after every answer — then get a scored summary at the end.

- 🎙️ **Live voice interviewer** — "Alex", powered by Gemini Live native audio over LiveKit. Asks, clarifies, probes follow-ups.
- 🧭 **Framework tracking** — 9 PM frameworks (CIRCLES, IMPROVE, STAR, AARRR, HEART, Issue Tree, Porter's…) with live stage progress.
- 💡 **Real-time coaching cues + per-turn feedback** in a side panel, without pausing the interview.
- 🎚️ **Interview settings** — seniority (PM → Group/Principal PM) and question types (design, improvement, estimation, root cause, behavioral, strategy).
- 📊 **End-of-interview summary** — score, strengths, improvements, next steps. 30-minute session cap.
- 🔐 **Optional auth mode** — Google sign-in, interview history, and daily quotas for hosted deployments. Off by default.

---

## Quick start (laptop)

### What you need

| Tool | Version |
|---|---|
| Node.js | 20+ |
| pnpm | 9+ (`npm i -g pnpm`) |
| Python | 3.10+ |
| uv | latest ([install](https://docs.astral.sh/uv/getting-started/installation/)) |

Plus two free API accounts:

- **LiveKit Cloud** project — [cloud.livekit.io](https://cloud.livekit.io) → Settings → Keys (free tier is plenty)
- **Google AI Studio** key — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- *(optional)* **Groq** key — [console.groq.com/keys](https://console.groq.com/keys) for a faster coach

No database, no OAuth, no account system needed to run locally.

### 1. Clone

```bash
git clone https://github.com/<you>/pargot.git
cd pargot
```

### 2. Voice agent

```bash
cd agent
cp .env.example .env          # fill in LIVEKIT_* and GOOGLE_API_KEY
uv venv
uv pip install -r pyproject.toml
```

### 3. Web app

```bash
cd web
cp .env.example .env.local    # fill in LIVEKIT_* and GOOGLE_API_KEY (same values as the agent)
pnpm install
```

### 4. Run (two terminals)

```bash
# Terminal 1 — agent
cd agent
source .venv/bin/activate     # Windows: .venv\Scripts\activate
python interviewer.py dev
```

```bash
# Terminal 2 — web
cd web
pnpm dev
```

Open <http://localhost:3000>, click **Start interview**, pick your settings, and allow microphone access.

> **Tip:** if you see `ModuleNotFoundError: No module named 'google.genai'`, you're running the system Python — activate `agent/.venv` first.

---

## How it works

```
Browser (Next.js, web/)
  ├─ Voice room ───────────► LiveKit Cloud ──dispatch──► Python agent (agent/)
  │                                                       └─ Gemini Live native audio ("Alex")
  ├─ Coach panel ── /api/support, /api/feedback, /api/classify-turn
  │                  └─ Groq gpt-oss-120b → Gemini Flash → Flash-Lite → Gemma (auto-fallback)
  └─ Summary ────── /api/summary (Gemini 2.5 Flash)
```

- `/api/token` mints a LiveKit JWT and passes your interview settings to the agent via room metadata.
- The coach routes walk a model chain. If a model is rate-limited or overloaded it's marked down and the next one becomes the default; recovery is probed in the background, never while you wait.
- Frameworks live in a static catalog (`web/lib/frameworks.ts`); the model only emits IDs and flags, and the UI joins them.

### Project structure

```
pargot/
├── agent/                    # Python LiveKit voice agent
│   ├── interviewer.py        # entrypoint
│   ├── prompts.py            # interviewer persona + question bank
│   └── settings.py           # reads seniority / question types from room metadata
├── web/                      # Next.js 15 app
│   ├── app/api/              # token, support, feedback, classify-turn, summary, interviews, auth
│   ├── components/app/       # interview room, coach panel, settings, summary, history
│   ├── hooks/                # coach + summary hooks
│   └── lib/                  # prompts, framework catalog, schemas, db, auth config
└── docs/coach-roadmap.md     # coach design notes
```

---

## Auth mode (optional)

By default Pargot.ai runs with **no sign-in, no database and no limits** — ideal for personal use on your own machine. Don't expose that mode on a public URL: anyone could mint LiveKit tokens and spend your API quota.

For a public deployment, turn on auth mode in `web/.env.local`:

```bash
NEXT_PUBLIC_AUTH_ENABLED=true
AUTH_SECRET=...            # npx auth secret
AUTH_GOOGLE_ID=...         # Google OAuth client
AUTH_GOOGLE_SECRET=...
DATABASE_URL=...           # Postgres; Neon's free tier works well
DAILY_INTERVIEW_LIMIT=3
NEXT_PUBLIC_DAILY_INTERVIEW_LIMIT=3
```

Then create the tables:

```bash
cd web
pnpm db:push
```

This adds Google sign-in, a per-user interview history page (`/history`), and a daily interview quota enforced in `/api/token`. Google OAuth redirect URI: `http://localhost:3000/api/auth/callback/google` (plus your production domain).

---

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** — web on Vercel, agent on Railway (Docker), with env-var checklists.

---

## Contributing

Issues and PRs are welcome. Before opening a PR:

```bash
cd web
pnpm lint
pnpm format:check
pnpm build
```

Never commit `.env`, `.env.local`, or any real keys — the `.gitignore` excludes them; the `*.example` files are the reference.

---

## License

Pargot.ai is licensed under the **[GNU Affero General Public License v3.0](./LICENSE)**. If you run a modified version as a network service, you must make your source code available to its users.

The web app began from LiveKit's [agent-starter-react](https://github.com/livekit-examples/agent-starter-react) template (MIT); its original notice is kept in [`web/LICENSE-LIVEKIT-STARTER`](./web/LICENSE-LIVEKIT-STARTER).
