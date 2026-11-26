import { describe, expect, it } from 'vitest';
import { getWorkspaceExtensionStatus, WORKSPACE_URL } from '../workspace';

const message = { type: 'xroga.browser.status.v1' };
const sender = { origin: 'https://xroga.com', url: WORKSPACE_URL, frameId: 0 };

describe('Workspace extension discovery', () => {
  it('reports an installed but unpaired extension to the top-level Workspace', () => {
    expect(getWorkspaceExtensionStatus(message, sender)).toEqual({ protocol: 1, installed: true, paired: false });
    expect(getWorkspaceExtensionStatus(message, { ...sender, url: WORKSPACE_URL + '?chat=local' })).toBeDefined();
  });

  it.each([
    { origin: 'https://other.test' },
    { url: 'https://xroga.com.attacker.test/workspace' },
    { url: 'https://xroga.com/workspace/other' },
    { url: 'https://xroga.com/account' },
    { url: 'invalid' },
    { frameId: 2 },
    { frameId: undefined },
  ])('rejects unauthorized or ambiguous senders: %j', override => {
    expect(getWorkspaceExtensionStatus(message, { ...sender, ...override })).toBeUndefined();
  });

  it.each([null, 'xroga.browser.status.v1', { ...message, tab: 123 }, { type: 'xroga.browser.run' }])(
    'rejects a malformed request or any attempt to run a task: %j',
    value => {
      expect(getWorkspaceExtensionStatus(value, sender)).toBeUndefined();
    },
  );
});
