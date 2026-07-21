/**
 * User-owned publish readiness — web, chrome, desktop, mobile.
 * Xroga stores encrypted credentials; store fees stay on the user.
 */

import { isGitHubConnected } from '../integrations/githubAuth.js';
import { isVercelConnected } from '../integrations/vercelAuth.js';
import {
  getUserProviderKey,
  listUserProviderKeys,
} from '../integrations/userProviderKeys.js';

export type PublishChannel = 'web' | 'chrome' | 'desktop' | 'mobile';

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
  chrome: {
    ready: boolean;
    githubConnected: boolean;
    cwsConnected?: boolean;
    checklist: PublishChecklistItem[];
    installSteps: string[];
  };
  desktop: {
    ready: boolean;
    githubConnected: boolean;
    cscSaved?: boolean;
    notarizationSaved?: boolean;
    checklist: PublishChecklistItem[];
    runSteps: string[];
  };
  mobile: {
    ready: boolean;
    expoTokenSaved: boolean;
    expoTokenValid: boolean | null;
    appleSaved: boolean;
    appleAscApiSaved?: boolean;
    googlePlaySaved: boolean;
    easProjectLinked: boolean;
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
  const easProject = keys.find((k) => k.provider === 'expo_project_id' && k.connected);
  const appleKey = keys.find((k) => k.provider === 'apple_asc' && k.connected);
  const appleAscApiKey = keys.find((k) => k.provider === 'apple_asc_api' && k.connected);
  const googleKey = keys.find((k) => k.provider === 'google_play' && k.connected);
  const cwsKey = keys.find((k) => k.provider === 'cws_oauth' && k.connected);
  const cscKey = keys.find((k) => k.provider === 'electron_csc_link' && k.connected);
  const electronAppleId = keys.find((k) => k.provider === 'electron_apple_id' && k.connected);
  const electronApplePass = keys.find(
    (k) => k.provider === 'electron_apple_password' && k.connected,
  );
  const electronAppleTeam = keys.find(
    (k) => k.provider === 'electron_apple_team_id' && k.connected,
  );
  const notarizationSaved = Boolean(
    electronAppleId && electronApplePass && electronAppleTeam,
  );
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

  const chromeChecklist: PublishChecklistItem[] = [
    {
      id: 'github',
      label: '1. Authorize GitHub',
      done: githubConnected,
      required: true,
      hint: 'Ship packages extension.zip onto your Releases automatically',
      href: '/dashboard/integrations',
    },
    {
      id: 'cws_listing',
      label: '2. Create listing once in CWS dashboard (~$5)',
      done: Boolean(cwsKey),
      required: false,
      hint: 'Google’s API cannot finish first listing metadata — create the item once, copy Extension ID + Publisher ID',
      href: 'https://chrome.google.com/webstore/devconsole',
    },
    {
      id: 'cws_oauth',
      label: '3. Authorize Chrome Web Store OAuth (or paste refresh token)',
      done: Boolean(cwsKey),
      required: false,
      hint: 'Uses your Google Cloud OAuth client — next ship uploads + submits for review',
      href: '/dashboard/publish',
    },
    {
      id: 'ship',
      label: '4. Describe a Chrome extension in Workspace',
      done: false,
      required: true,
      hint: 'After ship: Download extension.zip → chrome://extensions → Load unpacked (or wait for CWS review if connected)',
      href: '/dashboard',
    },
  ];

  const desktopChecklist: PublishChecklistItem[] = [
    {
      id: 'github',
      label: '1. Authorize GitHub',
      done: githubConnected,
      required: true,
      hint: 'Ship uploads desktop.zip immediately (no waiting on Actions)',
      href: '/dashboard/integrations',
    },
    {
      id: 'csc',
      label: 'Optional: code-signing cert (CSC_LINK)',
      done: Boolean(cscKey),
      required: false,
      hint: 'Base64 .p12 / CSC_LINK — synced to GitHub Actions for signed installers',
    },
    {
      id: 'notarize',
      label: 'Optional: Apple notarization (ID + app password + Team ID)',
      done: notarizationSaved,
      required: false,
      hint: 'Synced to Actions secrets for electron-builder macOS notarization',
    },
    {
      id: 'ship',
      label: '2. Describe a desktop / Electron app in Workspace',
      done: false,
      required: true,
      hint: 'After ship: Download desktop.zip → npm install && npm start',
      href: '/dashboard',
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
      label: '2. Connect Expo (access token)',
      done: Boolean(expoKey),
      required: true,
      hint: 'Paste once — next mobile ship auto-creates/links EAS and starts a build',
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
          : 'Verified when you Connect Expo',
    },
    {
      id: 'eas_project',
      label: 'EAS project linked',
      done: Boolean(easProject),
      required: false,
      hint: Boolean(easProject)
        ? 'Linked — app.json gets stamped on ship'
        : 'Auto-created on first ship if you have zero Expo apps (or pick one below)',
    },
    {
      id: 'google',
      label: 'Optional: Google Play JSON + Sync to Expo',
      done: Boolean(googleKey),
      required: false,
      hint: 'Save JSON then click Sync to Expo — first Play app still needs Play Console once',
      href: 'https://play.google.com/console',
    },
    {
      id: 'apple_asc_api',
      label: 'Optional: App Store Connect API key + Sync to Expo',
      done: Boolean(appleAscApiKey),
      required: false,
      hint: 'JSON { keyId, issuerId, keyP8 } — real Expo GraphQL upload for iOS submit',
      href: 'https://appstoreconnect.apple.com/access/integrations/api',
    },
    {
      id: 'apple',
      label: 'Optional: Apple app-specific password',
      done: Boolean(appleKey),
      required: false,
      hint: 'Legacy Apple ID password path — prefer ASC API key above for EAS submit',
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
    chrome: {
      ready: githubConnected,
      githubConnected,
      cwsConnected: Boolean(cwsKey),
      checklist: chromeChecklist,
      installSteps: [
        'Ship a Chrome extension from Workspace (GitHub connected)',
        'Download extension.zip — or Load unpacked for personal use',
        'For public store: create listing once in CWS dashboard (~$5), then Authorize Google OAuth below (add redirect URI on your OAuth client)',
        'Next ship uploads + submits to Chrome Web Store for Google review',
        'Google approval is external — Xroga never fakes “live in store”',
      ],
    },
    desktop: {
      ready: githubConnected,
      githubConnected,
      cscSaved: Boolean(cscKey),
      notarizationSaved,
      checklist: desktopChecklist,
      runSteps: [
        'Ship an Electron / desktop app from Workspace (GitHub connected)',
        'Click Download desktop.zip',
        'Unzip → npm install && npm start',
        'Optional: save CSC + Apple notarization secrets below — ship syncs them to Actions for signed/notarized installers',
        'Mac App Store / Microsoft Store listing stay on your accounts',
      ],
    },
    mobile: {
      ready: githubConnected && Boolean(expoKey) && expoTokenValid === true,
      expoTokenSaved: Boolean(expoKey),
      expoTokenValid,
      appleSaved: Boolean(appleKey) || Boolean(appleAscApiKey),
      appleAscApiSaved: Boolean(appleAscApiKey),
      googlePlaySaved: Boolean(googleKey),
      easProjectLinked: Boolean(easProject),
      checklist: mobileChecklist,
      commands: [
        '# Preferred: Connect Expo once → describe mobile app → Xroga ships + starts EAS',
        '# Sync Play / Apple ASC buttons push vault creds into Expo via real GraphQL',
        '# Start EAS Android / iOS with submit when store creds are synced',
      ],
    },
    costs: {
      xrogaPays: [
        'Xroga AI build / chat usage (your Xroga plan)',
        'Packaging + GitHub Releases upload + EAS workflow dispatch',
      ],
      userPays: [
        'Chrome Web Store developer (~$5 one-time) if you list publicly',
        'Google Play Console (~$25 one-time) for Android store',
        'Apple Developer Program (~$99/yr) for iOS store',
        'Expo EAS build minutes on your Expo account',
        'Code signing certificates (desktop) if you need signed installs',
        'Vercel hosting only for web apps',
      ],
    },
  };
}
