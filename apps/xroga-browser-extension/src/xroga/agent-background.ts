import { runManager } from '@src/extension';
import { listenForWorkspace, postWorkspace } from './bridge';
import { SEARCH_HOME, browserTarget } from './navigation';
import { XROGA_REF } from './model';
import { putBlob } from '@src/store/conversations';

listenForWorkspace(
  async (goal, rawTarget, files) => {
    const target = rawTarget ? browserTarget(rawTarget) : SEARCH_HOME;
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
      const attachments = await Promise.all(
        files.map(async file => {
          const data = new Blob([file.text], { type: 'text/plain' });
          const ref = { id: crypto.randomUUID(), name: file.name, mimeType: data.type, size: data.size };
          await putBlob({ ...ref, data, conversationId: '', createdAt: new Date().toISOString() });
          return ref;
        }),
      );
      await runManager.handle(connection, {
        type: 'send',
        tabId: tab.id,
        conversationId: null,
        text: goal,
        startUrl: target,
        mode: 'ask',
        model: XROGA_REF,
        reasoning: 'none',
        attachments,
        context: [],
      });
      postWorkspace({ type: 'task-opened' });
    } finally {
      connection.unsubscribe?.();
    }
  },
  runId => runManager.stopCanonical(runId),
);
