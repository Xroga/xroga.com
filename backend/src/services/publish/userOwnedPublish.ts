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
  const supabaseUrl = keys.find((k) => k.provider === 'supabase_url' && k.connected);
  const supabaseAnon = keys.find((k) => k.provider === 'supabase_anon' && k.connected);
  const supabaseService = keys.find((k) => k.provider === 'supabase' && k.connected);
  const supabaseReady = Boolean(supabaseUrl && supabaseAnon);

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
      label: 'Connect Supabase (your project)',
      done: supabaseReady,
      required: false,
      hint: supabaseReady
        ? `Ready${supabaseService ? ' (+ service role)' : ''} — data stays in your Supabase`
        : 'Add project URL + anon key — auth/DB/storage use YOUR account',
      href: '/dashboard/integrations',
    },
  ];

  const mobileChecklist: PublishChecklistItem[] = [
    {
      id: 'github',
      label: '1. Authorize GitHub',
      done: githubConnected,
      required: true,
      hint: 'Same repo Xroga pushes your Expo app to',
      href: '/dashboard/integrations',
    },
    {
      id: 'expo',
      label: '2. Connect Expo account (access token)',
      done: Boolean(expoKey),
      required: true,
      hint: 'Free robot/access token — Expo has no GitHub-style Authorize for CI',
      href: 'https://expo.dev/settings/access-tokens',
    },
    {
      id: 'expo_valid',
      label: 'Expo connected & verified',
      done: expoTokenValid === true,
      required: true,
      hint:
        expoTokenValid === false
          ? 'Token saved but Expo rejected it — paste a fresh one'
          : 'Verified automatically when you Connect Expo',
    },
    {
      id: 'google',
      label: '3a. Optional: Google Play JSON (for EAS submit setup)',
      done: Boolean(googleKey),
      required: false,
      hint: 'Saved in Xroga for your records — configure the same credentials in Expo/EAS for real submit. Fees stay on Google.',
      href: 'https://play.google.com/console',
    },
    {
      id: 'apple',
      label: '3b. Optional: Apple password (for EAS submit setup)',
      done: Boolean(appleKey),
      required: false,
      hint: 'Saved in Xroga for your records — configure Apple credentials in Expo/EAS for real submit. Fees stay on Apple.',
      href: 'https://developer.apple.com',
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
        '# Preferred: Start EAS workflow buttons in Xroga Publish (dispatch only)',
        '# Real store submit needs credentials configured in Expo/EAS',
        'npm i -g eas-cli',
        'export EXPO_TOKEN=…',
        'eas build -p android --profile production',
        'eas submit -p android',
        'eas build -p ios --profile production',
        'eas submit -p ios',
      ],
    },
    costs: {
      xrogaPays: [
        'Xroga AI build / chat usage (your Xroga plan)',
        'Encrypted vault + EAS workflow dispatch (included)',
      ],
      userPays: [
        'Google Play Console (~$25 one-time) for Android store',
        'Apple Developer Program (~$99/yr) for iOS store',
        'Expo EAS build minutes on your Expo account',
        'Vercel hosting only if you also ship a web app',
      ],
    },
  };
}
