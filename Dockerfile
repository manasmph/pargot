# ---------------------------------------------------------------------------
# Agent worker Dockerfile.
#
# Lives at the repo root so Railway picks it up automatically — no Root
# Directory setting required. We pull just `agent/` into the image so the
# web/ Next.js code stays out of the build context.
#
# Build:   docker build -t socratiq-agent .
# Run:     docker run --env-file agent/.env socratiq-agent
# Railway: detected automatically; uses CMD below to start the worker.
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
# images, leaving you with the package installed but `dotenv`/`livekit`
# missing at runtime. Listing the deps explicitly here sidesteps that and
# also gives us better Docker layer caching (the deps layer is reused
# across rebuilds when only the source changes).
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
         "livekit-agents[google]>=1.5.8,~=1.5" \
         "python-dotenv>=1.0"

# Copy the agent source AFTER deps for cache reuse.
COPY agent/ /app/

# Worker runs production mode (NOT `dev` — that's for local-only file-watch).
CMD ["python", "interviewer.py", "start"]
