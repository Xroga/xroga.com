import { OAuth2Client } from 'google-auth-library';
const verifier = new OAuth2Client();

export async function verifyGoogleServiceToken(
  authorization: string | undefined,
  config: { audience: string; serviceAccountEmail: string },
  verify: (idToken: string, audience: string) => Promise<{ email?: string; email_verified?: boolean; iss?: string }> = async (idToken, audience) => {
    const ticket = await verifier.verifyIdToken({ idToken, audience });
    return ticket.getPayload() ?? {};
  },
): Promise<boolean> {
  if (!config.audience || !config.serviceAccountEmail) return false;
  const match = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(authorization ?? '');
  if (!match) return false;
  try {
    const payload = await verify(match[1], config.audience);
    return payload.email_verified === true
      && payload.email === config.serviceAccountEmail
      && (payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com');
  } catch {
    return false;
  }
}

