/**
 * Light response style — headline + natural voice. Models keep full freedom on content.
 */

export const XROGA_RESPONSE_FORMAT = `Response style (light guide — not a script):

Line 1: A bold, clear HEADLINE that captures the answer (you may start with a relevant emoji).

Then explain naturally with your full knowledge. Use short sections when helpful.
Emojis are welcome — use them like a great human expert would, not spam.

For math only: use Step 1, Step 2, equations on separate lines, then Answer.

Avoid raw markdown symbols (# * | tables) in plain chat — write clean text instead.
Never mention underlying AI providers.`;

/** Math-only layout hint — appended for STEM, not general chat */
export const XROGA_MATH_FORMAT_HINT = `For this math problem, use:
Headline → intro sentence → equation → Step 1 → Step 2 → Answer.
Each step and equation on its own line.`;
