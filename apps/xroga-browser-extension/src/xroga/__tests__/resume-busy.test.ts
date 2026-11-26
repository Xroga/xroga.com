import { describe, expect, it, vi } from 'vitest';

vi.mock('../bridge', () => ({ workspaceRequest: vi.fn() }));
import { resumeRun } from '../model';

const busy = () => Object.assign(new Error('BROWSER_RUN_BUSY'), { status: 409, code: 'BROWSER_RUN_BUSY' });

describe('resuming a run the killed worker left leased', () => {
  it('asks again while the server answers BROWSER_RUN_BUSY and returns the first real answer', async () => {
    const request = vi.fn().mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockResolvedValue({ runId: 'r', turns: 3 });
    expect(await resumeRun('run-1', new AbortController().signal, request as never, 1)).toEqual({ runId: 'r', turns: 3 });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenCalledWith('resume', { runId: 'run-1' }, expect.anything());
  });
  it('does not retry any other error', async () => {
    const inactive = Object.assign(new Error('BROWSER_RUN_INACTIVE'), { status: 409, code: 'BROWSER_RUN_INACTIVE' });
    const request = vi.fn().mockRejectedValue(inactive);
    await expect(resumeRun('run-1', new AbortController().signal, request as never, 1)).rejects.toBe(inactive);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('stops waiting when the run is stopped', async () => {
    const controller = new AbortController();
    const request = vi.fn(async () => { controller.abort(); throw busy(); });
    await expect(resumeRun('run-1', controller.signal, request as never, 1)).rejects.toThrow('BROWSER_RUN_BUSY');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
