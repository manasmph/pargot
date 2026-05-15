"""
Pre-interview settings parser for the Python agent.

The frontend's settings page (seniority + question types) is JSON-encoded
into the LiveKit JWT-signed `RoomConfiguration.metadata`. The agent reads
this from `ctx.room.metadata` after `ctx.connect()` and passes the parsed
dict into the opener + system prompt.

We treat the metadata as untrusted user input even though it's signed —
a malformed front-end could send unknown enums. Invalid values silently
fall back to defaults so the agent never crashes on bad shape.
"""

from __future__ import annotations

import json
import logging
from typing import TypedDict

logger = logging.getLogger("socratiq.settings")

SENIORITY_VALUES: set[str] = {"pm", "senior_pm", "staff_pm", "principal_pm"}

QUESTION_TYPE_VALUES: set[str] = {
    "design",
    "improvement",
    "estimation",
    "rca",
    "behavioral",
    "strategy",
}

# Display labels mirror web/lib/interview-settings.ts.
SENIORITY_LABELS: dict[str, str] = {
    "pm": "a PM (mid-level / IC)",
    "senior_pm": "a Senior PM",
    "staff_pm": "a Staff PM",
    "principal_pm": "a Group / Principal PM",
}

QUESTION_TYPE_LABELS: dict[str, str] = {
    "design": "product design",
    "improvement": "product improvement",
    "estimation": "estimation / market sizing",
    "rca": "root cause analysis",
    "behavioral": "behavioral / leadership",
    "strategy": "strategy",
}

# Per-seniority calibration appended to INTERVIEWER_SYSTEM_PROMPT so Alex
# adjusts depth, follow-up tolerance, and what counts as a "good" answer.
SENIORITY_CALIBRATION: dict[str, str] = {
    "pm": (
        "The candidate is interviewing for a PM (mid-level / IC) role.\n"
        "- Tolerate broad strokes and let them get to specifics with prompts.\n"
        "- Expect 1-2 frameworks demonstrated; don't penalise missing rigour.\n"
        "- Ask gentle follow-ups when they get stuck.\n"
    ),
    "senior_pm": (
        "The candidate is interviewing for a Senior PM role.\n"
        "- Expect concrete trade-offs, metrics, and prioritisation rigour.\n"
        "- Push back on vague answers; ask 'why this and not X?'\n"
        "- Watch for ownership of trade-offs, not just listing options.\n"
    ),
    "staff_pm": (
        "The candidate is interviewing for a Staff PM role.\n"
        "- Expect cross-functional thinking and organisational implications.\n"
        "- Probe for influence-without-authority moves and stakeholder mgmt.\n"
        "- Multi-quarter time horizons matter; flag short-term-only answers.\n"
    ),
    "principal_pm": (
        "The candidate is interviewing for a Group / Principal PM role.\n"
        "- Expect strategic narrative and multi-team scope.\n"
        "- Push for executive communication: what does the CEO take away?\n"
        "- Building/scaling teams, market positioning, multi-year bets.\n"
    ),
}


class InterviewSettings(TypedDict):
    seniority: str
    question_types: list[str]


def default_settings() -> InterviewSettings:
    return {
        "seniority": "pm",
        # `sorted` for deterministic logging; order doesn't affect behaviour.
        "question_types": sorted(QUESTION_TYPE_VALUES),
    }


def parse_room_settings(raw: str | None) -> InterviewSettings:
    """
    Parse the JSON string from `ctx.room.metadata` into a typed dict.
    Falls back to defaults on any error or invalid value (per-field).
    """
    if not raw:
        return default_settings()

    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError) as exc:
        logger.warning("Bad JSON in room metadata, using defaults: %s", exc)
        return default_settings()

    if not isinstance(parsed, dict):
        return default_settings()

    seniority = parsed.get("seniority")
    if seniority not in SENIORITY_VALUES:
        if seniority is not None:
            logger.warning("Unknown seniority %r — falling back to default", seniority)
        seniority = "pm"

    raw_types = parsed.get("question_types") or []
    if not isinstance(raw_types, list):
        raw_types = []
    question_types = [t for t in raw_types if t in QUESTION_TYPE_VALUES]
    if not question_types:
        if raw_types:
            logger.warning(
                "No valid question_types in %r — falling back to all", raw_types
            )
        question_types = sorted(QUESTION_TYPE_VALUES)

    return {"seniority": seniority, "question_types": question_types}


def build_opener(settings: InterviewSettings) -> str:
    """Build the opening instruction passed to the realtime model on session start."""
    seniority_label = SENIORITY_LABELS[settings["seniority"]]
    types = ", ".join(QUESTION_TYPE_LABELS[t] for t in settings["question_types"])
    return (
        "Greet the candidate warmly. Introduce yourself as Alex, a senior PM. "
        f"Tell them this will be a ~30-minute mock PM interview for {seniority_label}. "
        f"Then pick ONE interview type at random from: {types}. "
        "Ask your opening question clearly and concisely. "
        "Calibrate question depth and follow-up tolerance to the seniority level. "
        "Do not reveal the interview type."
    )


def build_seniority_calibration(settings: InterviewSettings) -> str:
    """
    Returns the seniority-specific paragraph to append to
    INTERVIEWER_SYSTEM_PROMPT. Empty string for unknown seniorities
    (defensive — should never happen since parse_room_settings normalises).
    """
    return SENIORITY_CALIBRATION.get(settings["seniority"], "")
