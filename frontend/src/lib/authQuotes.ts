export const SIGNUP_QUOTES = [
  { text: 'The best time to build was yesterday. The second best time is now.', author: 'Xroga AI' },
  { text: 'Dream big. Build with Swarm. Ship with truth.', author: 'Muhammad Ibrahim' },
  { text: 'Every great app started as a single command in a terminal.', author: 'Xroga' },
];

export const LOGIN_QUOTES = [
  { text: 'Welcome back, builder. Your Swarm is ready.', author: 'Xroga AI' },
  { text: 'Ideas become products when you show up every day.', author: 'Muhammad Ibrahim' },
  { text: 'Automate the boring. Create the extraordinary.', author: 'Xroga' },
];

export function randomQuote(quotes: typeof SIGNUP_QUOTES) {
  return quotes[Math.floor(Math.random() * quotes.length)];
}
