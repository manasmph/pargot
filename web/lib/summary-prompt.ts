/**
 * End-of-interview summary prompt.
 *
 * Fired once when the candidate disconnects (manually or via the 30-min
 * auto-disconnect timer). Takes the full transcript + final coach state
 * + their settings, produces a structured `InterviewSummary`.
 *
 * Unlike the per-turn coach prompt (which optimises for terse IDs + flags),
 * this one explicitly asks for prose findings — strengths, improvements,
 * and concrete next steps. Roughly 800–1200 tokens of output expected.
 */
import type { SeniorityId } from './interview-settings';
import { SENIORITY_LABELS } from './interview-settings';

const ROLE = `You are an experienced PM-interview coach reviewing a candidate's
just-completed mock interview. Generate a structured summary they can use
to improve. Your tone is direct, specific, and constructive — not vague
or congratulatory. Cite concrete moments from the transcript.`;

const SCHEMA_HINT = `Output schema (JSON, strict):
{
  "overall_score":      number 1-10 (be calibrated, not generous),
  "overall_assessment": 2-3 sentence holistic verdict,
  "framework_used":     the framework's display name (e.g. "CIRCLES Method"),
  "stages_completed":   integer — how many stages of the framework the candidate substantively covered,
  "stages_total":       integer — total stages in that framework,
  "strengths":          array (1-5) of { title: ≤6 words, detail: 1 sentence },
  "improvements":       array (1-5) of { title: ≤6 words, detail: 1 sentence },
  "next_steps":         array (1-5) of concrete practice suggestions (≤25 words each)
}`;

const RULES = `Rules:
1. Calibrate the score to the candidate's seniority. A 7/10 for a PM is
   not the same as 7/10 for a Staff PM — adjust expectations.
2. "Strengths" and "improvements" should reference what the candidate
   actually said, ideally near-quoting them. Avoid generic feedback.
3. "next_steps" are practice suggestions, not restating the improvements.
   Example: "Practice estimation walkthroughs out loud with a timer" —
   not "Improve your estimation."
4. If the transcript is very short (<5 turns) or has no real content,
   still emit valid JSON — score 1-3, assessment notes the brevity,
   findings note the limited signal.
5. Frame the assessment as feedback TO the candidate, not commentary
   ABOUT them. Second person ("you" / "your"), not third ("the candidate").`;

interface SummaryPromptInputs {
  seniority?: SeniorityId;
  frameworkName?: string;
  questionType?: string;
  stagesTotal?: number;
  stagesCovered?: number;
}

export function buildSummarySystemPrompt(inputs: SummaryPromptInputs = {}): string {
  const sections: string[] = [ROLE, SCHEMA_HINT, RULES];

  const ctxLines: string[] = [];
  if (inputs.seniority) {
    ctxLines.push(`Candidate seniority: ${SENIORITY_LABELS[inputs.seniority]}`);
  }
  if (inputs.frameworkName) {
    ctxLines.push(`Framework worked in: ${inputs.frameworkName}`);
  }
  if (inputs.questionType) {
    ctxLines.push(`Question type: ${inputs.questionType}`);
  }
  if (inputs.stagesTotal && inputs.stagesCovered != null) {
    ctxLines.push(
      `Coach observed ${inputs.stagesCovered}/${inputs.stagesTotal} stages substantively covered.`
    );
  }
  if (ctxLines.length > 0) {
    sections.push(`Session context:\n${ctxLines.join('\n')}`);
  }

  return sections.join('\n\n----\n\n');
}
