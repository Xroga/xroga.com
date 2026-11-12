import { describe, expect, it } from 'vitest';
import { answerDirect, directRead, pickHeading, sameSite } from '../direct-read';

describe('directRead: only a plain open-and-read goes to Route A', () => {
  it.each([
    ['Open chatgpt.com and read the first visible heading.', 'chatgpt.com', 'heading'],
    ['open https://example.com and tell me the heading of the page', 'example.com', 'heading'],
    ['Go to iana.org then read the title', 'iana.org', 'title'],
    ['visit www.wikipedia.org and get the main heading', 'www.wikipedia.org', 'heading'],
    ["Open example.com, what's the first headline?", 'example.com', 'heading'],
  ])('%s', (text, host, what) => {
    const r = directRead(text);
    expect(r?.what).toBe(what);
    expect(new URL(r!.url).hostname).toBe(host);
  });

  it.each([
    'Open example.com and click the first link and read the heading',
    'Open example.com and read the heading of each section',
    'Open example.com and summarize the page',
    'Open example.com and tell me why the heading says that',
    'Open example.com and iana.org and read the heading',
    'Open example.com and read the heading, then open iana.org',
    'Read the heading of example.com',
    'Open example.com',
    'Open example.com and search for cats',
    'Open example.com and read the heading if it says Example',
    'Open example.com and read the heading\nthen fill the form',
  ])('goes to the model: %s', text => {
    expect(directRead(text)).toBeNull();
  });
});

describe('pickHeading', () => {
  it('prefers the first level-1 heading and ignores empty ones', () => {
    const outline = ['main', '  heading "Menu" (level 3)', '  heading "" (level 1)', '  [e4] heading "Example   Domain" (level 1)', '  heading "More" (level 2)'].join('\n');
    expect(pickHeading(outline)).toBe('Example Domain');
  });
  it('reads markdown headings from a read result', () => {
    const read = ['<<<page-content abc>>>', '## Menu', '', '# [Example](https://x.test) Domain', 'text', '<<<end-page-content abc>>>'].join('\n');
    expect(pickHeading(read)).toBe('Example Domain');
    expect(pickHeading('plain text only')).toBeNull();
  });
  it('falls back to the first heading, and to null when there is none', () => {
    expect(pickHeading('  heading "Only" (level 2)\n  heading "Later" (level 1)')).toBe('Later');
    expect(pickHeading('  heading "Only" (level 2)')).toBe('Only');
    expect(pickHeading('main\n  link "x"')).toBeNull();
  });
});

describe('answerDirect: the page must really show it', () => {
  const ask = directRead('open example.com and read the heading')!;
  const page = (over: Partial<{ url: string; title: string; outline: string }> = {}) => ({
    url: 'https://example.com/',
    title: 'Example Domain',
    outline: 'main\n  heading "Example Domain" (level 1)',
    ...over,
  });
  it('answers from the observed heading and title', () => {
    expect(answerDirect(ask, page())?.text).toContain('Example Domain');
    expect(answerDirect({ ...ask, what: 'title' }, page({ title: 'My  Title' }))?.text).toContain('My Title');
  });
  it('hands over when the site redirected elsewhere, a challenge or login stands in the way, or no heading exists', () => {
    expect(answerDirect(ask, page({ url: 'https://other.test/' }))).toBeNull();
    expect(answerDirect(ask, page({ title: 'Just a moment...' }))).toBeNull();
    expect(answerDirect(ask, page({ outline: 'main\n  heading "Please log in" (level 1)' }))).toBeNull();
    expect(answerDirect(ask, page({ outline: 'main\n  link "x"' }))).toBeNull();
  });
  it('treats www and the bare host as the same site', () => {
    expect(sameSite('https://example.com/', 'https://www.example.com/a')).toBe(true);
    expect(sameSite('https://example.com/', 'https://evil.example.org/')).toBe(false);
  });
});
