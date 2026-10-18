# ---------------------------------------------------------------------------
# Agent worker Dockerfile.
#
# Lives inside agent/ so Railway picks it up when Root Directory = agent.
# Build context is the agent/ folder, so `COPY .` only pulls the agent
# source (no Next.js bloat from web/).
#
# Build:   docker build -t pargot-agent ./agent
# Run:     docker run --env-file agent/.env pargot-agent
# Railway: detected automatically when Root Directory is "agent".
# ---------------------------------------------------------------------------

FROM python:3.11-slim AS base

# System tools needed by livekit-agents wheels (audio, protobuf, ssl).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         build-essential \
         ca-certificates \
         libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps directly instead of via `pip install -e .`. Hatchling + PEP-660
# editable installs occasionally skip dependency resolution in slim Python
# images, leaving the package installed but `dotenv` / `livekit` missing at
# runtime. Listing the deps explicitly here sidesteps that and gives us
# better Docker layer caching (the deps layer is reused across rebuilds
# when only the source changes).
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir \
         "livekit-agents[google]>=1.5.8,~=1.5" \
         "python-dotenv>=1.0"

# Verify the critical imports succeed inside the build. If anything is
# missing we want to fail HERE — not at "Starting Container" with a
# runtime ModuleNotFoundError.
RUN python -c "import dotenv; import livekit.agents; print('deps ok')"

# Copy the agent source AFTER deps so dep layer caches across edits.
COPY . /app/

# Worker runs production mode (NOT `dev` — that's for local-only file-watch).
CMD ["python", "interviewer.py", "start"]
