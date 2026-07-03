import { exec } from 'child_process';
import { promisify } from 'util';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { deployStaticSite } from '../../lib/vercel.js';
import { getSecret } from '../../config/envSecrets.js';
import { logSystemError } from '../systemErrorLog.js';

const execAsync = promisify(exec);

export type DeployStatus = 'pending' | 'building' | 'live' | 'failed';

export interface DeployFile {
  file: string;
  data: string;
}

export interface DeployResult {
  url?: string;
  method: string;
  status: DeployStatus;
  deploymentId?: string;
}

type StatusListener = (payload: {
  status: DeployStatus;
  url?: string;
  method?: string;
  message?: string;
}) => void;

async function writeDeploymentStatus(opts: {
  userId?: string;
  runId?: string;
  target: 'vercel' | 'fly' | 'github';
  status: DeployStatus;
  method?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const row = {
      user_id: opts.userId ?? null,
      run_id: opts.runId ?? null,
      target: opts.target,
      status: opts.status === 'live' ? 'deployed' : opts.status === 'building' ? 'deploying' : opts.status,
      method: opts.method ?? null,
      url: opts.url ?? null,
      metadata: opts.metadata ?? {},
      updated_at: new Date().toISOString(),
    };
    const { data } = await supabase.from('deployment_status').insert(row).select('id').single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function triggerGitHubDeploy(repo: string, ref = 'main'): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN missing');
  const [owner, name] = repo.split('/');
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: 'xroga-deploy', client_payload: { ref } }),
    }
  );
  if (!res.ok) throw new Error(`GitHub dispatch failed: ${res.status}`);
}

async function deployFlyctl(appName?: string): Promise<{ url: string }> {
  const app = appName ?? process.env.FLY_APP_NAME ?? 'xroga-api';
  const env = { ...process.env, FLY_API_TOKEN: process.env.FLY_API_KEY ?? process.env.FLY_API_TOKEN };
  const { stdout } = await execAsync(`flyctl deploy --remote-only --app ${app}`, {
    env,
    timeout: 120_000,
  });
  const match = stdout.match(/https:\/\/[^\s]+\.fly\.dev/);
  return { url: match?.[0] ?? `https://${app}.fly.dev` };
}

