// Playbooks for the model, picked from the request. A run gets only the few that fit its words, once, in its system prompt: the same
// text on every turn, so the provider's prefix cache keeps working, and nothing a task does not need. They are Xroga's own written
// instructions for working with the tools the run already has; they add no tool, no model and no extra model call.

export interface Skill {
  id: string;
  /** Matched against the user's request. */
  when: (request: string) => boolean;
  body: string;
}

const has = (re: RegExp) => (request: string) => re.test(request);
const stepWords = (request: string) =>
  (request.match(/\b(?:then|after that|afterwards|next|finally|first|second|third|step \d|\d\.)\b/gi) ?? []).length;

/** Domain playbooks come first, so a four-playbook limit keeps the most specific ones. */
export const SKILLS: Skill[] = [
  {
    id: 'google-ads',
    when: has(/\b(?:google ads|adwords|search campaign|performance max|pmax|ad group|negative keywords?|search terms|quality score|keyword planner)\b/i),
    body: [
      'Google Ads:',
      '- First read the account as it is: the campaign list with type, status, budget and cost, the conversion actions, and the search terms report. Say what you found before you build anything.',
      '- A Search campaign needs: one clear goal, location and language targeting that match the business, a daily budget the user gave, a bidding strategy suited to the available conversion data, ad groups with one intent each, keywords with sensible match types, negative keywords, responsive ads written only from facts on the business website, and extensions (sitelinks, call, callouts).',
      '- Check conversion tracking is set up and counting before you recommend a conversion bidding strategy.',
      '- Build everything as a draft or paused. Never enable a campaign or raise a budget: show the user the settings and ask for one approval first.',
    ].join('\n'),
  },
  {
    id: 'meta-ads',
    when: has(/\b(?:meta ads|facebook ads|instagram ads|ads manager|ad set|lookalike|custom audience|meta pixel|conversions api|boosted post)\b/i),
    body: [
      'Meta Ads Manager:',
      '- Check the right ad account, Page and pixel are selected before you start, and read existing campaigns so you do not duplicate them.',
      '- Structure: campaign (objective that matches the business goal), ad set (audience, placements, budget and schedule), ad (creative, text, destination URL). Take every claim in the ad text from the business website or the user.',
      '- Confirm the pixel or conversion event fires for the chosen objective. Keep targeting within what the user described.',
      '- Leave the campaign in draft or paused. Publishing or spending needs one explicit approval after you show the settings.',
    ].join('\n'),
  },
  {
    id: 'cloud',
    when: has(/\b(?:google cloud|cloud run|cloud shell|gcloud|cloud console|cloud build|artifact registry|iam|service account|aws console|azure portal|kubernetes|docker)\b/i),
    body: [
      'Cloud consoles:',
      '- Confirm the project, region and service on screen before you act, and note the current revision, image and settings so a change can be reversed.',
      '- Read first: services, revisions, traffic split, logs and errors. Diagnose from the logs before changing configuration.',
      '- In a cloud shell, run one command at a time, read its output, and copy values exactly. Prefer read-only commands (describe, list, logs) until you know the change to make.',
      '- A new revision with live traffic, an IAM or security change, a deletion, or anything that adds cost needs the user’s approval first. Prefer a tagged revision that takes no traffic for testing.',
    ].join('\n'),
  },
  {
    id: 'database',
    when: has(/\b(?:database|supabase|postgres|sql editor|table editor|migration|schema|rows?|query|firebase|mongodb|bigquery)\b/i),
    body: [
      'Databases:',
      '- Look before you change: open the table list and the schema, and run a read-only query (select with a limit) to see real rows.',
      '- Write the smallest statement that does the job and say what it will change. Run an update or delete only with a where clause that you have checked with a select first.',
      '- Do not drop, truncate or delete data, change access rules or touch production data without the user’s approval. Use a copy or a staging project when the user has one.',
      '- After a change, run a select that proves it, and report the row counts.',
    ].join('\n'),
  },
  {
    id: 'code',
    when: has(/\b(?:code|coding|source|repository|repo|pull request|commit|branch|github|gitlab|editor|vs ?code|function|bug|fix the|refactor|script|api|endpoint|html|css|javascript|typescript|python)\b/i),
    body: [
      'Code in the browser:',
      '- Read the relevant files before editing and find the cause, not just the symptom. Make the smallest change that fixes it and keep the existing style.',
      '- In a web editor, click into the editor, select the exact lines, and type the new text. Then read the file back to confirm the edit landed, and check the editor shows no syntax errors.',
      '- Run the available checks (tests, build, preview) and read their results. Do not say it works until a check or a test of the real behaviour shows it.',
      '- Commit or deploy only when asked; a production deploy needs the user’s approval first.',
    ].join('\n'),
  },
  {
    id: 'debugging',
    when: has(/\b(?:debug|broken|not working|doesn.t work|isn.t working|error|errors|failing|fails|failed|crash|bug|issue|problem|why (?:is|does|did)|slow|timeout)\b/i),
    body: [
      'Debugging:',
      '- Reproduce the problem first and write down exactly what happens and what should happen.',
      '- Narrow it down: change one thing at a time, and note what each check rules out. Read error messages and logs in full; the cause is often in the first error.',
      '- Fix the cause with the smallest change, then repeat the original steps to prove the problem is gone and nothing next to it broke.',
      '- Report the cause, the fix and the proof in a few lines. If you cannot reproduce it, say so and say what you tried.',
    ].join('\n'),
  },
  {
    id: 'long-task',
    when: request => request.length > 400 || stepWords(request) >= 3,
    body: [
      'Long or multi-step task:',
      '- Write a short numbered plan in your first reply (3 to 8 lines) and keep to it. Name what a finished result looks like.',
      '- Work one step at a time. Check each step’s result once, then move on. Do not re-read a page you already read or re-check a step you already verified.',
      '- If an action had no effect, change the approach (another control, another page) instead of repeating it.',
      '- When several things are independent (for example reading different sites), open them together and read them together in one reply instead of one per reply.',
      '- If a step is blocked (a login, a code, a captcha, a missing permission), ask the user once for exactly that, then continue with the steps that do not depend on it.',
      '- Finish with done when every step is verified; otherwise say which steps are done and which are not.',
    ].join('\n'),
  },
  {
    id: 'research',
    when: has(/\b(?:research|compare|comparison|competitors?|alternatives|top \d+|best \d+|several (?:sites|websites|pages)|multiple (?:sites|websites|pages)|across (?:sites|websites)|each (?:site|website|page)|list of|leads?|prospects?)\b/i),
    body: [
      'Research across sites:',
      '- Open all the sources you need in tabs in one reply, then read them together, and write down what you found with each page address.',
      '- Prefer official pages. If two sources disagree, say so and give both addresses.',
      '- Read only what the question needs: use find or a targeted read when a page is long.',
      '- Finish with a compact comparison (a table when it fits) and the source address for every figure. Remove duplicates before you report.',
    ].join('\n'),
  },
  {
    id: 'forms',
    when: has(/\b(?:fill|form|enter|submit|register|sign ?up|apply|crm|lead|contact|record|data entry|add (?:a |the )?(?:new )?(?:contact|record|customer|product|entry))\b/i),
    body: [
      'Forms and data entry:',
      '- Read the whole form first. Fill every field with fill_form in one call, with the submit control last, instead of one field per reply.',
      '- Use the exact values the user gave; do not invent values for required fields: ask for them.',
      '- After submitting, read the confirmation or the saved record once and compare it with what was entered before you report success.',
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
      '- Do one such action at a time and verify its result once before the next.',
    ].join('\n'),
  },
];

const MAX_SKILLS = 4;

/**
 * The playbooks that fit a request: the long-task one whenever it matches, then the most specific others in the order above, at
 * most four in all.
 */
export function skillsFor(request: string): Skill[] {
  const text = request.trim();
  if (!text) return [];
  const matched = SKILLS.filter(skill => skill.when(text));
  const long = matched.find(skill => skill.id === 'long-task');
  const others = matched.filter(skill => skill.id !== 'long-task').slice(0, long ? MAX_SKILLS - 1 : MAX_SKILLS);
  return SKILLS.filter(skill => skill === long || others.includes(skill));
}

/** The text added to the system prompt, or an empty string when no playbook fits. */
export function skillsSection(request: string): string {
  const picked = skillsFor(request);
  if (!picked.length) return '';
  return `## Playbooks for this task\n\n${picked.map(skill => skill.body).join('\n\n')}`;
}
