import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isPublicMarketingPath, MARKETING_THEME } from './publicMarketing';
import { storageBootstrapScript } from './storageBootstrapScript';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the public marketing site renders one theme, whatever theme is stored', () => {
  assert.equal(MARKETING_THEME, 'black');
  // first paint: the boot script forces it on marketing routes (it mirrors isPublicMarketingPath)
  const boot = storageBootstrapScript();
  assert.match(boot, /if \(isMarketing\) core = 'black';/);
  for (const p of ['/workspace', '/dashboard', '/admin', '/settings', '/auth', '/onboarding', '/share', '/ref', '/os-preview']) {
    assert.ok(boot.includes(`"${p}"`), `${p} keeps its stored theme`);
  }
  // after hydration and on client navigation: the provider forces the same theme, without changing the stored choice
  const provider = read('../components/providers/ThemeProvider.tsx');
  assert.match(provider, /isPublicMarketingPath\(pathname\)\) \? MARKETING_THEME : null/);
  assert.doesNotMatch(provider, /setTheme\(MARKETING_THEME\)/, 'the workspace choice is never overwritten');
  assert.ok(isPublicMarketingPath('/') && isPublicMarketingPath('/pricing') && !isPublicMarketingPath('/workspace'));
});

test('no theme control anywhere in the public marketing chrome', () => {
  for (const f of ['../components/layout/PublicMarketingHeader.tsx', '../components/layout/PublicMarketingChrome.tsx', '../components/layout/MarketingFooter.tsx']) {
    assert.doesNotMatch(read(f), /ThemeSwitcher|ThemeToggle|Change website theme/, f);
  }
});

test('the boot script parses and picks the right theme per route (executed, not just read)', () => {
  const run = (pathname: string, stored: string) => {
    const store = new Map<string, string>([['xroga-theme', JSON.stringify({ state: { theme: stored } })]]);
    const attrs: Record<string, string> = {};
    const body = { classList: { list: new Set<string>(), add(c: string) { this.list.add(c); }, remove(...c: string[]) { c.forEach((x) => this.list.delete(x)); } }, style: {} as Record<string, string>, setAttribute() {} };
    const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; }, style: { setProperty() {} } as Record<string, unknown> }, body };
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    // eslint-disable-next-line no-new-func
    new Function('location', 'document', 'localStorage', 'MutationObserver', storageBootstrapScript())({ pathname }, document, localStorage, class {});
    return attrs['data-theme'];
  };
  assert.equal(run('/', 'white'), 'black');
  assert.equal(run('/pricing', 'beige'), 'black');
  assert.equal(run('/workspace', 'white'), 'white');
  assert.equal(run('/settings/profile', 'gray'), 'gray');
  assert.equal(run('/showcase/demo/preview', 'white'), 'white');
});
