/**
 * Career DNA scenarios.
 *
 * Design rule: the user is NEVER asked for a job title. Every question asks
 * about behaviour, preference, context or reaction — the answers reveal
 * strengths and constraints without priming a specific occupation.
 */

export const SCENARIOS = [
  {
    id: 's01',
    dimension: 'motivation',
    prompt:
      'You have a free weekend and no obligations. What is the first thing you do with it?',
    options: [
      { id: 'a', label: 'Fix or improve something that was bothering me', tags: { fixing: 2, analysis: 1 } },
      { id: 'b', label: 'Learn something entirely new from scratch', tags: { learning: 2, exploration: 1 } },
      { id: 'c', label: 'Organise a plan and get ahead of things', tags: { organising: 2, structure: 1 } },
      { id: 'd', label: 'Make something with my hands and see how it works', tags: { making: 2, spatial: 1 } },
      { id: 'e', label: 'Be with people and talk things through', tags: { social: 2, empathy: 1 } },
    ],
  },
  {
    id: 's02',
    dimension: 'working_style',
    prompt:
      'A project stalls halfway through. What usually happens next in your head?',
    options: [
      { id: 'a', label: 'I dig in and find the real cause', tags: { analysis: 2, persistence: 1 } },
      { id: 'b', label: 'I get bored and look for a different idea', tags: { creativity: 2, flexibility: 1 } },
      { id: 'c', label: 'I make a list and work through it methodically', tags: { structure: 2, discipline: 1 } },
      { id: 'd', label: 'I ask someone else for a second opinion', tags: { collaboration: 2, social: 1 } },
      { id: 'e', label: 'I stay motivated because the outcome matters to me', tags: { persistence: 2, motivation: 1 } },
    ],
  },
  {
    id: 's03',
    dimension: 'strengths',
    prompt:
      'Which compliment lands hardest when someone gives it to you?',
    options: [
      { id: 'a', label: '"You explain things clearly."', tags: { communication: 2, clarity: 1 } },
      { id: 'b', label: '"You get it done."', tags: { execution: 2, reliability: 1 } },
      { id: 'c', label: '"You notice what others miss."', tags: { insight: 2, analysis: 1 } },
      { id: 'd', label: '"You make people feel included."', tags: { empathy: 2, social: 1 } },
      { id: 'e', label: '"You build things that work."', tags: { making: 2, systems: 1 } },
    ],
  },
  {
    id: 's04',
    dimension: 'constraints',
    prompt:
      'Think about your ideal working week. Which of these is closest to true?',
    options: [
      { id: 'a', label: 'Quiet, deep focus for long stretches', tags: { focus: 2, solitude: 1 } },
      { id: 'b', label: 'A steady rhythm with clear milestones', tags: { structure: 2, predictability: 1 } },
      { id: 'c', label: 'Constant variety and new problems', tags: { variety: 2, adaptability: 1 } },
      { id: 'd', label: 'Lots of back-and-forth with people', tags: { collaboration: 2, social: 1 } },
      { id: 'e', label: 'I care more about the work than the hours', tags: { autonomy: 2, intensity: 1 } },
    ],
  },
  {
    id: 's05',
    dimension: 'environment',
    prompt: 'Where do you do your best work?',
    options: [
      { id: 'a', label: 'Somewhere quiet, on my own screen', tags: { focus: 2, solitary: 1 } },
      { id: 'b', label: 'A busy team space with lots of noise', tags: { energy: 2, collaboration: 1 } },
      { id: 'c', label: 'Out in the field, close to the real thing', tags: { handsOn: 2, practical: 1 } },
      { id: 'd', label: 'A mix — part focused, part collaborative', tags: { balance: 2, adaptability: 1 } },
      { id: 'e', label: 'Anywhere with a clear problem to solve', tags: { flexibility: 2, autonomy: 1 } },
    ],
  },
  {
    id: 's06',
    dimension: 'values',
    prompt:
      'Two roles pay the same. One is high-status and competitive; the other solves a visible problem for people. Which pulls you?',
    options: [
      { id: 'a', label: 'The one that solves a visible problem', tags: { impact: 2, empathy: 1 } },
      { id: 'b', label: 'The one with more status and prestige', tags: { ambition: 2, recognition: 1 } },
      { id: 'c', label: 'The one that leaves more time for my own life', tags: { balance: 2, wellbeing: 1 } },
      { id: 'd', label: 'The one with the better team', tags: { collaboration: 2, belonging: 1 } },
      { id: 'e', label: 'It depends on whether the problem interests me', tags: { curiosity: 2, autonomy: 1 } },
    ],
  },
  {
    id: 's07',
    dimension: 'learning',
    prompt: 'You have to learn a new tool this week. How do you approach it?',
    options: [
      { id: 'a', label: 'Read the documentation end to end', tags: { systematic: 2, analysis: 1 } },
      { id: 'b', label: 'Break it and see what happens', tags: { experimentation: 2, making: 1 } },
      { id: 'c', label: 'Watch someone else do it first', tags: { modelling: 2, social: 1 } },
      { id: 'd', label: 'Search for what others got wrong', tags: { critical: 2, analysis: 1 } },
      { id: 'e', label: 'Only the part I need for today', tags: { pragmatic: 2, focus: 1 } },
    ],
  },
  {
    id: 's08',
    dimension: 'pressure',
    prompt: 'Something goes wrong that is not your fault. How do you respond?',
    options: [
      { id: 'a', label: 'I stay calm and work the problem', tags: { composure: 2, reliability: 1 } },
      { id: 'b', label: 'I escalate quickly so it gets handled', tags: { advocacy: 2, communication: 1 } },
      { id: 'c', label: 'I get frustrated and need a break', tags: { selfAwareness: 2, wellbeing: 1 } },
      { id: 'd', label: 'I document everything so nobody gets blamed', tags: { detail: 2, structure: 1 } },
      { id: 'e', label: 'I adapt and move on', tags: { flexibility: 2, resilience: 1 } },
    ],
  },
  {
    id: 's09',
    dimension: 'collaboration',
    prompt: 'You must give feedback to someone more senior than you. You…',
    options: [
      { id: 'a', label: 'Say it directly and clearly', tags: { candour: 2, communication: 1 } },
      { id: 'b', label: 'Prepare carefully and present the evidence', tags: { evidence: 2, analysis: 1 } },
      { id: 'c', label: 'Pick a quieter moment to talk it through', tags: { empathy: 2, social: 1 } },
      { id: 'd', label: 'Suggest a solution along with the problem', tags: { problemSolving: 2, initiative: 1 } },
      { id: 'e', label: 'Usually I would not push it', tags: { diplomacy: 2, compliance: 1 } },
    ],
  },
  {
    id: 's10',
    dimension: 'ambition',
    prompt: 'In two years, which outcome would make you feel the choice was right?',
    options: [
      { id: 'a', label: 'I am genuinely expert at something hard', tags: { mastery: 2, learning: 1 } },
      { id: 'b', label: 'I led something that mattered', tags: { leadership: 2, impact: 1 } },
      { id: 'c', label: 'I built something of my own', tags: { autonomy: 2, creation: 1 } },
      { id: 'd', label: 'I helped a lot of people get better', tags: { impact: 2, empathy: 1 } },
      { id: 'e', label: 'I have options and choices', tags: { flexibility: 2, ambition: 1 } },
    ],
  },
];

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/** Interest facets used by Career Collision (feature 11). */
export const INTEREST_FACETS = [
  { id: 'technology', label: 'Technology & systems', prompt: 'How do machines, software or systems work?' },
  { id: 'people', label: 'People & communication', prompt: 'How do people behave, and how do you move them?' },
  { id: 'design', label: 'Design & making', prompt: 'How do things get built, shaped or visualised?' },
  { id: 'data', label: 'Data & logic', prompt: 'How do you reason from evidence and numbers?' },
  { id: 'nature', label: 'Nature & physical work', prompt: 'How do you work with land, materials or bodies?' },
  { id: 'words', label: 'Words & ideas', prompt: 'How do you write, teach or explain?' },
  { id: 'business', label: 'Business & money', prompt: 'How do organisations make decisions and money?' },
];

export const PASSPORT_EVIDENCE_TYPES = [
  { id: 'self_reported', label: 'Self-reported', verified: false },
  { id: 'verified', label: 'Verified', verified: true },
];
