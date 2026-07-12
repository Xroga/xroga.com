/** Current date injected into AI system prompts for time-sensitive answers */

export function getCurrentDateString(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function getCurrentDateDirective(): string {
  return `Today's date is ${getCurrentDateString()} (UTC).
Use this as the current date for all time-sensitive answers — pricing, market data, news, crypto, business trends.
Do NOT describe 2025 or earlier years as "current" or "today" unless the user asks about history.
When live web sources are provided, prefer their facts over training-data guesses.`;
}
