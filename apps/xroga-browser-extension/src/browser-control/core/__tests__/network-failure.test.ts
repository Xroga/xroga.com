import { describe, expect, it } from 'vitest';
import { networkFailure } from '../tools/navigate';

describe('networkFailure', () => {
  it('names a DNS failure and says not to repeat it unchanged', () => {
    const result = networkFailure('net::ERR_NAME_NOT_RESOLVED at https://xroga.com/');
    expect(result?.code).toBe('ERR_NAME_NOT_RESOLVED');
    expect(result?.message).toContain('DNS lookup failed');
    expect(result?.message).toContain('nothing on the page changed');
    expect(result?.hint).toContain('already tried twice');
    expect(result?.hint).toContain('do not guess another address');
  });

  it('names connection and certificate failures', () => {
    expect(networkFailure('net::ERR_CONNECTION_REFUSED')?.message).toContain('refused the connection');
    expect(networkFailure('net::ERR_CERT_DATE_INVALID')?.message).toContain('certificate');
    expect(networkFailure('net::ERR_SOMETHING_NEW')?.message).toContain('Chrome could not load the page');
  });

  it('lets a cancelled load continue from the tab state', () => {
    expect(networkFailure('net::ERR_ABORTED')?.hint).toContain('snapshot');
  });

  it('ignores errors that are not Chrome network errors', () => {
    expect(networkFailure('Debugger is not attached')).toBeUndefined();
    expect(networkFailure('Navigation timeout of 30000 ms exceeded')).toBeUndefined();
  });
});
