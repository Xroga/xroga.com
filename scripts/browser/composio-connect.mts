/**
 * PRODUCT-009 setup: a Composio connection link for ONE synthetic Xroga test identity, through Xroga's own connected-app client
 * (`services/integrations/composioClient.ts`, the production code path). The founder opens the link and connects a throwaway account.
 *
 *   tsx scripts/browser/composio-connect.mts --toolkit googlesheets [--env-file C:/Users/hp/.xroga/keys/phase3.env]
 *   tsx scripts/browser/composio-connect.mts --status
 *
 * Reads only COMPOSIO_API_KEY from the env file; never prints it. The link itself is a one-time authorisation URL for the founder.
 */
import { existsSync, readFileSync } from 'node:fs';

export const P009_COMPOSIO_USER = 'xroga-phase3-synthetic-p009';
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const envFile = arg('--env-file', 'C:/Users/hp/.xroga/keys/phase3.env')!;
if (!existsSync(envFile)) { console.error('no env file'); process.exit(2); }
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*(COMPOSIO_API_KEY)\s*=\s*(.+?)\s*$/.exec(line);
  if (m) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
}
const c = await import('../../backend/src/services/integrations/composioClient.js');
if (!c.isComposioConfigured()) { console.error('COMPOSIO_API_KEY missing from the env file'); process.exit(2); }

if (process.argv.includes('--status')) {
  const s = await c.createReadOnlyComposioSession(P009_COMPOSIO_USER);
  const connected = await c.listConnectedComposioToolkits(P009_COMPOSIO_USER, { sessionId: s.session_id } as never).catch((e: Error) => `error: ${e.message}`);
  console.log(JSON.stringify({ user: P009_COMPOSIO_USER, connected }, null, 2));
} else {
  const toolkit = arg('--toolkit', 'googlesheets')!;
  const s = await c.createReadOnlyComposioSession(P009_COMPOSIO_USER);
  const link = await c.createComposioConnectionLink(P009_COMPOSIO_USER, { sessionId: s.session_id, toolkit, callbackUrl: 'http://localhost:5173/apps/connected', mode: 'read' });
  console.log(JSON.stringify({ user: P009_COMPOSIO_USER, toolkit: link.toolkit, openThisLink: link.redirectUrl }, null, 2));
}
