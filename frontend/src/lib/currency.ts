/** Top global currencies — Israel (IL/ILS) blocked by Xroga policy */

export const BLOCKED_COUNTRY_CODES = new Set(['IL']);
export const BLOCKED_CURRENCY_CODES = new Set(['ILS']);

export type CurrencyCode =
  | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CNY' | 'INR' | 'PKR' | 'AED' | 'SAR' | 'QAR'
  | 'KWD' | 'BHD' | 'OMR' | 'EGP' | 'TRY' | 'IDR' | 'MYR' | 'SGD' | 'THB' | 'VND'
  | 'PHP' | 'KRW' | 'HKD' | 'TWD' | 'AUD' | 'NZD' | 'CAD' | 'MXN' | 'BRL' | 'ARS'
  | 'CLP' | 'COP' | 'PEN' | 'ZAR' | 'NGN' | 'KES' | 'GHS' | 'MAD' | 'TND' | 'DZD'
  | 'PLN' | 'CZK' | 'HUF' | 'RON' | 'SEK' | 'NOK' | 'DKK' | 'CHF' | 'RUB' | 'UAH'
  | 'BDT' | 'LKR' | 'NPR' | 'MMK' | 'KHR' | 'LAK';

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

/** Approximate rates vs USD */
export const FX_RATES: Record<CurrencyCode, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149, CNY: 7.24, INR: 83.5, PKR: 278, AED: 3.67,
  SAR: 3.75, QAR: 3.64, KWD: 0.31, BHD: 0.38, OMR: 0.38, EGP: 48, TRY: 32, IDR: 15700,
  MYR: 4.72, SGD: 1.35, THB: 36, VND: 24500, PHP: 56, KRW: 1330, HKD: 7.82, TWD: 32,
  AUD: 1.53, NZD: 1.64, CAD: 1.36, MXN: 17, BRL: 5, ARS: 870, CLP: 920, COP: 3900,
  PEN: 3.75, ZAR: 18.5, NGN: 1550, KES: 129, GHS: 14, MAD: 10, TND: 3.1, DZD: 134,
  PLN: 4, CZK: 23, HUF: 360, RON: 4.6, SEK: 10.5, NOK: 10.8, DKK: 6.9, CHF: 0.88,
  RUB: 92, UAH: 41, BDT: 110, LKR: 300, NPR: 133, MMK: 2100, KHR: 4100, LAK: 20500,
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', PKR: 'Rs', AED: 'د.إ',
  SAR: '﷼', QAR: '﷼', KWD: 'د.ك', BHD: '.د.ب', OMR: '﷼', EGP: 'E£', TRY: '₺', IDR: 'Rp',
  MYR: 'RM', SGD: 'S$', THB: '฿', VND: '₫', PHP: '₱', KRW: '₩', HKD: 'HK$', TWD: 'NT$',
  AUD: 'A$', NZD: 'NZ$', CAD: 'C$', MXN: 'MX$', BRL: 'R$', ARS: 'AR$', CLP: 'CL$',
  COP: 'COL$', PEN: 'S/', ZAR: 'R', NGN: '₦', KES: 'KSh', GHS: 'GH₵', MAD: 'MAD',
  TND: 'DT', DZD: 'DA', PLN: 'zł', CZK: 'Kč', HUF: 'Ft', RON: 'lei', SEK: 'kr',
  NOK: 'kr', DKK: 'kr', CHF: 'CHF', RUB: '₽', UAH: '₴', BDT: '৳', LKR: 'Rs', NPR: 'Rs',
  MMK: 'K', KHR: '៛', LAK: '₭',
};

const COUNTRY_CURRENCY: Record<string, CurrencyCode> = {
  US: 'USD', GB: 'GBP', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR',
  AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR', IN: 'INR', PK: 'PKR', AE: 'AED',
  SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', EG: 'EGP', TR: 'TRY', ID: 'IDR',
  MY: 'MYR', SG: 'SGD', TH: 'THB', VN: 'VND', PH: 'PHP', KR: 'KRW', HK: 'HKD', TW: 'TWD',
  AU: 'AUD', NZ: 'NZD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP',
  PE: 'PEN', ZA: 'ZAR', NG: 'NGN', KE: 'KES', GH: 'GHS', MA: 'MAD', TN: 'TND', DZ: 'DZD',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF',
  RU: 'RUB', UA: 'UAH', BD: 'BDT', LK: 'LKR', NP: 'NPR', MM: 'MMK', KH: 'KHR', LA: 'LAK',
  PS: 'USD', JP: 'JPY', CN: 'CNY',
};

export function isBlockedRegion(countryCode: string): boolean {
  return BLOCKED_COUNTRY_CODES.has(countryCode.toUpperCase());
}

export function currencyForCountry(countryCode: string): CurrencyCode {
  const cc = countryCode.toUpperCase();
  if (isBlockedRegion(cc)) return 'USD';
  return COUNTRY_CURRENCY[cc] ?? 'USD';
}

export function formatMoney(amountUsd: number, currency: CurrencyCode): string {
  const converted = Math.round(amountUsd * FX_RATES[currency]);
  const sym = CURRENCY_SYMBOLS[currency];
  const noDecimals = ['JPY', 'KRW', 'VND', 'IDR', 'KHR', 'LAK'].includes(currency);
  if (noDecimals) return `${sym}${converted.toLocaleString()}`;
  if (currency === 'PKR' || currency === 'INR' || currency === 'BDT') {
    return `${sym} ${converted.toLocaleString()}`;
  }
  return `${sym}${converted.toLocaleString()}`;
}

export function isUsdRegion(countryCode: string): boolean {
  return countryCode.toUpperCase() === 'US';
}

export const CURRENCY_COUNT = Object.keys(FX_RATES).length;
