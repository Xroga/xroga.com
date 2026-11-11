// Bot challenges and refusals, recognised from what a tool already returned (page title and text), so the agent is told once, at the
// moment it happens, what to do instead of retrying a page that will never open for it.
//
// The three kinds follow the classification in anomalyco/browse (MIT, github.com/anomalyco/browse, cli/src/execute/challenge-detection.ts):
//   wait   - an interstitial the browser clears by itself ("Just a moment..."): wait a little and read again, once.
//   person - a challenge only a person should answer (a captcha, "press and hold"): never touched by the agent; the person is asked.
//   block  - the site refused the visit outright: retrying does not help; use another source.
// This is a text-based reimplementation for this extension's tools (which return text, not a DOM probe); no code was copied.

export type ChallengeKind = 'wait' | 'person' | 'block';

export interface Challenge {
  vendor: string;
  kind: ChallengeKind;
  /** What matched, for the note and the logs. */
  signal: string;
}

/** Long pages are articles that may merely talk about captchas; challenge pages are short. */
const SHORT_PAGE = 4_000;

interface Rule {
  vendor: string;
  kind: ChallengeKind;
  title?: RegExp;
  text?: RegExp;
  /** The text rules only count on a short page. */
  short?: boolean;
}

const RULES: Rule[] = [
  { vendor: 'Cloudflare', kind: 'block', text: /sorry, you have been blocked/, short: true },
  { vendor: 'Cloudflare', kind: 'person', text: /verify you are human by completing|click to verify|confirm you are human/, short: true },
  { vendor: 'Cloudflare', kind: 'wait', title: /^just a moment\b|^attention required! \| cloudflare|^checking your browser|^un instant|^einen moment/ },
  { vendor: 'Cloudflare', kind: 'wait', text: /checking if the site connection is secure|performing security verification/, short: true },
  { vendor: 'Google', kind: 'person', text: /our systems have detected unusual traffic from your computer network|this page checks to see if it'?s really you sending the requests/, short: true },
  { vendor: 'reCAPTCHA', kind: 'person', text: /i'?m not a robot|select all (?:images|squares) with/, short: true },
  { vendor: 'hCaptcha', kind: 'person', text: /hcaptcha|please complete the security check to access/, short: true },
  { vendor: 'DuckDuckGo', kind: 'person', text: /bots use duckduckgo too|select all squares containing a duck/, short: true },
  { vendor: 'PerimeterX', kind: 'person', text: /press (?:&|and) hold|px-captcha|before we continue\.\.\./, short: true },
  { vendor: 'DataDome', kind: 'person', text: /datadome|please enable js and disable any ad blocker/, short: true },
  { vendor: 'Imperva', kind: 'block', text: /incapsula incident id|request unsuccessful\. incapsula/, short: true },
  { vendor: 'Akamai', kind: 'block', text: /access denied[\s\S]{0,200}(?:reference #|errors\.edgesuite\.net)|you don'?t have permission to access[\s\S]{0,120}on this server/, short: true },
  { vendor: 'AWS WAF', kind: 'person', text: /verify that you'?re not a robot|aws waf/, short: true },
  { vendor: 'a bot check', kind: 'person', text: /verify you are (?:a )?human|are you a robot|complete the captcha|prove you'?re not a robot/, short: true },
];

export function detectChallenge(page: { title?: string; text?: string }): Challenge | null {
  const title = (page.title ?? '').trim().toLowerCase();
  const text = (page.text ?? '').toLowerCase();
  const short = text.length <= SHORT_PAGE;
  for (const rule of RULES) {
    if (rule.title && rule.title.test(title)) return { vendor: rule.vendor, kind: rule.kind, signal: `title: ${title.slice(0, 40)}` };
    if (rule.text && (!rule.short || short)) {
      const hit = rule.text.exec(text);
      if (hit) return { vendor: rule.vendor, kind: rule.kind, signal: `text: ${hit[0].slice(0, 40)}` };
    }
  }
  return null;
}

/** The sentence the agent is given with the result that showed the challenge. */
export function challengeNote(challenge: Challenge): string {
  const what = `${challenge.vendor} ${challenge.kind === 'block' ? 'refused this visit' : 'is checking whether a person is here'} (${challenge.signal})`;
  if (challenge.kind === 'wait') {
    return `NOTE: this page is an interstitial: ${what}. It normally clears by itself. Wait a few seconds and read the page once more; if it is still there, treat it as a block.`;
  }
  if (challenge.kind === 'person') {
    return `NOTE: this page needs a person: ${what}. Do not try to solve, bypass or repeat it. Use ask_user so the person can complete it in the tab, or use a different source.`;
  }
  return `NOTE: this site blocked the visit: ${what}. Retrying will not help. Use a different source and tell the user which site refused.`;
}
