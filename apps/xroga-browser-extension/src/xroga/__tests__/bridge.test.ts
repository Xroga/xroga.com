import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceTabKey = 'xroga-browser-workspace-tab';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Workspace tab recovery', () => {
  it.each([
    { name: 'reuses its blank tab', pendingUrl: undefined, target: 7 },
    { name: 'leaves a different pending site alone', pendingUrl: 'https://example.org/', target: 8 },
  ])('$name on manual reconnect', async ({ pendingUrl, target }) => {
    const listener = vi.fn();
    const id = 'a'.repeat(32);
    const tabs = {
      get: vi.fn().mockResolvedValue({ id: 7, url: 'about:blank', pendingUrl }),
      create: vi.fn().mockResolvedValue({ id: 8 }),
      update: vi.fn().mockResolvedValue(undefined),
      onRemoved: { addListener: vi.fn() },
    };
    vi.stubGlobal('chrome', {
      tabs,
      storage: {
        session: { get: vi.fn().mockResolvedValue({ [workspaceTabKey]: 7 }), set: vi.fn().mockResolvedValue(undefined) },
      },
      runtime: {
        id,
        onMessage: { addListener: listener },
        onMessageExternal: { addListener: vi.fn() },
        onConnectExternal: { addListener: vi.fn() },
      },
    });
    const { listenForWorkspace } = await import('../bridge');
    const noop = async () => {};
    listenForWorkspace(noop, noop, noop, noop, noop);

    const response = await new Promise(resolve => {
      listener.mock.calls[0][0](
        { type: 'xroga.browser.connect.v1' },
        { id, url: `chrome-extension://${id}/sidepanel.html` },
        resolve,
      );
    });

    expect(response).toBe(true);
    expect(tabs.create).toHaveBeenCalledTimes(target === 7 ? 0 : 1);
    expect(tabs.update).toHaveBeenCalledExactlyOnceWith(target, {
      url: expect.stringMatching(/^https:\/\/xroga\.com\/workspace\?browserExtension=.*&browserPair=/),
      active: true,
    });
  });
});
