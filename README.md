# Socratiq — PM Mock Interview Platform

Two cooperating AI agents:

1. **Interviewer** — A LiveKit voice agent (Gemini Live, native audio). Asks PM questions, fields clarifying questions, probes follow-ups, gives structured feedback.
2. **Interview Coach** — A side-panel text agent (Gemini 2.5 Flash). Watches the live transcript and proactively suggests frameworks, clarifying questions to ask, answer structure, and pitfalls.

---

## Requirements

| Tool | Minimum version |
|---|---|
| Node.js | 18+ |
| Python | 3.10+ |
| pnpm | 9+ (`npm i -g pnpm`) |
| uv | 0.4+ (`pip install uv` or [docs](https://docs.astral.sh/uv/)) |

You also need:
- A **LiveKit Cloud** project → [cloud.livekit.io](https://cloud.livekit.io) (free tier works)
- A **Google AI Studio** API key → [aistudio.google.com](https://aistudio.google.com/app/apikey)

---

## Setup

### 1. Web frontend

```bash
cd web
cp .env.local.example .env.local
# Fill in LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, GOOGLE_API_KEY
pnpm install
```

### 2. Agent worker

```bash
cd agent
cp .env.example .env
# Fill in LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, GOOGLE_API_KEY

uv venv
uv pip install -e .
```

---

## Running locally

Open **two terminals**:

```bash
# Terminal 1 — Python agent worker
cd agent
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python interviewer.py dev
```

```bash
# Terminal 2 — Next.js frontend
cd web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), click **Start interview**, allow microphone access.

---

## How it works

```
Browser (Next.js)
  ├─ Left panel  →  LiveKit room (voice in/out + transcript)
  └─ Right panel →  Interview Coach (streams cues from Gemini Flash)
         ↑
  /api/support route
         ↑ POST { transcript }
  Gemini 2.5 Flash (google-genai SDK)

LiveKit Cloud
  └─ dispatches job → Python agent worker
         └─ google.beta.realtime.RealtimeModel
               └─ gemini-2.5-flash-native-audio-preview-12-2025
```

When you connect to the room, LiveKit dispatches a job to the Python worker. The worker creates an `AgentSession` with Gemini Live native audio and immediately greets you + asks a random PM interview question.

Every time the interviewer finishes speaking, the frontend posts the rolling transcript to `/api/support`. Gemini 2.5 Flash streams back coaching cues into the right panel within ~1–2 seconds.

---

## Project structure

```
socratiq/
├── agent/
│   ├── interviewer.py        # LiveKit agent entrypoint
│   ├── prompts.py            # Interviewer system prompt
│   └── pyproject.toml
└── web/
    ├── app/
    │   └── api/
    │       ├── token/        # LiveKit JWT endpoint (from starter)
    │       └── support/      # Gemini Flash streaming endpoint
    ├── components/app/
    │   ├── app.tsx           # Root component
    │   ├── interview-room.tsx # Two-column layout
    │   └── support-panel.tsx  # Coach side panel
    ├── hooks/
    │   └── use-support-cues.ts # Transcript → support AI hook
    └── lib/
        └── support-prompt.ts   # Coach system prompt
```

---

## Interview types

The agent randomly selects one of:
- Product design ("Design a product for…")
- Product improvement ("How would you improve…")
- Estimation / Market sizing
- Root cause analysis ("DAU dropped 15%, investigate…")
- Behavioral / Leadership
- Strategy ("Should we enter market X?")

Say **"I'm done"** or **"that's my answer"** to trigger structured feedback.

---

## Deployment

To host the frontend on Vercel and the agent worker on Railway, see **[DEPLOY.md](./DEPLOY.md)** for step-by-step instructions, env-var checklists, and architecture notes.

Quick summary:
- **`web/`** → Vercel (Next.js auto-detected; set Root Directory to `web`)
- **`agent/`** → Railway (Python auto-detected via `pyproject.toml`; reads `agent/Procfile` for the start command)
- Both need the same four env vars: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GOOGLE_API_KEY`
