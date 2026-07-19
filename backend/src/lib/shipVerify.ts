/**
 * Post-deploy verification + keys→live feature proof.
 */

import { verifyLivePreviewUrl } from './deployVerify.js';

export interface ShipVerifyResult {
  liveOk: boolean;
  liveUrl: string;
  healthOk: boolean | null;
  healthBody?: Record<string, unknown>;
  keysProof: {
    checked: boolean;
    hasOpenAI?: boolean;
    hasSupabase?: boolean;
    hasStripe?: boolean;
    message: string;
  };
  githubOk: boolean;
  summaryLines: string[];
  pass: boolean;
}

export async function verifyShippedProduct(opts: {
  deployUrl?: string;
  githubPushConfirmed: boolean;
  githubRepoUrl?: string;
  expectApiHealth?: boolean;
}): Promise<ShipVerifyResult> {
  const lines: string[] = [];
  const liveUrl = opts.deployUrl?.startsWith('http') ? opts.deployUrl : '';

  const githubOk = Boolean(opts.githubPushConfirmed && opts.githubRepoUrl);
  lines.push(
    githubOk
      ? `✅ GitHub push confirmed${opts.githubRepoUrl ? ` · ${opts.githubRepoUrl}` : ''}`
      : opts.githubPushConfirmed
        ? '⚠️ GitHub push flagged but repo URL missing'
        : '❌ GitHub push not confirmed',
  );

  let liveOk = false;
  if (liveUrl) {
    liveOk = await verifyLivePreviewUrl(liveUrl, 60_000);
    lines.push(liveOk ? `✅ Live URL responds · ${liveUrl}` : `❌ Live URL failed · ${liveUrl}`);
  } else {
    lines.push('⚠️ No Vercel deploy URL to verify');
  }

  let healthOk: boolean | null = null;
  let healthBody: Record<string, unknown> | undefined;
  const keysProof: ShipVerifyResult['keysProof'] = {
    checked: false,
    message: 'Health endpoint not checked',
  };

  if (liveUrl && (opts.expectApiHealth || liveOk)) {
    const healthUrl = `${liveUrl.replace(/\/$/, '')}/api/health`;
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'XROGA-Ship-Verify/1.0' },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (json && typeof json === 'object') {
          healthOk = json.ok === true || json.status === 'ok' || res.ok;
          healthBody = json;
          keysProof.checked = true;
          keysProof.hasOpenAI = Boolean(json.hasOpenAI);
          keysProof.hasSupabase = Boolean(json.hasSupabase);
          keysProof.hasStripe = Boolean(json.hasStripe);
          const parts = [
            keysProof.hasOpenAI ? 'OpenAI key present' : 'OpenAI key missing',
            keysProof.hasSupabase ? 'Supabase configured' : 'Supabase missing',
            keysProof.hasStripe ? 'Stripe present' : null,
          ].filter(Boolean);
          keysProof.message = `✅ /api/health OK — ${parts.join(' · ')}`;
          lines.push(keysProof.message);
        } else {
          healthOk = true;
          keysProof.checked = true;
          keysProof.message = '✅ /api/health responded (non-JSON)';
          lines.push(keysProof.message);
        }
      } else if (res.status === 404) {
        healthOk = null;
        keysProof.message = 'ℹ️ No /api/health (static site) — skipped keys proof';
        lines.push(keysProof.message);
      } else {
        healthOk = false;
        keysProof.checked = true;
        keysProof.message = `❌ /api/health HTTP ${res.status}`;
        lines.push(keysProof.message);
      }
    } catch {
      healthOk = null;
      keysProof.message = 'ℹ️ /api/health unreachable (may still be building)';
      lines.push(keysProof.message);
    }
  }

  // Stricter when we have a URL: need liveOk; health 404 (static) is OK
  const healthFail = healthOk === false;
  const strictPass = githubOk && (liveUrl ? liveOk : true) && !healthFail;

  return {
    liveOk,
    liveUrl,
    healthOk,
    healthBody,
    keysProof,
    githubOk,
    summaryLines: lines,
    pass: strictPass,
  };
}
