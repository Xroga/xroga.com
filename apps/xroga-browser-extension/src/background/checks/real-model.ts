// Acceptance runs with the REAL model: the product code (WXT_AUTORUN_PRODUCT=1) against the staging backend, with a throwaway staging account.
// The check enrolls this Chrome as a device for that account (the same authorize and exchange steps as pairing), then sends real tasks from the
// side panel and measures each: wall time, model turns and the final answer. It needs args { jwt, account }; nothing here runs in a normal build.
import { BROWSER_API_ORIGIN } from '@src/xroga/workspace';
import { workspacePaired } from '@src/xroga/bridge';
import { deviceProof, directConfigured, directReady, enrollDevice, savedDevice, verifyDevice } from '@src/xroga/device';
import { activeBranch, getRun, listConversations } from '@src/store/conversations';
import { defineCheck } from './registry';
import { sleep, waitForLoad } from './helpers';
import { panel } from './panel-chat';

const BASE = `${BROWSER_API_ORIGIN}/api/browser/local`;

const DEFAULT_TASKS = [
  { name: 'simple-read', text: 'Open https://example.com and tell me the heading of the page.', url: 'https://example.com/' },
  {
    name: 'three-pages',
    text: 'Open https://example.com, https://www.iana.org and https://www.wikipedia.org and tell me the main heading of each page.',
    url: 'https://example.com/',
  },
];

defineCheck({
  name: 'real-model',
  title: 'Real model acceptance',
  description: 'Enrolls this Chrome as a device for a staging test account and runs real tasks through the panel, measuring each.',
  async run(args: Record<string, unknown>) {
    const jwt = String(args.jwt ?? '');
    const account = String(args.account ?? '');
    if (!jwt || !account) throw new Error('args { jwt, account } are required');
    const tasks = (Array.isArray(args.tasks) ? args.tasks : DEFAULT_TASKS) as typeof DEFAULT_TASKS;
    const maxPolls = Number(args.maxPolls ?? 600);

    const report0: Record<string, unknown> = {};
    const { verifier, challenge } = await deviceProof();
    const authorized = await fetch(`${BASE}/device/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ extensionId: chrome.runtime.id, challenge }),
    });
    const body = (await authorized.json()) as { code?: string; error?: string };
    if (!authorized.ok) throw new Error(`device authorize ${authorized.status}: ${body.error ?? ''}`);
    await enrollDevice(account, verifier, body);
    const verified = await verifyDevice().catch(error => String(error));
    report0.device = { configured: directConfigured(), saved: !!(await savedDevice()), verified, ready: directReady() };

    const window = (await chrome.windows.getCurrent()).id!;
    const report: Record<string, unknown> = { extensionId: chrome.runtime.id, device: report0.device, tasks: [], polls: [] };
    for (const task of tasks) {
      const page = await chrome.tabs.create({ windowId: window, url: task.url, active: false });
      await waitForLoad(page.id!);
      const view = await chrome.tabs.create({ windowId: window, url: chrome.runtime.getURL(`/sidepanel.html#tab=${page.id}`), active: false });
      await waitForLoad(view.id!);
      await sleep(1500);
      const before = new Set((await listConversations()).map(c => c.id));
      const started = Date.now();
      let status = '';
      let last = '';
      try {
        // Ask mode waits for a person to approve each change; args.auto runs the task in Auto mode, which is a product setting.
        if (args.auto) await panel(page.id!, 'select', { label: 'Mode', value: 'auto' }).catch(() => undefined);
        await panel(page.id!, 'type-send', { text: task.text });
        let conversationId: string | undefined;
        for (let i = 0; i < maxPolls; i++) {
          const read = await panel(page.id!, 'read');
          last = read.transcript;
          conversationId ??= (await listConversations()).find(c => !before.has(c.id))?.id;
          const run = conversationId ? await getRun(conversationId) : undefined;
          status = run?.status ?? 'starting';
          if (i % 20 === 0) (report.polls as unknown[]).push({ i, bridgePaired: workspacePaired(), status, turns: run?.turns, transcript: last.slice(-120) });
          // 'interrupted' with the reason 'Syncing the saved result' is the short moment after a run ends while its result is sent to the server.
          // With args.approve, the check plays the person: it presses the first approval button of a waiting card (and records which).
          if (args.approve && status === 'awaiting_user' && i % 10 === 0) {
            (report.polls as unknown[]).push({ i, waitingButtons: (read.buttons ?? []).slice(0, 14), body: String(read.body ?? '').slice(-260) });
          }
          if (args.approve && status === 'awaiting_user') {
            // The card's buttons are not in `buttons`; its text names "Allow" and "Deny". Press Allow (this action only).
            if (/\nAllow\n/.test(String(read.body ?? ''))) {
              (report.polls as unknown[]).push({ i, pressed: 'Allow', asked: String(read.body ?? '').match(/Asked because[^\n]*/)?.[0] });
              await panel(page.id!, 'click', { label: 'Allow' }).catch(() => undefined);
            }
          }
          // A hand-over (ask_user takeover) is answered by the person pressing Done; the check plays the person only when args.done is set.
          if (args.done && status === 'awaiting_user' && /\nDone\n/.test(String(read.body ?? ''))) {
            (report.polls as unknown[]).push({ i, pressed: 'Done', body: String(read.body ?? '').slice(-300) });
            await panel(page.id!, 'click', { label: 'Done' }).catch(() => undefined);
          }
          const syncing = status === 'interrupted' && /Syncing/i.test(run?.reason ?? '');
          if (!syncing && ['done', 'failed', 'stopped', 'capped', 'interrupted'].includes(status)) break;
          await sleep(500);
        }
        const ms = Date.now() - started;
        const conversation = (await listConversations()).find(c => !before.has(c.id));
        const run = conversation ? await getRun(conversation.id) : undefined;
        // Which tools the model called, and what the postconditions and confirm_download said (evidence of how it really behaved).
        const used: string[] = [];
        const evidence: string[] = [];
        if (conversation) {
          for (const e of await activeBranch(conversation.id)) {
            if (e.type !== 'message' || e.message.role !== 'tool') continue;
            for (const p of e.message.parts) {
              if (p.type !== 'tool-result') continue;
              used.push(p.toolName);
              const post = (e.result as { receipt?: { postcondition?: { status?: string; detail?: string } } } | undefined)?.receipt?.postcondition;
              if (post) evidence.push(`${p.toolName}: expect ${post.status}${post.detail ? ` (${post.detail.slice(0, 100)})` : ''}`);
              if (p.toolName === 'confirm_download') evidence.push(p.text.slice(0, 160));
            }
          }
        }
        (report.tasks as unknown[]).push({
          used,
          evidence,
          name: task.name,
          status,
          seconds: Math.round(ms / 100) / 10,
          turns: run?.turns,
          reason: run?.reason,
          answer: last.slice(-3000),
        });
      } finally {
        for (const t of [view, page]) await chrome.tabs.remove(t.id!).catch(() => undefined);
      }
    }
    return report;
  },
});
