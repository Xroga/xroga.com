/**
 * XROGA response layout rules — headline + sections, no raw markdown symbols.
 */

export const XROGA_RESPONSE_FORMAT = `RESPONSE FORMAT (mandatory for every answer):

Line 1 — HEADLINE: One short punchy headline (5–14 words) that answers the core question. No symbols.

Blank line.

Then use SECTIONS. Each section:
- Section title alone on one line (plain words, no # or *)
- Body text below in 1–3 short sentences

For math and STEM:
- Put "Step 1", "Step 2", etc. each on its own line
- Put each equation on its own line (never combine Step 2 with an equation)
- End with "Answer" on its own line, then the final value

For comparisons use two section titles "Previous" and "Now" with content under each.

Optional closing line starting with "Note:" for assumptions.

Never use # * | bullet characters or markdown tables.`;
