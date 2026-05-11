/**
 * Static catalog of PM-interview frameworks.
 *
 * This is the source of truth for stage and cue *text*. The support
 * model only emits IDs + flags; the UI joins them against this catalog
 * to render the stepper. This prevents the model from hallucinating new
 * stages or paraphrasing cue text differently each turn.
 */
import type { FrameworkDef, FrameworkId } from './coach-types';

export const FRAMEWORKS: Record<FrameworkId, FrameworkDef> = {
  CIRCLES: {
    id: 'CIRCLES',
    name: 'CIRCLES Method',
    questionType: 'Product Design',
    stages: [
      {
        id: 'C',
        name: 'Comprehend the situation',
        description: 'Pin down platform, scope, and goal before designing.',
        defaultCues: [
          { id: 'C.1', text: 'Asked about the platform / medium (web, mobile, etc.)' },
          { id: 'C.2', text: 'Clarified the timeframe or scope' },
          { id: 'C.3', text: 'Stated assumptions explicitly' },
          { id: 'C.4', text: 'Confirmed the underlying goal (engagement, growth, revenue)' },
        ],
      },
      {
        id: 'I',
        name: 'Identify the customer',
        description: 'Pick a specific persona to design for.',
        defaultCues: [
          { id: 'I.1', text: 'Listed 2-3 candidate user segments' },
          { id: 'I.2', text: 'Picked one persona to focus on' },
          { id: 'I.3', text: 'Described their context of use' },
        ],
      },
      {
        id: 'R',
        name: 'Report needs & pain points',
        description: 'Surface unmet needs for that persona.',
        defaultCues: [
          { id: 'R.1', text: 'Listed at least 3 distinct needs / pain points' },
          { id: 'R.2', text: 'Distinguished functional vs emotional vs social needs' },
          { id: 'R.3', text: 'Tied needs back to the persona' },
        ],
      },
      {
        id: 'P',
        name: 'Cut through prioritization',
        description: 'Pick the top need(s) to address.',
        defaultCues: [
          {
            id: 'P.1',
            text: 'Stated explicit prioritization criteria (impact, frequency, severity)',
          },
          { id: 'P.2', text: 'Picked top 1-2 needs to focus on' },
          { id: 'P.3', text: 'Justified the choice' },
        ],
      },
      {
        id: 'L',
        name: 'List solutions',
        description: 'Brainstorm a diverse set of solutions.',
        defaultCues: [
          { id: 'L.1', text: 'Generated 3+ distinct solution ideas' },
          { id: 'L.2', text: 'Showed range (incremental, ambitious, lateral)' },
          { id: 'L.3', text: 'Briefly described how each works' },
        ],
      },
      {
        id: 'E',
        name: 'Evaluate trade-offs',
        description: 'Compare solutions on impact and effort.',
        defaultCues: [
          { id: 'E.1', text: 'Named pros and cons for each solution' },
          { id: 'E.2', text: 'Considered effort vs impact' },
          { id: 'E.3', text: 'Flagged risks or unintended consequences' },
        ],
      },
      {
        id: 'S',
        name: 'Summarize recommendation',
        description: 'Pick one and justify it crisply.',
        defaultCues: [
          { id: 'S.1', text: 'Picked one solution clearly' },
          { id: 'S.2', text: 'Justified using earlier trade-offs' },
          { id: 'S.3', text: 'Defined success metrics' },
        ],
      },
    ],
  },

  IMPROVE: {
    id: 'IMPROVE',
    name: 'Diagnose → Prioritize → Solve',
    questionType: 'Product Improvement',
    stages: [
      {
        id: 'G',
        name: 'Goal & metric',
        description: 'Define what "improve" means and pick a north-star metric.',
        defaultCues: [
          { id: 'G.1', text: 'Clarified the goal (engagement, retention, revenue)' },
          { id: 'G.2', text: 'Picked one north-star metric to optimize' },
          { id: 'G.3', text: 'Stated time horizon for the improvement' },
        ],
      },
      {
        id: 'D',
        name: 'Diagnose',
        description: 'Walk the user funnel and segment to find the gap.',
        defaultCues: [
          { id: 'D.1', text: 'Mapped the user funnel or journey' },
          { id: 'D.2', text: 'Segmented users (new vs returning, power vs casual)' },
          { id: 'D.3', text: 'Identified where the metric is underperforming' },
        ],
      },
      {
        id: 'B',
        name: 'Brainstorm solutions',
        description: 'Generate 3+ ideas across different parts of the funnel.',
        defaultCues: [
          { id: 'B.1', text: 'Generated at least 3 distinct ideas' },
          { id: 'B.2', text: 'Spanned different parts of the funnel' },
          { id: 'B.3', text: 'Considered non-product levers (pricing, GTM, support)' },
        ],
      },
      {
        id: 'P',
        name: 'Prioritize (RICE)',
        description: 'Score top ideas on Reach, Impact, Confidence, Effort.',
        defaultCues: [
          { id: 'P.1', text: 'Estimated Reach for top ideas' },
          { id: 'P.2', text: 'Estimated Impact and Confidence' },
          { id: 'P.3', text: 'Estimated Effort and computed RICE score' },
          { id: 'P.4', text: 'Picked top 1-2 by RICE' },
        ],
      },
      {
        id: 'R',
        name: 'Recommend & trade-offs',
        description: 'State the call clearly and acknowledge risks.',
        defaultCues: [
          { id: 'R.1', text: 'Stated the recommendation clearly' },
          { id: 'R.2', text: 'Acknowledged risks and counter-arguments' },
          { id: 'R.3', text: 'Defined how to measure success' },
        ],
      },
    ],
  },

  FUNNEL: {
    id: 'FUNNEL',
    name: 'Top-down Funnel',
    questionType: 'Estimation / Market sizing',
    stages: [
      {
        id: 'C',
        name: 'Clarify scope & assumptions',
        description: 'Pin down geography, timeframe, and unit before estimating.',
        defaultCues: [
          { id: 'C.1', text: 'Asked about geography (US, global, etc.)' },
          { id: 'C.2', text: 'Asked about timeframe (per day, per year)' },
          { id: 'C.3', text: 'Asked about the unit (revenue, users, transactions)' },
          { id: 'C.4', text: 'Stated assumptions explicitly out loud' },
        ],
      },
      {
        id: 'P',
        name: 'Population',
        description: 'Start from a known round-number population.',
        defaultCues: [
          { id: 'P.1', text: 'Picked a starting population (e.g. US adults)' },
          { id: 'P.2', text: 'Used a reasonable round number with rationale' },
        ],
      },
      {
        id: 'F',
        name: 'Apply filters',
        description: 'Multiply by penetration × frequency to get to use volume.',
        defaultCues: [
          { id: 'F.1', text: 'Applied penetration filter (% of population that uses)' },
          { id: 'F.2', text: 'Applied frequency filter (uses per period)' },
          { id: 'F.3', text: 'Adjusted for relevant segments' },
        ],
      },
      {
        id: 'M',
        name: 'Multiply by unit value',
        description: 'Convert volume into the target unit (revenue / size).',
        defaultCues: [
          { id: 'M.1', text: 'Multiplied by per-unit revenue or size' },
          { id: 'M.2', text: 'Stated the final number with units' },
        ],
      },
      {
        id: 'S',
        name: 'Sanity check',
        description: 'Compare to a known reference and flag unrealistic results.',
        defaultCues: [
          { id: 'S.1', text: 'Compared to a known reference (e.g. competitor revenue)' },
          { id: 'S.2', text: 'Flagged whether the result is reasonable' },
        ],
      },
    ],
  },

  ISSUE_TREE: {
    id: 'ISSUE_TREE',
    name: 'Internal/External Issue Tree',
    questionType: 'Root Cause Analysis',
    stages: [
      {
        id: 'M',
        name: 'Understand the metric',
        description: 'Pin down exactly what dropped, by how much, for whom.',
        defaultCues: [
          { id: 'M.1', text: 'Clarified what metric dropped & by how much' },
          { id: 'M.2', text: 'Asked about timeframe of the drop' },
          { id: 'M.3', text: 'Asked about breadth (specific segment, geography, all users?)' },
        ],
      },
      {
        id: 'E',
        name: 'External factors',
        description: 'Rule out causes outside the company.',
        defaultCues: [
          { id: 'E.1', text: 'Considered seasonality / holidays' },
          { id: 'E.2', text: 'Considered competitor moves' },
          { id: 'E.3', text: 'Considered macro trends or news events' },
        ],
      },
      {
        id: 'I',
        name: 'Internal factors',
        description: 'Walk through product, ops, marketing, data.',
        defaultCues: [
          { id: 'I.1', text: 'Considered recent product launches or changes' },
          { id: 'I.2', text: 'Considered ops / data-pipeline issues' },
          { id: 'I.3', text: 'Considered marketing or pricing changes' },
        ],
      },
      {
        id: 'H',
        name: 'Hypothesize',
        description: 'Narrow to 2-3 most likely causes.',
        defaultCues: [
          { id: 'H.1', text: 'Narrowed down to 2-3 most likely causes' },
          { id: 'H.2', text: 'Stated each hypothesis precisely' },
        ],
      },
      {
        id: 'V',
        name: 'Verify with data',
        description: 'Propose specific cuts that would confirm or refute.',
        defaultCues: [
          { id: 'V.1', text: 'Proposed specific data cuts to confirm' },
          { id: 'V.2', text: 'Identified A/B comparisons or cohort splits' },
        ],
      },
      {
        id: 'R',
        name: 'Recommend fix',
        description: 'Distinguish short-term mitigation from long-term fix.',
        defaultCues: [
          { id: 'R.1', text: 'Proposed concrete next steps' },
          { id: 'R.2', text: 'Distinguished short-term mitigation from long-term fix' },
        ],
      },
    ],
  },

  STAR: {
    id: 'STAR',
    name: 'STAR Method',
    questionType: 'Behavioral',
    stages: [
      {
        id: 'S',
        name: 'Situation',
        description: 'Set the context: company, role, team.',
        defaultCues: [
          { id: 'S.1', text: 'Set context: company, team, role' },
          { id: 'S.2', text: 'Identified the specific situation' },
        ],
      },
      {
        id: 'T',
        name: 'Task',
        description: 'Articulate what was expected of you specifically.',
        defaultCues: [
          { id: 'T.1', text: 'Stated their personal responsibility' },
          { id: 'T.2', text: 'Defined constraints, stakes, or deadline' },
        ],
      },
      {
        id: 'A',
        name: 'Action',
        description: 'Describe what YOU did and why.',
        defaultCues: [
          { id: 'A.1', text: 'Described what they personally did (not the team)' },
          { id: 'A.2', text: 'Showed reasoning behind decisions' },
          { id: 'A.3', text: 'Acknowledged trade-offs they made' },
        ],
      },
      {
        id: 'R',
        name: 'Result',
        description: 'Quantify the outcome and business / user impact.',
        defaultCues: [
          { id: 'R.1', text: 'Quantified the outcome where possible' },
          { id: 'R.2', text: 'Specified business or user impact' },
        ],
      },
      {
        id: 'F',
        name: 'Reflection',
        description: 'Show learning and self-awareness.',
        defaultCues: [
          { id: 'F.1', text: 'Shared what they learned' },
          { id: 'F.2', text: "Noted what they'd do differently" },
        ],
      },
    ],
  },

  '3C4P': {
    id: '3C4P',
    name: "3C's + 4P's",
    questionType: 'Strategy / GTM',
    stages: [
      {
        id: 'CUS',
        name: 'Customer',
        description: 'Define target segments and their needs.',
        defaultCues: [
          { id: 'CUS.1', text: 'Defined target customer segment(s)' },
          { id: 'CUS.2', text: 'Articulated their needs / jobs-to-be-done' },
        ],
      },
      {
        id: 'CMP',
        name: 'Company',
        description: 'Identify relevant strengths and constraints.',
        defaultCues: [
          { id: 'CMP.1', text: 'Identified relevant strengths / capabilities' },
          { id: 'CMP.2', text: 'Acknowledged constraints (resources, brand, channel)' },
        ],
      },
      {
        id: 'RIV',
        name: 'Competition',
        description: 'Map direct + indirect competitors and find a defensible angle.',
        defaultCues: [
          { id: 'RIV.1', text: 'Named direct + indirect competitors' },
          { id: 'RIV.2', text: 'Found a defensible angle / differentiator' },
        ],
      },
      {
        id: 'PRD',
        name: 'Product',
        description: 'Define the offering and positioning.',
        defaultCues: [
          { id: 'PRD.1', text: 'Defined the offering (key features)' },
          { id: 'PRD.2', text: 'Stated the positioning' },
        ],
      },
      {
        id: 'PRC',
        name: 'Price',
        description: 'Pick a pricing model with rationale.',
        defaultCues: [
          { id: 'PRC.1', text: 'Picked a pricing model' },
          { id: 'PRC.2', text: 'Justified the price point' },
        ],
      },
      {
        id: 'PLC',
        name: 'Place',
        description: 'Define distribution channels.',
        defaultCues: [
          { id: 'PLC.1', text: 'Defined distribution / channels' },
          { id: 'PLC.2', text: 'Considered direct vs partner channels' },
        ],
      },
      {
        id: 'PRM',
        name: 'Promotion',
        description: 'Outline the launch / GTM motion.',
        defaultCues: [
          { id: 'PRM.1', text: 'Outlined go-to-market launch plan' },
          { id: 'PRM.2', text: 'Identified key marketing channels' },
        ],
      },
    ],
  },

  AARRR: {
    id: 'AARRR',
    name: 'AARRR Pirate Metrics',
    questionType: 'Metrics design',
    stages: [
      {
        id: 'ACQ',
        name: 'Acquisition',
        description: 'How users find and arrive at the product.',
        defaultCues: [
          { id: 'ACQ.1', text: 'Identified primary acquisition channels' },
          { id: 'ACQ.2', text: 'Picked an acquisition metric (visits, signups)' },
        ],
      },
      {
        id: 'ACT',
        name: 'Activation',
        description: 'First "aha" moment that proves value.',
        defaultCues: [
          { id: 'ACT.1', text: 'Defined the activation event' },
          { id: 'ACT.2', text: 'Picked an activation rate metric' },
        ],
      },
      {
        id: 'RET',
        name: 'Retention',
        description: 'Users coming back over time.',
        defaultCues: [
          { id: 'RET.1', text: 'Picked a retention window (D1 / D7 / D30)' },
          { id: 'RET.2', text: 'Distinguished new-user vs returning retention' },
        ],
      },
      {
        id: 'REF',
        name: 'Referral',
        description: 'Users bringing in other users.',
        defaultCues: [
          { id: 'REF.1', text: 'Defined the viral loop (k-factor or referral rate)' },
          { id: 'REF.2', text: 'Identified referral mechanics' },
        ],
      },
      {
        id: 'REV',
        name: 'Revenue',
        description: 'Monetization metrics.',
        defaultCues: [
          { id: 'REV.1', text: 'Picked a revenue metric (ARPU, LTV)' },
          { id: 'REV.2', text: 'Tied revenue back to upstream metrics' },
        ],
      },
    ],
  },

  HEART: {
    id: 'HEART',
    name: 'HEART Framework',
    questionType: 'UX metrics / quality',
    stages: [
      {
        id: 'H',
        name: 'Happiness',
        description: 'Subjective user satisfaction.',
        defaultCues: [
          { id: 'H.1', text: 'Picked a happiness metric (NPS, CSAT, app rating)' },
          { id: 'H.2', text: 'Defined how it would be measured' },
        ],
      },
      {
        id: 'E',
        name: 'Engagement',
        description: 'Depth and frequency of interaction.',
        defaultCues: [
          { id: 'E.1', text: 'Picked engagement metric(s) (session length, actions per visit)' },
          { id: 'E.2', text: 'Considered DAU / WAU / MAU' },
        ],
      },
      {
        id: 'A',
        name: 'Adoption',
        description: 'New users picking up the feature.',
        defaultCues: [
          { id: 'A.1', text: 'Defined adoption (new users using the feature)' },
          { id: 'A.2', text: 'Distinguished from overall growth' },
        ],
      },
      {
        id: 'R',
        name: 'Retention',
        description: 'Users continuing to come back.',
        defaultCues: [
          { id: 'R.1', text: 'Picked a retention metric for the feature' },
          { id: 'R.2', text: 'Picked a meaningful retention window' },
        ],
      },
      {
        id: 'T',
        name: 'Task success',
        description: 'Did the user complete what they came to do?',
        defaultCues: [
          { id: 'T.1', text: 'Defined a task / completion metric' },
          { id: 'T.2', text: 'Considered error rate or time-to-complete' },
        ],
      },
    ],
  },

  PORTERS: {
    id: 'PORTERS',
    name: "Porter's 5 Forces",
    questionType: 'Competitive analysis',
    stages: [
      {
        id: 'RIV',
        name: 'Industry rivalry',
        description: 'Intensity of competition between existing players.',
        defaultCues: [
          { id: 'RIV.1', text: 'Identified the major existing players' },
          { id: 'RIV.2', text: 'Assessed how intensely they compete (price, features)' },
        ],
      },
      {
        id: 'NEW',
        name: 'Threat of new entrants',
        description: 'Barriers to entry for would-be competitors.',
        defaultCues: [
          { id: 'NEW.1', text: 'Identified barriers to entry (capital, network effects, IP)' },
          { id: 'NEW.2', text: 'Assessed whether new entrants are likely' },
        ],
      },
      {
        id: 'SUB',
        name: 'Threat of substitutes',
        description: 'Adjacent products that solve the same need.',
        defaultCues: [
          { id: 'SUB.1', text: 'Named substitute products / alternatives' },
          { id: 'SUB.2', text: 'Assessed how easily users switch to substitutes' },
        ],
      },
      {
        id: 'BUY',
        name: 'Buyer power',
        description: 'How much leverage customers have.',
        defaultCues: [
          { id: 'BUY.1', text: 'Assessed buyer concentration (few big or many small?)' },
          { id: 'BUY.2', text: 'Assessed switching cost for buyers' },
        ],
      },
      {
        id: 'SUP',
        name: 'Supplier power',
        description: 'How much leverage upstream vendors have.',
        defaultCues: [
          { id: 'SUP.1', text: 'Identified key suppliers / inputs' },
          { id: 'SUP.2', text: 'Assessed supplier concentration / switching cost' },
        ],
      },
    ],
  },
};

/** All framework IDs in display order. */
export const FRAMEWORK_IDS: FrameworkId[] = [
  'CIRCLES',
  'IMPROVE',
  'FUNNEL',
  'ISSUE_TREE',
  'STAR',
  '3C4P',
  'AARRR',
  'HEART',
  'PORTERS',
];

/** Type-safe lookup that throws on unknown IDs. */
export function getFramework(id: FrameworkId): FrameworkDef {
  const fw = FRAMEWORKS[id];
  if (!fw) throw new Error(`Unknown framework id: ${id}`);
  return fw;
}

/** Returns the set of all valid cue IDs for a given framework. */
export function getValidCueIds(id: FrameworkId): Set<string> {
  const fw = getFramework(id);
  const ids = new Set<string>();
  for (const stage of fw.stages) {
    for (const cue of stage.defaultCues) ids.add(cue.id);
  }
  return ids;
}

/** Returns the set of all valid stage IDs for a given framework. */
export function getValidStageIds(id: FrameworkId): Set<string> {
  return new Set(getFramework(id).stages.map((s) => s.id));
}
