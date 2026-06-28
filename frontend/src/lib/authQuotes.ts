export const SIGNUP_QUOTES = [
  { text: 'Verily, with hardship comes ease.', author: 'Qur\'an 94:6' },
  { text: 'The best among you are those who learn and teach.', author: 'Prophet Muhammad ﷺ' },
  { text: 'If you can dream it, Xroga can build it — one command at a time.', author: 'XROGA' },
  { text: 'Allah does not burden a soul beyond that it can bear.', author: 'Qur\'an 2:286' },
  { text: 'The future belongs to those who build today.', author: 'Muhammad Ibrahim, Xroga CEO' },
  { text: 'Seek knowledge from the cradle to the grave.', author: 'Prophet Muhammad ﷺ' },
];

export const LOGIN_QUOTES = [
  { text: 'Welcome back, builder. Your Swarm never sleeps.', author: 'XROGA Black Hole V∞' },
  { text: 'And your Lord said: Call upon Me; I will respond to you.', author: 'Qur\'an 40:60' },
  { text: 'Ideas become empires when you show up every day.', author: 'Muhammad Ibrahim' },
  { text: 'The pen is mightier — but your prompt is legendary.', author: 'XROGA' },
  { text: 'Automate the ordinary. Create the extraordinary.', author: 'XROGA AI' },
];

export function randomQuote(quotes: typeof SIGNUP_QUOTES) {
  return quotes[Math.floor(Math.random() * quotes.length)];
}
