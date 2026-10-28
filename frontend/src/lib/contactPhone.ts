/** Contact-only number. It is not an authentication factor or proof of ownership. */
export function normalizeContactPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}
