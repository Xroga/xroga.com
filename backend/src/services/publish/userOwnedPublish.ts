/**
 * User-owned publish readiness — web (GitHub+Vercel) and mobile (Expo/EAS).
 * Xroga stores encrypted credentials; Apple/Google developer fees are always the user's.
 */

import { isGitHubConnected } from '../integrations/githubAuth.js';
import { isVercelConnected } from '../integrations/vercelAuth.js';
import {
  getUserProviderKey,
  listUserProviderKeys,
} from '../integrations/userProviderKeys.js';

export type PublishChannel = 'web' | 'mobile';

export interface PublishChecklistItem {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
  hint?: string;
  href?: string;
}

export interface PublishStatus {
  web: {
    ready: boolean;
    githubConnected: boolean;
    vercelConnected: boolean;
    checklist: PublishChecklistItem[];
  };
  mobile: {
    ready: boolean;
    expoTokenSaved: boolean;
    expoTokenValid: boolean | null;
    appleSaved: boolean;
    googlePlaySaved: boolean;
    checklist: PublishChecklistItem[];
    commands: string[];
  };
  costs: {
    xrogaPays: string[];
    userPays: string[];
  };
}

/** Lightweight check that EXPO_TOKEN is accepted by Expo (never logs the token). */
export async function verifyExpoToken(token: string): Promise<{
  ok: boolean;
  username?: string;
  error?: string;
}> {
  const trimmed = token.trim();
  if (trimmed.length < 8) return { ok: false, error: 'Token too short' };

  try {
    const res = await fetch('https://exp.host/--/api/v2/auth/userInfo', {
      headers: {
        Authorization: `Bearer ${trimmed}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error:
          res.status === 401 || res.status === 403
            ? 'Expo rejected this token — create a new Access Token at expo.dev → Settings → Access tokens'
            : `Expo API ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`,
      };
    }
    const data = (await res.json()) as {
      data?: { username?: string; user?: { username?: string } };
      username?: string;
    };
    const username =
      data?.data?.username || data?.data?.user?.username || data?.username || 'expo-user';
    return { ok: true, username };
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'Could not reach Expo API' };
  }
}

export async function getPublishStatus(userId: string): Promise<PublishStatus> {
  const [githubConnected, vercelConnected, keys] = await Promise.all([
    isGitHubConnected(userId).catch(() => false),
    isVercelConnected(userId).catch(() => false),
    listUserProviderKeys(userId).catch(() => []),
  ]);
  const expoKey = keys.find((k) => k.provider === 'expo' && k.connected);
  const appleKey = keys.find((k) => k.provider === 'apple_asc' && k.connected);
  const googleKey = keys.find((k) => k.provider === 'google_play' && k.connected);
  const supabaseKey = keys.find(
    (k) => (k.provider === 'supabase' || k.provider === 'supabase_anon') && k.connected,
  );

  let expoTokenValid: boolean | null = null;
  if (expoKey) {
    const plain = await getUserProviderKey(userId, 'expo');
    if (plain) {
      const verified = await verifyExpoToken(plain);
      expoTokenValid = verified.ok;
    } else {
      expoTokenValid = false;
    }
  }

  const webChecklist: PublishChecklistItem[] = [
    {
      id: 'github',
      label: 'Connect GitHub',
      done: githubConnected,
      required: true,
      hint: 'Xroga pushes working code to your repo',
      href: '/dashboard/integrations',
    },
    {
      id: 'vercel',
      label: 'Connect Vercel',
      done: vercelConnected,
      required: true,
      hint: 'Deploys go to your Vercel account (you pay hosting)',
      href: '/dashboard/integrations',
    },
    {
      id: 'supabase',
      label: 'Connect Supabase',
      done: Boolean(supabaseKey),
      required: false,
      hint: 'Optional — your project keys for auth & data on deploy',
      href: '/dashboard/integrations',
    },
  ];

  const mobileChecklist: PublishChecklistItem[] = [
    {
      id: 'github',
      label: 'Connect GitHub (same repo as the Expo app)',
      done: githubConnected,
      required: true,
      href: '/dashboard/integrations',
    },
    {
      id: 'expo',
      label: 'Save Expo access token (EAS)',
      done: Boolean(expoKey),
      required: true,
      hint: 'expo.dev → Account settings → Access tokens',
      href: 'https://expo.dev/settings/access-tokens',
    },
    {
      id: 'expo_valid',
      label: 'Expo token verified',
      done: expoTokenValid === true,
      required: true,
      hint:
        expoTokenValid === false
          ? 'Token saved but Expo rejected it — paste a fresh one'
          : 'Click Verify after saving',
    },
    {
      id: 'apple',
      label: 'Apple Developer (optional for iOS submit)',
      done: Boolean(appleKey),
      required: false,
      hint: 'You pay Apple’s developer fee — store app-specific password here',
      href: 'https://developer.apple.com',
    },
    {
      id: 'google',
      label: 'Google Play Console (optional for Android submit)',
      done: Boolean(googleKey),
      required: false,
      hint: 'You pay Google’s one-time fee — paste service account JSON',
      href: 'https://play.google.com/console',
    },
  ];

  return {
    web: {
      ready: githubConnected && vercelConnected,
      githubConnected,
      vercelConnected,
      checklist: webChecklist,
    },
    mobile: {
      ready: githubConnected && Boolean(expoKey) && expoTokenValid === true,
      expoTokenSaved: Boolean(expoKey),
      expoTokenValid,
      appleSaved: Boolean(appleKey),
      googlePlaySaved: Boolean(googleKey),
      checklist: mobileChecklist,
      commands: [
        'npm i -g eas-cli',
        'export EXPO_TOKEN=…   # or: eas login',
        'cd your-repo && eas build:configure',
        'eas build -p android --profile production',
        'eas build -p ios --profile production',
        'eas submit -p android   # needs Play service account',
        'eas submit -p ios       # needs Apple credentials',
      ],
    },
    costs: {
      xrogaPays: [
        'Xroga AI build / chat usage (your Xroga plan)',
        'Encrypted vault storage on our API (included)',
      ],
      userPays: [
        'Vercel hosting (your Vercel plan — often free hobby tier)',
        'Apple Developer Program (~$99/yr) if you submit to App Store',
        'Google Play Console (~$25 one-time) if you submit to Play Store',
        'EAS build minutes on your Expo account (Expo free tier available)',
      ],
    },
  };
}
