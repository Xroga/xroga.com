import { describe, expect, it, vi } from 'vitest';
import { automaticWorkspaceConnect } from '../automatic-workspace-connect';

describe('automatic Workspace connection after worker startup', () => {
  it('retries a lost transport message once after an available worker status', async () => {
    const send = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('Worker starting'));
    const connect = automaticWorkspaceConnect(send);
    await connect.start();
    await connect.observe(undefined);
    expect(send).toHaveBeenCalledTimes(1);
    await connect.observe({ paired: false, connecting: false });
    await connect.observe({ paired: false, connecting: false });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not retry a delivered rejection, an authentication failure, or a disposed panel', async () => {
    const delivered = vi.fn<() => Promise<unknown>>().mockResolvedValue(false);
    const refused = automaticWorkspaceConnect(delivered);
    await refused.start();
    await refused.observe({ paired: false, connecting: false });
    expect(delivered).toHaveBeenCalledTimes(1);
    for (const state of [{ failure: 'sign-in' }, { paired: true }, { connecting: true }]) {
      const failed = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('Worker starting'));
      const guarded = automaticWorkspaceConnect(failed);
      await guarded.start();
      await guarded.observe(state);
      await guarded.observe({ paired: false, connecting: false });
      guarded.close();
      await guarded.start();
      expect(failed).toHaveBeenCalledTimes(1);
    }
  });
});
