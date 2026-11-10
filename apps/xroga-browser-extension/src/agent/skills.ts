// Playbooks for the model, picked from the request. A run gets only the few that fit its words, once, in its system prompt: the same
// text on every turn, so the provider's prefix cache keeps working, and nothing a task does not need. They are Xroga's own written
// instructions: domain knowledge for choosing well, and a method for working with the tools the run already has. They add no tool, no
// model and no extra model call.

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
    when: has(/\b(?:google ads|adwords|search campaign|performance max|pmax|ad group|negative keywords?|search terms|quality score|keyword planner|responsive search ads?)\b/i),
    body: [
      'Google Ads (think like a strategist first, then operate the interface):',
      '- Read the business website and the account first: what is sold, to whom, where, at what price, and how customers contact the business. Read existing campaigns, the conversion actions and the search terms report.',
      '- Pick the campaign type from the business model and goal: a local service that wants calls or enquiries (recovery, repair, clinics, cleaning) uses Search with goal Leads, a call asset, location targeting limited to the service area (presence, not interest) and an ad schedule that matches opening hours; an online store uses Shopping or Performance Max with a Merchant Center feed and goal Sales; B2B or high-ticket leads use Search on high-intent terms and the Leads goal; Demand Gen or Video only when the user asks for awareness.',
      '- Search structure: one intent per ad group (6 to 15 keywords), phrase and exact match first (service + city, near me, emergency terms), broad match only when conversion tracking is reliable. Add negative keywords from the start (free, jobs, DIY, courses, unrelated services).',
      '- Bidding: with under about 30 conversions a month use Maximize Clicks with a CPC cap or manual CPC to gather data, then Maximize Conversions, then target CPA. Set a target CPA from the customer value and margin the user gives, never a guess. Read the expected CPC range in Keyword Planner and tell the user the range; do not promise leads or returns.',
      '- Ads: a responsive search ad with up to 15 headlines (30 characters each) and 4 descriptions (90 characters each): the service, the place, the real offer, proof and a call to action. Add sitelinks, callouts and a call asset. Use only claims found on the business website.',
      '- Before launch confirm a conversion action exists and is counting (calls from ads, form submit, phone click). Use the budget the user gave and say roughly how many clicks it buys at the expected CPC.',
      '- Leave everything as a draft or paused. Show the settings in a short list and ask for one approval before enabling anything or spending.',
    ].join('\n'),
  },
  {
    id: 'meta-ads',
    when: has(/\b(?:meta ads|facebook ads|instagram ads|ads manager|ad set|lookalike|custom audience|meta pixel|facebook pixel|conversions api|events manager|boosted post)\b/i),
    body: [
      'Meta Ads (strategy first, then Ads Manager):',
      '- Read the business and its website: offer, customer, area, price and how it closes sales (website, form, phone, chat). Check the right ad account, Page and Instagram account are selected, and read existing campaigns.',
      '- Choose the objective from the business model: Leads (instant form or website) for services; Sales for online stores with purchase events and, with a product catalog, Advantage+ catalog ads; Engagement or Messages (WhatsApp, Messenger) for businesses that close by chat; Traffic only when no conversion event exists; Awareness only when the user asks.',
      '- Tracking first: in Events Manager create or select the dataset (pixel), install it through the site platform’s integration or the base code, add the Conversions API when the platform offers it, and check PageView, Lead, AddToCart and Purchase with Test events. Do not optimise for a conversion that does not fire.',
      '- Structure: one campaign per objective; one to three ad sets (broad targeting, interests, and a lookalike or custom audience from a customer list or site visitors); two to four ads per ad set with different angles (problem, offer, proof). Local businesses use a location radius around the business. Give each ad set enough daily budget for about 50 optimisation events a week, or merge ad sets.',
      '- Ads: a hook in the first line of the primary text, the offer, proof and one clear call to action; headline up to about 40 characters; the user’s own images or video; a destination that matches the promise. Use only real claims. Declare special ad categories (housing, jobs, credit, politics) when they apply.',
      '- Leave the campaign as a draft or paused. Show the settings and ask for one approval before publishing or spending.',
    ].join('\n'),
  },
  {
    id: 'cloud',
    when: has(/\b(?:google cloud|cloud run|cloud shell|gcloud|cloud console|cloud build|artifact registry|secret manager|iam|service account|aws console|azure portal|kubernetes|docker)\b/i),
    body: [
      'Google Cloud and other cloud consoles:',
      '- Check the project ID in the project picker at the top before anything else, and the region. Menu paths: Cloud Run (service, Revisions, Logs, Metrics, YAML), Cloud Build (History), Artifact Registry, Secret Manager, IAM and Admin, Logging.',
      '- Diagnose before you change: open the service Logs, filter severity ERROR, read the first error with its time; check the latest revision status, container port, environment variable names (never copy secret values), memory, instance limits and the traffic split.',
      '- To change a service use Edit and deploy new revision. Test with a tagged revision that takes no traffic. Moving live traffic, IAM or security changes, deletions and anything that adds cost need the user’s approval first.',
      '- Cloud Shell (terminal icon, top right; Open Editor for files): gcloud config get-value project; gcloud run services list; gcloud run services describe NAME --region REGION; gcloud run revisions list --service NAME; gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 20; gcloud builds list --limit 5. Run read-only commands first and note the current revision so a change can be reversed.',
    ].join('\n'),
  },
  {
    id: 'database',
    when: has(/\b(?:database|supabase|postgres|sql editor|table editor|migration|schema|query|firebase|firestore|mongodb|atlas|bigquery|mysql)\b/i),
    body: [
      'Databases:',
      '- First identify the environment (production or staging) from the project name and address, then look: the table list, the schema, and a few real rows with a read-only select that has a limit.',
      '- Supabase: Table Editor to browse and edit rows; SQL Editor for queries. For a change, write the smallest statement, check its where clause with a select first, run multi-statement changes inside begin and commit, and read the result before committing. Never disable row-level security or widen a policy without approval. Take or confirm a backup before a schema change.',
      '- MongoDB Atlas: Browse Collections, filter with JSON ({"field": "value"}), edit in the document editor, and always limit what you read. Firebase and Firestore: the Data tab, query by field. BigQuery: preview the table and read the bytes-processed estimate before running a large query, because it costs money.',
      '- Drop, truncate, mass delete and changes to production data need the user’s approval. After any change, run a select that proves it and report the row counts.',
    ].join('\n'),
  },
  {
    id: 'shell',
    when: has(/\b(?:shell|terminal|command line|command-line|cli|bash|ssh|run (?:this |the )?commands?|npm |git |gcloud|cloud shell|powershell)\b/i),
    body: [
      'Terminals and shells (Cloud Shell, web terminals, SSH panels):',
      '- Click into the terminal, type one command, press Enter, and wait until the prompt returns before the next. Read the end of the output; for long output pipe it to tail, head or grep.',
      '- Start with pwd, ls and git status to learn where you are. Read exit status (echo $?) for commands that matter and copy values from the output exactly.',
      '- Use --dry-run or a describe or list command before a command that changes things. Never run rm -rf, force pushes, drop or truncate, recursive permission changes, sudo changes, or a command that sends data out, without the user’s approval. Never print or paste secrets or tokens.',
      '- For a long-running command, start it once, check its output now and then, and do not start a second copy. Use Control+C only when it is stuck.',
    ].join('\n'),
  },
  {
    id: 'code',
    when: has(/\b(?:code|coding|source file|repository|repo|pull request|commit|branch|github|gitlab|editor|vs ?code|function|refactor|script|endpoint|html|css|javascript|typescript|python)\b/i),
    body: [
      'Code in browser editors:',
      '- Find the file first (GitHub: press t for the file finder; Cloud Shell Editor or VS Code web: the Explorer). Read the relevant code and find the cause, not just the symptom. Make the smallest change that fixes it and keep the existing style.',
      '- Edit: click into the editor, select the exact lines (select all only when replacing the whole file), and type the new text. Editors auto-indent, so read the file back and fix any doubled indentation or brackets before you save.',
      '- Verify: preview the diff, run the project’s checks or tests (Actions, build, preview) and read their output. Do not say it works until a check or a real test shows it.',
      '- Commit to a branch with a clear message and open a pull request unless the user said otherwise. Never force push. A production deploy needs the user’s approval first. Keep secrets out of code.',
    ].join('\n'),
  },
  {
    id: 'debugging',
    when: has(/\b(?:debug|debugging|broken|not working|doesn.t work|isn.t working|error|errors|failing|fails|failed|crash|bug|issue|problem|why (?:is|does|did)|timeout)\b/i),
    body: [
      'Debugging:',
      '- Reproduce the problem first and write down what happens and what should happen.',
      '- Narrow it down by changing one thing at a time, and note what each check rules out. Read error messages and logs in full: the cause is often in the first error.',
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
      '- If the conversation already shows steps of this task done (after a stop, a pause or a restart), continue after the last verified step. Do not start over.',
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
