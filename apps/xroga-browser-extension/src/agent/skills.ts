// Playbooks for the model, picked from the request. A run gets only the few that fit its words, once, in its system prompt: the same
// text on every turn, so the provider's prefix cache keeps working, and nothing a task does not need. They are instructions for how to
// work with the tools the run already has; they add no tool, no model and no extra model call.

export interface Skill {
  id: string;
  /** Matched against the user's request. */
  when: (request: string) => boolean;
  body: string;
}

const has = (re: RegExp) => (request: string) => re.test(request);
const steps = (request: string) => (request.match(/\b(?:then|after that|afterwards|next|finally|first|second|third|step \d|\d\.)\b/gi) ?? []).length;

export const SKILLS: Skill[] = [
  {
    id: 'long-task',
    when: request => request.length > 400 || steps(request) >= 3,
    body: [
      'Long or multi-step task:',
      '- Start by writing a short numbered plan in your first reply (3 to 8 lines) and keep to it. Name what a finished result looks like.',
      '- Work one step at a time. After each step, check its result on the page, then move on. Say in one line which step is done.',
      '- Never repeat an action whose result you already saw. If an action had no effect, change the approach (another control, another page) instead of retrying it.',
      '- If a step is blocked (a login, a code, a captcha, a missing permission), ask the user once for exactly that, then continue with the steps that do not depend on it.',
      '- Finish with done only when every step is verified; otherwise say which steps are done and which are not.',
    ].join('\n'),
  },
  {
    id: 'research',
    when: has(/\b(?:research|compare|comparison|competitors?|alternatives|top \d+|best \d+|several (?:sites|websites|pages)|multiple (?:sites|websites|pages)|across (?:sites|websites)|each (?:site|website|page)|list of)\b/i),
    body: [
      'Research across sites:',
      '- Open each source with tabs open (or navigate), read it with read, and write down what you found before opening the next. Keep the page address with each finding.',
      '- Prefer official pages. If two sources disagree, say so and give both addresses.',
      '- Read only what the question needs: use find or a targeted read instead of the whole page when the page is long.',
      '- Finish with a compact comparison (a table when it fits) and the source address for every figure.',
    ].join('\n'),
  },
  {
    id: 'forms',
    when: has(/\b(?:fill|form|enter|submit|register|sign ?up|apply|crm|lead|contact|record|data entry|add (?:a |the )?(?:new )?(?:contact|record|customer|product|entry))\b/i),
    body: [
      'Forms and data entry:',
      '- Read the whole form first. Fill every field with fill_form in one call, with the submit control last, instead of one field per reply.',
      '- Use the exact values the user gave; do not invent values for required fields: ask for them.',
      '- After submitting, read the confirmation or the saved record and compare it with what was entered before you report success.',
    ].join('\n'),
  },
  {
    id: 'dashboards',
    when: has(/\b(?:dashboard|report|reports|analytics|table|filter|sort|export|metrics?|performance|campaigns?|statistics|stats|orders|invoices)\b/i),
    body: [
      'Dashboards and tables:',
      '- Set the date range and filters first, then read the table. Check the filters really applied (the page shows them) before you trust the numbers.',
      '- For long tables, read page by page and stop when you have what you need. Say which range and filters the numbers are for.',
      '- Report numbers exactly as shown, with their units and currency.',
    ].join('\n'),
  },
  {
    id: 'ads',
    when: has(/\b(?:google ads|meta ads|facebook ads|instagram ads|ad campaign|ads manager|ad group|keywords?|audience|budget|conversion|bidding)\b/i),
    body: [
      'Advertising platforms:',
      '- Prepare everything as a draft: campaign type, goal, location, language, budget, ad groups, keywords, ads. Do not publish, enable or start spending.',
      '- Take the business facts only from the user and the business website; never invent claims, prices or results in ad copy.',
      '- When the draft is complete, show the user the settings in a short list and ask for one clear approval before any activation.',
    ].join('\n'),
  },
  {
    id: 'admin',
    when: has(/\b(?:admin|settings|console|cloud (?:run|shell)|dns|database|supabase|vercel|github|repository|deploy|code editor|editor|configuration|config)\b/i),
    body: [
      'Admin consoles and code:',
      '- Read the current state before you change anything and note it, so a change can be reversed.',
      '- Make the smallest change that does the job, then reload or re-read the setting to confirm it saved.',
      '- A production deploy, a deletion or a change to access or security needs the user’s approval first: describe it and wait.',
    ].join('\n'),
  },
  {
    id: 'account',
    when: has(/\b(?:log ?in|sign ?in|my account|my (?:\w+ )?(?:account|dashboard|profile|workspace)|logged in)\b/i),
    body: [
      'Signed-in sites:',
      '- Use the account already signed in in this Chrome profile. Do not type passwords or codes: if a login, an MFA code or a captcha appears, hand it to the user with ask_user and continue after they are done.',
      '- Check you are in the right account or workspace before you act.',
    ].join('\n'),
  },
  {
    id: 'consequential',
    when: has(/\b(?:publish|send|post|buy|purchase|pay|checkout|delete|remove|deploy|activate|launch|go live|book|order)\b/i),
    body: [
      'Actions with outside effects:',
      '- Prepare the action up to the last step, then attempt the final control once so the approval card opens with the exact destination and amount. Do not ask for a separate confirmation in text.',
      '- Do one such action at a time and verify its result before the next.',
    ].join('\n'),
  },
];

const MAX_SKILLS = 4;

/** The playbooks that fit a request, in the order above, at most four. */
export function skillsFor(request: string): Skill[] {
  const text = request.trim();
  if (!text) return [];
  return SKILLS.filter(skill => skill.when(text)).slice(0, MAX_SKILLS);
}

/** The text added to the system prompt, or an empty string when no playbook fits. */
export function skillsSection(request: string): string {
  const picked = skillsFor(request);
  if (!picked.length) return '';
  return `## Playbooks for this task\n\n${picked.map(skill => skill.body).join('\n\n')}`;
}
