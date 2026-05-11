import logging
import os
from dotenv import load_dotenv
from google.genai import types as genai_types
from livekit import agents
from livekit.agents import Agent, AgentSession, RoomInputOptions
from livekit.plugins import google

from prompts import INTERVIEWER_SYSTEM_PROMPT

load_dotenv()

logger = logging.getLogger("socratiq.interviewer")

# ---------------------------------------------------------------------------
# Model configuration
# ---------------------------------------------------------------------------
# Set INTERVIEWER_MODEL in agent/.env to switch between voice models:
#
#   INTERVIEWER_MODEL=gemini-2.5   (default) — stable GA native-audio model
#   INTERVIEWER_MODEL=gemini-3.1   — latest preview, better audio quality
#
# Key behavioural difference:
#   gemini-2.5: mutable_chat_context=True  → generate_reply() works normally
#   gemini-3.1: mutable_chat_context=False → generate_reply() is blocked;
#               we trigger the first reply via on_enter() using the
#               send_realtime_input(text=…) path instead.
# ---------------------------------------------------------------------------

MODELS: dict[str, str] = {
    "gemini-2.5": "gemini-2.5-flash-native-audio-preview-12-2025",
    "gemini-3.1": "gemini-3.1-flash-live-preview",
}

_model_key = os.getenv("INTERVIEWER_MODEL", "gemini-2.5").strip().lower()

if _model_key not in MODELS:
    logger.warning(
        "Unknown INTERVIEWER_MODEL=%r — falling back to gemini-2.5. Valid choices: %s",
        _model_key,
        list(MODELS.keys()),
    )
    _model_key = "gemini-2.5"

SELECTED_MODEL = MODELS[_model_key]
logger.info("Using interviewer model: %s  →  %s", _model_key, SELECTED_MODEL)

# Opening instruction sent to kick off the interview
_OPENER = (
    "Greet the candidate warmly. Introduce yourself as Alex, a senior PM. "
    "Tell them this will be a ~30-minute mock PM interview. "
    "Then pick ONE interview type at random from: product design, product improvement, "
    "estimation, root cause analysis, behavioral, or strategy. "
    "Ask your opening question clearly and concisely. Do not reveal the interview type."
)


class PMInterviewer(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=INTERVIEWER_SYSTEM_PROMPT)

    async def on_enter(self) -> None:
        """
        Called by the framework when this agent's session starts.

        gemini-3.1 blocks generate_reply() (mutable_chat_context=False) so we
        cannot use the entrypoint approach.  Instead we inject a text trigger
        directly into the plugin's internal message channel, which the _run loop
        forwards to the Gemini Live session via send_realtime_input(text=…).
        The model treats it as a user text message and generates an audio reply.

        gemini-2.5 is handled in entrypoint() with generate_reply() as before.
        """
        if _model_key == "gemini-3.1":
            logger.info("gemini-3.1: triggering opener via send_realtime_input")
            try:
                rt = self.realtime_llm_session  # plugin's RealtimeSession
                # _send_client_event enqueues a ClientEvent onto the internal
                # message channel.  The _run loop picks it up and calls:
                #   await gemini_session.send_realtime_input(text=…)
                # which is the approved mid-session text path for 3.1.
                rt._send_client_event(
                    genai_types.LiveClientRealtimeInput(text=_OPENER)
                )
            except Exception:
                logger.exception("gemini-3.1: failed to trigger opener via on_enter")


def _build_realtime_model() -> google.beta.realtime.RealtimeModel:
    """
    Build the RealtimeModel with settings for the selected model.

    Transcription: both sides enabled explicitly so that LiveKit publishes
    text transcripts to the room's data channel (picked up by useSessionMessages).

    ThinkingConfig: gemini-3.1 only; MINIMAL keeps conversational latency low.
    """
    kwargs: dict = dict(
        model=SELECTED_MODEL,
        voice="Puck",
        temperature=0.8,
        input_audio_transcription=genai_types.AudioTranscriptionConfig(),
        output_audio_transcription=genai_types.AudioTranscriptionConfig(),
    )

    if _model_key == "gemini-3.1":
        # thinking_config wraps ThinkingConfig — do NOT pass thinking_level
        # directly to RealtimeModel (that is a field of ThinkingConfig, not a
        # kwarg on RealtimeModel).
        kwargs["thinking_config"] = genai_types.ThinkingConfig(
            thinking_level="MINIMAL"  # MINIMAL | LOW | MEDIUM | HIGH
        )

    return google.beta.realtime.RealtimeModel(**kwargs)


async def entrypoint(ctx: agents.JobContext) -> None:
    logger.info("Connecting to room %s (model: %s)", ctx.room.name, _model_key)
    await ctx.connect()

    session = AgentSession(llm=_build_realtime_model())

    await session.start(
        room=ctx.room,
        agent=PMInterviewer(),
        room_input_options=RoomInputOptions(),
    )

    # gemini-2.5: trigger the opening reply here; generate_reply() works normally.
    # gemini-3.1: opener is sent inside PMInterviewer.on_enter() instead, because
    #             generate_reply() is blocked (mutable_chat_context=False).
    if _model_key == "gemini-2.5":
        await session.generate_reply(instructions=_OPENER)


def main() -> None:
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))


if __name__ == "__main__":
    main()