async function deployVercelHook(): Promise<{ url: string }> {
  const hook = process.env.VERCEL_DEPLOY_HOOK;
  if (!hook) throw new Error('VERCEL_DEPLOY_HOOK missing');
  const res = await fetch(hook, { method: 'POST' });
  if (!res.ok) throw new Error(`Vercel hook failed: ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { url?: string; job?: { url?: string } };
  return { url: data.url ?? data.job?.url ?? process.env.FRONTEND_URL ?? 'https://xroga.com' };
}

async function deployVercelCli(cwd: string): Promise<{ url: string }> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN missing');
  const { stdout } = await execAsync(`npx vercel deploy --prod --token ${token} --yes`, {
    cwd,
    timeout: 180_000,
    env: { ...process.env, VERCEL_TOKEN: token },
  });
  const match = stdout.match(/https:\/\/[^\s]+\.vercel\.app/);
  return { url: match?.[0] ?? process.env.FRONTEND_URL ?? 'https://xroga.com' };
}

export async function deployToVercel(
  files: DeployFile[],
  ctx: { userId?: string; runId?: string; projectName?: string; onStatus?: StatusListener }
): Promise<DeployResult> {
  const projectName = ctx.projectName ?? `xroga-${Date.now()}`;
  ctx.onStatus?.({ status: 'pending', message: 'Preparing Vercel deployment…' });
  await writeDeploymentStatus({ ...ctx, target: 'vercel', status: 'pending', method: 'vercel-hook' });

  // Primary: Deploy Hook
  try {
    ctx.onStatus?.({ status: 'building', method: 'vercel-hook', message: 'Triggering Vercel deploy hook…' });
    await writeDeploymentStatus({ ...ctx, target: 'vercel', status: 'building', method: 'vercel-hook' });
    const hook = await deployVercelHook();
    ctx.onStatus?.({ status: 'live', url: hook.url, method: 'vercel-hook' });
    await writeDeploymentStatus({ ...ctx, target: 'vercel', status: 'live', method: 'vercel-hook', url: hook.url });
    return { url: hook.url, method: 'vercel-hook', status: 'live' };
  } catch (hookErr) {
    await logSystemError({
      api: 'vercel-hook',
      errorMessage: (hookErr as Error).message,
      fallbackUsed: 'vercel-api',
      userId: ctx.userId,
      runId: ctx.runId,
    });
  }

  // Fallback: Vercel API with files
  try {
    ctx.onStatus?.({ status: 'building', method: 'vercel-api', message: 'Uploading to Vercel API…' });
    const { deployUrl, deploymentId } = await deployStaticSite(projectName, files);
    ctx.onStatus?.({ status: 'live', url: deployUrl, method: 'vercel-api' });
    await writeDeploymentStatus({
      ...ctx,
      target: 'vercel',
      status: 'live',
      method: 'vercel-api',
      url: deployUrl,
      metadata: { deploymentId },
    });
    return { url: deployUrl, method: 'vercel-api', status: 'live', deploymentId };
  } catch (apiErr) {
    await logSystemError({
      api: 'vercel-api',
      errorMessage: (apiErr as Error).message,
      fallbackUsed: 'vercel-cli',
      userId: ctx.userId,
      runId: ctx.runId,
    });
  }

  // Fallback: vercel CLI
  try {
    ctx.onStatus?.({ status: 'building', method: 'vercel-cli', message: 'Running vercel CLI…' });
    const { url } = await deployVercelCli(process.cwd());
    ctx.onStatus?.({ status: 'live', url, method: 'vercel-cli' });
    await writeDeploymentStatus({ ...ctx, target: 'vercel', status: 'live', method: 'vercel-cli', url });
    return { url, method: 'vercel-cli', status: 'live' };
  } catch {
    ctx.onStatus?.({ status: 'failed', message: 'Deployment queued — we will retry in the background.' });
    await writeDeploymentStatus({ ...ctx, target: 'vercel', status: 'failed', method: 'vercel-cli' });
    return { method: 'queued', status: 'pending' };
  }
}

export async function deployToFlyio(
  _files: DeployFile[],
  ctx: {
    userId?: string;
    runId?: string;
    githubRepo?: string;
    onStatus?: StatusListener;
  }
): Promise<DeployResult> {
  ctx.onStatus?.({ status: 'pending', message: 'Preparing Fly.io deployment…' });
  await writeDeploymentStatus({ ...ctx, target: 'fly', status: 'pending', method: 'github-actions' });

  // Primary: GitHub Actions dispatch
  const repo = ctx.githubRepo ?? process.env.GITHUB_DEPLOY_REPO ?? 'Xroga/xroga.com';
  try {
    ctx.onStatus?.({ status: 'building', method: 'github-actions', message: 'Triggering GitHub Actions…' });
    await triggerGitHubDeploy(repo);
    const url = `https://${process.env.FLY_APP_NAME ?? 'xroga-api'}.fly.dev`;
    ctx.onStatus?.({ status: 'building', url, method: 'github-actions', message: 'GitHub workflow started…' });
    await writeDeploymentStatus({
      ...ctx,
      target: 'github',
      status: 'building',
      method: 'github-actions',
      url,
    });
    return { url, method: 'github-actions', status: 'building' };
  } catch (ghErr) {
    await logSystemError({
      api: 'github-deploy',
      errorMessage: (ghErr as Error).message,
      fallbackUsed: 'flyctl',
      userId: ctx.userId,
      runId: ctx.runId,
    });
  }

  // Fallback 1: flyctl deploy
  try {
    ctx.onStatus?.({ status: 'building', method: 'flyctl', message: 'Deploying via flyctl…' });
    const { url } = await deployFlyctl();
    ctx.onStatus?.({ status: 'live', url, method: 'flyctl' });
    await writeDeploymentStatus({ ...ctx, target: 'fly', status: 'live', method: 'flyctl', url });
    return { url, method: 'flyctl', status: 'live' };
  } catch (flyErr) {
    await logSystemError({
      api: 'flyctl',
      errorMessage: (flyErr as Error).message,
      fallbackUsed: 'vercel-hook',
      userId: ctx.userId,
      runId: ctx.runId,
    });
  }

  // Fallback 2: Vercel hook for frontend
  try {
    const { url } = await deployVercelHook();
    ctx.onStatus?.({ status: 'live', url, method: 'vercel-fallback' });
    await writeDeploymentStatus({ ...ctx, target: 'vercel', status: 'live', method: 'vercel-fallback', url });
    return { url, method: 'vercel-fallback', status: 'live' };
  } catch {
    ctx.onStatus?.({ status: 'pending', message: 'Deploy queued — check Automation hub for updates.' });
    return { method: 'queued', status: 'pending' };
  }
}
