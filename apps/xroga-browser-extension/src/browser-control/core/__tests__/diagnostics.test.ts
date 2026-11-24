import { describe, expect, it } from 'vitest';
import { DiagnosticsLog, formatCookies, formatDiagnostics, formatIssues, formatStorage, scrubText, stripUrl } from '../diagnostics';

describe('stripUrl', () => {
  it('drops the query and fragment, which can carry a token', () => {
    expect(stripUrl('https://a.test/api/save?token=abc123#x')).toBe('https://a.test/api/save?…');
    expect(stripUrl('https://a.test/api/save')).toBe('https://a.test/api/save');
    expect(stripUrl('data:text/html;base64,AAAA')).toBe('data:…');
  });
});

describe('scrubText', () => {
  it('hides long opaque strings and bounds the length', () => {
    expect(scrubText('bad key abcdefghijklmnopqrstuvwxyz0123456789ABCD rejected')).toBe('bad key … rejected');
    expect(scrubText('x'.repeat(500)).length).toBeLessThanOrEqual(241);
  });
});

describe('DiagnosticsLog', () => {
  const now = 10_000;
  it('keeps page requests with status and failure, not images or scripts', () => {
    const log = new DiagnosticsLog();
    log.request('1', 'POST', 'https://a.test/api/save?k=v', 'Fetch');
    log.response('1', 422);
    log.request('2', 'GET', 'https://a.test/logo.png', 'Image');
    log.request('3', 'GET', 'https://a.test/api/list', 'XHR');
    log.failed('3', 'net::ERR_CONNECTION_REFUSED');
    expect(log.net).toHaveLength(2);
    const lines = formatDiagnostics(log, { kind: 'network' }, Date.now());
    expect(lines.join('\n')).toContain('! POST https://a.test/api/save?… → 422');
    expect(lines.join('\n')).toContain('FAILED ERR_CONNECTION_REFUSED');
    expect(lines.join('\n')).not.toContain('logo.png');
    expect(now).toBe(10_000);
  });
  it('onlyProblems and urlPattern narrow the list', () => {
    const log = new DiagnosticsLog();
    log.request('1', 'GET', 'https://a.test/api/ok', 'Fetch');
    log.response('1', 200);
    log.request('2', 'GET', 'https://a.test/api/bad', 'Fetch');
    log.response('2', 500);
    log.log('log', 'hello');
    log.log('error', 'TypeError: x is undefined');
    const problems = formatDiagnostics(log, { onlyProblems: true }).join('\n');
    expect(problems).toContain('/api/bad');
    expect(problems).not.toContain('/api/ok');
    expect(problems).toContain('TypeError');
    expect(problems).not.toContain('hello');
    expect(formatDiagnostics(log, { kind: 'network', urlPattern: 'ok$' }).join('\n')).toContain('/api/ok');
  });
  it('is bounded', () => {
    const log = new DiagnosticsLog();
    for (let i = 0; i < 500; i++) log.log('log', `m${i}`);
    expect(log.console.length).toBe(300);
  });
});

describe('endpoint map', () => {
  it('groups API calls by method and path, folds ids, and keeps neither query values nor bodies', () => {
    const log = new DiagnosticsLog();
    const calls: Array<[string, string, string, number]> = [
      ['GET', 'https://a.test/api/users/17?token=SECRET', 'Fetch', 200],
      ['GET', 'https://a.test/api/users/18', 'Fetch', 200],
      ['GET', 'https://a.test/api/users/19', 'XHR', 404],
      ['POST', 'https://a.test/api/orders', 'Fetch', 201],
      ['GET', 'https://a.test/logo.png', 'Image', 200],
    ];
    calls.forEach(([m, u, t, s], i) => {
      log.request(String(i), m, u, t);
      log.response(String(i), s);
    });
    const text = formatDiagnostics(log, { kind: 'endpoints' }).join('\n');
    expect(text).toContain('2 from 4 API calls');
    expect(text).toContain('GET https://a.test/api/users/:id × 3 → 200, 404');
    expect(text).toContain('POST https://a.test/api/orders × 1 → 201');
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('logo.png');
  });

  it('says what to do when nothing was seen', () => {
    expect(formatDiagnostics(new DiagnosticsLog(), { kind: 'endpoints' })[0]).toContain('no API calls seen yet');
  });
});

describe('cookies and storage', () => {
  it('shows cookie names and flags, never values, and says what looks wrong', () => {
    const out = formatCookies(
      [
        { name: 'session_id', domain: 'a.test', path: '/', secure: false, httpOnly: false, sameSite: 'None', session: true },
        { name: 'theme', domain: 'a.test', path: '/', secure: true, httpOnly: false, sameSite: 'Lax', expires: Date.now() / 1000 + 86_400 * 30 },
      ],
      'https://a.test/',
    ).join('\n');
    expect(out).toContain('2 for this page (values are never shown)');
    expect(out).toMatch(/session_id .* not Secure, readable by scripts, SameSite=None · session .* add Secure.*SameSite=None needs Secure.*add HttpOnly/);
    expect(out).toMatch(/theme .* Secure, readable by scripts, SameSite=Lax · expires in 30 days$/m);
  });
  it('says so when there are no cookies', () => {
    expect(formatCookies([], 'https://a.test/')[0]).toMatch(/none are set/);
  });
  it('lists storage keys with sizes only', () => {
    const out = formatStorage({ local: [['token', 120], ['theme', 4]], session: [] }).join('\n');
    expect(out).toContain('localStorage · 2 keys, 124 characters');
    expect(out).toContain('token · 120 characters');
    expect(out).toContain('sessionStorage · 0 keys');
  });
});

describe('browser-reported issues', () => {
  it('groups the browser\'s own issues with counts and says what to do, without query strings', () => {
    const out = formatIssues([
      { code: 'MixedContentIssue', details: { mixedContentIssueDetails: { resourceType: 'Image', resolutionStatus: 'MixedContentBlocked', insecureURL: 'http://cdn.test/a.png?token=secret' } } },
      { code: 'MixedContentIssue', details: { mixedContentIssueDetails: { resourceType: 'Image', resolutionStatus: 'MixedContentBlocked', insecureURL: 'http://cdn.test/b.png' } } },
      { code: 'LowTextContrastIssue', details: { lowTextContrastIssueDetails: { contrastRatio: 2.1, thresholdAA: 4.5, violatingNodeSelector: 'p.hint' } } },
      { code: 'GenericIssue', details: { genericIssueDetails: { errorType: 'FormInputWithNoLabelError' } } },
      { code: 'CookieIssue', details: { cookieIssueDetails: { cookie: { name: 'sid' }, cookieWarningReasons: ['WarnSameSiteNoneInsecure'] } } },
    ]).join('\n');
    expect(out).toContain('4 kinds, 5 in all');
    expect(out).toMatch(/2× mixed content: a Image from cdn\.test on a secure page was blocked/);
    expect(out).toContain('low text contrast 2.10:1 on p.hint');
    expect(out).toContain('form input with no label error');
    expect(out).toContain('SameSite=None needs Secure');
    expect(out).not.toContain('token=secret');
  });
  it('says so when there are none', () => {
    expect(formatIssues([])[0]).toMatch(/no issues/);
  });
});
