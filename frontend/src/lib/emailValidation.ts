/** Common disposable / temporary email domains — block at signup */
const TEMP_EMAIL_DOMAINS = new Set([
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'guerrillamail.net',
  'mailinator.com',
  '10minutemail.com',
  'yopmail.com',
  'throwaway.email',
  'getnada.com',
  'maildrop.cc',
  'sharklasers.com',
  'trashmail.com',
  'fakeinbox.com',
  'dispostable.com',
  'mintemail.com',
  'emailondeck.com',
  'tempail.com',
  'burnermail.io',
  'inboxkitten.com',
]);

export function isTemporaryEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  if (TEMP_EMAIL_DOMAINS.has(domain)) return true;
  return Array.from(TEMP_EMAIL_DOMAINS).some((d) => domain.endsWith(`.${d}`));
}
