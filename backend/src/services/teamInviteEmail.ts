const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const address = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u;
export type DeliveryState = 'accepted' | 'rejected' | 'unknown';

export function inviteEmailConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const key = env.BREVO_API_KEY;
  const sender = env.BREVO_SENDER_EMAIL?.trim();
  const origin = env.XROGA_TEAMS_INVITE_WEB_ORIGIN?.trim();
  if (!key || !sender || !address.test(sender) || !origin) return null;
  try {
    const url = new URL(origin);
    if (origin !== url.origin || url.protocol !== 'https:' ||
        !/^[a-z0-9-]+-xrogas-projects\.vercel\.app$/.test(url.hostname)) return null;
    return { key, sender, link: new URL('/workspace?teamInvites=1', url).href };
  } catch { return null; }
}

export async function deliverTeamInvitation(
  config: NonNullable<ReturnType<typeof inviteEmailConfiguration>>,
  recipient: string,
  teamName: string,
  transport: typeof fetch = fetch,
): Promise<DeliveryState> {
  if (!address.test(recipient)) return 'rejected';
  try {
    // Fixed authenticated recipient of credentials; never follow redirects.
    // Plain text only; no attachment, invite token, personal names, or credentials in the email.
    const response = await transport(BREVO_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { 'api-key': config.key, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { email: config.sender, name: 'Xroga' },
        to: [{ email: recipient }],
        subject: 'You’re invited to a Xroga team',
        textContent: `You have an invitation to join ${teamName.replace(/[\r\n]+/g, ' ')}.\n\nOpen Xroga Teams and sign in with the account that received this invitation. You can accept or decline there; an active individual Paid subscription is required.\n\n${config.link}\n\nIf you weren’t expecting this invitation, you can ignore this email.`,
      }),
    });
    // Never read or log the provider response, which may contain private data.
    void response.body?.cancel().catch(() => {});
    if (response.status === 201) return 'accepted';
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) return 'rejected';
    return 'unknown';
  } catch { return 'unknown'; }
}
