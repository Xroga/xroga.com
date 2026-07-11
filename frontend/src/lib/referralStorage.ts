const REF_KEY = 'xroga_referral_code';

export function storeReferralCode(code: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REF_KEY, code.trim().toUpperCase());
}

export function getStoredReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REF_KEY);
}

export function clearStoredReferralCode() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REF_KEY);
}
