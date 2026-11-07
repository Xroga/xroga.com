import { runManager } from '@src/extension';
import { listenForWorkspace, postWorkspace } from './bridge';
import { browserTarget } from './navigation';
import { XROGA_REF } from './model';

listenForWorkspace(
  async (goal, rawTarget) => {
    const target = browserTarget(rawTarget);
    if (!target) throw new Error('Enter a valid HTTPS address or search.');
    const tab = await chrome.tabs.create({ url: 'about:blank' });
    if (tab.id === undefined) throw new Error('Could not open Chrome tab.');
    const connection = {
      tabId: tab.id,
      conversationId: null as string | null,
      sink: () => undefined,
      unsubscribe: undefined as (() => void) | undefined,
    };
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
    try {
      await runManager.handle(connection, {
        type: 'send',
        tabId: tab.id,
        conversationId: null,
        text: goal,
        startUrl: target,
        mode: 'ask',
        model: XROGA_REF,
        reasoning: 'none',
        attachments: [],
        context: [],
      });
      postWorkspace({ type: 'task-opened' });
    } finally {
      connection.unsubscribe?.();
    }
  },
  runId => runManager.stopCanonical(runId),
);
