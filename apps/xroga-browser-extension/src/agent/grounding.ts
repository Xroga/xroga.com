// Values in a final answer that nothing the run read contains. An email address, a web address or a phone number in the answer must have been seen on a page,
// in a result or in the task itself: otherwise the model produced it from memory or invented it, and a person may write to it, open it or call it. This is a
// plain text check with no model call. Idea: stagehand's verifier gates and webgenie done-evidence (both open source, MIT / Apache-2.0); written fresh.
import type { TraceEntry } from './task-judge';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi;
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/g;

const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, '').replace(/\/+$/, '').toLowerCase();

/** The values of the answer that appear nowhere in what the run saw or was told. */
export function ungroundedValues(summary: string, entries: TraceEntry[]): string[] {
  const seenParts: string[] = [];
  let anyResult = false;
  for (const e of entries) {
    for (const p of e.message.parts) {
      if (p.type === 'tool-result') {
        anyResult = true;
        seenParts.push(p.text ?? '');
      } else if (p.type === 'text' && e.message.role !== 'assistant') seenParts.push(p.text ?? '');
      else if (p.type === 'tool-call') seenParts.push(JSON.stringify(p.input ?? {}));
    }
  }
  // A run that read nothing has nothing to check an answer against.
  if (!anyResult) return [];
  const seen = seenParts.join('\n');
  const seenLower = seen.toLowerCase();
  const seenDigits = seen.replace(/\D/g, '');
  const missing: string[] = [];
  for (const m of summary.match(EMAIL) ?? []) if (!seenLower.includes(m.toLowerCase())) missing.push(m);
  for (const m of summary.match(URL_RE) ?? []) {
    const u = trimUrl(m);
    // The address as written, or its host and path with another scheme or a trailing slash.
    if (!seenLower.includes(u) && !seenLower.includes(u.replace(/^https?:\/\//, ''))) missing.push(m.replace(/[.,;:!?]+$/, ''));
  }
  for (const m of summary.match(PHONE) ?? []) {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    // A date, a version or a price range has digits too: only a number written the way a phone number is (a plus, brackets, spaces or dashes in it) counts.
    if (!/[+()\s-]/.test(m.trim())) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(m.trim()) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(m.trim())) continue;
    if (!seenDigits.includes(digits)) missing.push(m.trim());
  }
  return [...new Set(missing)].slice(0, 6);
}

const CLAIMS_SENT = /\b(?:submitted|sent|posted|published|created|registered|booked|ordered|purchased|saved|applied|signed up|subscribed)\b/i;
const SHOWS_REFUSAL = /\b(?:is required|are required|required field|please (?:enter|select|fill|provide|correct)|invalid (?:email|phone|password|value|input|format)|already (?:exists|taken|in use|registered)|something went wrong|could not be (?:sent|saved|submitted|posted)|failed to (?:send|save|submit|post)|try again later|too many (?:requests|attempts)|rate limit)/i;

/** The answer claims something was sent, saved or created while the last thing the run saw on the page is the page refusing it. Returns the refusal wording, or undefined. */
export function claimContradicted(summary: string, entries: TraceEntry[]): string | undefined {
  if (!CLAIMS_SENT.test(summary)) return undefined;
  let last: string | undefined;
  for (let i = entries.length - 1; i >= 0 && last === undefined; i--) {
    const parts = entries[i]!.message.parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j]!;
      if (p.type === 'tool-result' && p.toolName && !/^(?:plan|done|find_skill|read_skill|memory)$/.test(p.toolName)) {
        last = p.text ?? '';
        break;
      }
    }
  }
  if (!last) return undefined;
  const m = SHOWS_REFUSAL.exec(last);
  return m ? m[0] : undefined;
}
