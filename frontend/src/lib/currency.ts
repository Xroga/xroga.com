export type CurrencyCode = 'USD' | 'GBP' | 'EUR' | 'INR' | 'PKR' | 'AED' | 'CAD' | 'AUD';

export const PLAN_USD_PRICES: Record<string, number> = {
  spark: 19,
  pulse: 29,
  nova: 49,
  zenith: 99,
  singularity: 999,
  micro: 6,
  lite: 9,
  essential: 10,
};

/** Approximate rates vs USD — Paddle settles in local currency at checkout */
export const FX_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  GBP: 0.79,
  EUR: 0.92,
  INR: 83.5,
  PKR: 278,
  AED: 3.67,
  CAD: 1.36,
  AUD: 1.53,
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  INR: '₹',
  PKR: 'Rs',
  AED: 'د.إ',
  CAD: 'C$',
  AUD: 'A$',
};

const COUNTRY_CURRENCY: Record<string, CurrencyCode> = {
  US: 'USD',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  IN: 'INR',
  PK: 'PKR',
  AE: 'AED',
  CA: 'CAD',
  AU: 'AUD',
};

export function currencyForCountry(countryCode: string): CurrencyCode {
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? 'USD';
}

export function formatMoney(amountUsd: number, currency: CurrencyCode): string {
  const converted = Math.round(amountUsd * FX_RATES[currency]);
  const sym = CURRENCY_SYMBOLS[currency];
  if (currency === 'PKR' || currency === 'INR') return `${sym} ${converted.toLocaleString()}`;
  return `${sym}${converted}`;
}

export function isUsdRegion(countryCode: string): boolean {
  return countryCode.toUpperCase() === 'US';
}
