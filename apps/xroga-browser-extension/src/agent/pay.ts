// Pay as it is written on job pages ("$117,000/yr - $234,000/yr", "£45k to £55k a year", "$25-$30 an hour", "AED 15,000 per month", "up to 80k") as numbers that can be compared: a minimum, a
// maximum, the period and the currency, and the yearly equivalent. The periods and their yearly factors (hourly 2080, daily 260, weekly 52, monthly 12) and the habit of reading the period
// from the size of the amount when the text does not say it come from the compensation model of JobSpy (MIT); the reader is written fresh.
export type Interval = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export const ANNUAL_FACTOR: Record<Interval, number> = { hourly: 2080, daily: 260, weekly: 52, monthly: 12, yearly: 1 };

export interface Pay {
  min: number | null;
  max: number | null;
  interval: Interval | null;
  currency: string | null;
  /** True when the period was guessed from the size of the amount, not read from the text. */
  guessed: boolean;
  yearlyMin: number | null;
  yearlyMax: number | null;
}

const SYMBOLS: Record<string, string> = { '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₹': 'INR', '₪': 'ILS', '₩': 'KRW', 'R$': 'BRL', 'zł': 'PLN', 'kr': 'SEK', 'Rs': 'INR', 'Rs.': 'INR' };
const CODES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'AED', 'SAR', 'QAR', 'INR', 'PKR', 'BDT', 'SGD', 'HKD', 'JPY', 'CNY', 'ILS', 'BRL', 'MXN', 'ZAR', 'NGN', 'KES', 'EGP', 'TRY'];

const INTERVALS: Array<[RegExp, Interval]> = [
  [/\b(per\s+)?(hour|hr|hourly)\b|\/\s*h(ou)?r?\b|\ban hour\b|\bph\b/i, 'hourly'],
  [/\b(per\s+)?(day|daily|diem)\b|\/\s*day\b|\ba day\b/i, 'daily'],
  [/\b(per\s+)?(week|weekly|wk)\b|\/\s*w(ee)?k\b|\ba week\b/i, 'weekly'],
  [/\b(per\s+)?(month|monthly|mo)\b|\/\s*mo(nth)?\b|\ba month\b|\bpcm\b/i, 'monthly'],
  [/\b(per\s+)?(year|yr|annum|annual|annually|yearly|pa)\b|\/\s*y(ea)?r\b|\ba year\b|\bp\.a\.?/i, 'yearly'],
];

const num = (s: string): number => {
  const k = /k$/i.test(s);
  const m = /m$/i.test(s);
  const v = Number(s.replace(/[,_\s]/g, '').replace(/[km]$/i, ''));
  return k ? v * 1000 : m ? v * 1_000_000 : v;
};

/** Reads one amount or a range from text; null when there is no amount in it. */
export function parsePay(raw: unknown): Pay | null {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  // currency: a code first, else a symbol
  let currency: string | null = CODES.find(c => new RegExp(`\\b${c}\\b`, 'i').test(text)) ?? null;
  if (!currency) for (const [sym, code] of Object.entries(SYMBOLS).sort((a, b) => b[0].length - a[0].length)) if (text.includes(sym)) { currency = code; break; }
  // amounts: 1,234.56 or 45k or 1.2m; the number of an "up to" or "from" is one side of the range
  const amounts = [...text.matchAll(/(\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([km])?(?![\d])/gi)].map(m => ({ v: num(m[1]! + (m[2] ?? '')), at: m.index ?? 0 })).filter(a => Number.isFinite(a.v) && a.v > 0);
  if (!amounts.length) return null;
  // a "k" on the second figure applies to the first when the first has none ("45-55k")
  const kAfter = /\d\s*(?:-|–|—|to)\s*[£$€]?\s*\d[\d.,]*\s*k\b/i.test(text);
  let min: number | null = amounts[0]!.v;
  let max: number | null = amounts.length > 1 ? amounts[1]!.v : null;
  if (kAfter && max !== null && min < 1000 && max >= 1000) min *= 1000;
  if (max !== null && max < min) [min, max] = [max, min];
  if (/\b(up to|max(imum)?|to a max of|at most)\b/i.test(text) && max === null) {
    max = min;
    min = null;
  }
  let interval: Interval | null = INTERVALS.find(([re]) => re.test(text))?.[1] ?? null;
  let guessed = false;
  if (!interval) {
    // the size of the amount says what it is likely to be
    const ref = min ?? max!;
    interval = ref < 200 ? 'hourly' : ref < 1500 ? 'weekly' : ref < 20_000 ? 'monthly' : 'yearly';
    guessed = true;
  }
  const f = ANNUAL_FACTOR[interval];
  return { min, max, interval, currency, guessed, yearlyMin: min === null ? null : Math.round(min * f), yearlyMax: max === null ? null : Math.round(max * f) };
}

export function describePay(p: Pay): string {
  const range = p.min !== null && p.max !== null && p.min !== p.max ? `${p.min.toLocaleString('en-US')} to ${p.max.toLocaleString('en-US')}` : `${(p.min ?? p.max)!.toLocaleString('en-US')}${p.min === null ? ' at most' : ''}`;
  return `${p.currency ?? '?'} ${range} ${p.interval}${p.guessed ? ' (period guessed from the size)' : ''}${p.interval !== 'yearly' ? `, about ${(p.yearlyMax ?? p.yearlyMin)!.toLocaleString('en-US')} a year` : ''}`;
}
