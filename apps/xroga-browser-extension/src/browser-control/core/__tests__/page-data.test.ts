import { describe, expect, it } from 'vitest';
import { formatArticle, formatPageData, articleExpression, pageDataExpression, type RawPageData } from '../page-data';

describe('formatArticle', () => {
  const body = `## Section\n\n${'A sentence about the harbour. '.repeat(12)}`;
  it('puts title, byline and date above the text and drops the repeated title heading', () => {
    const r = formatArticle({ ok: true, title: 'Tides', byline: 'By Mira', siteName: 'Gazette', publishedTime: '2026-11-20', markdown: `# Tides\n\n${body}` }, 'fallback');
    expect(r.usable).toBe(true);
    expect(r.text.startsWith('# Tides\nby By Mira · Gazette · published 2026-11-20')).toBe(true);
    expect(r.text.match(/# Tides/g)).toHaveLength(1);
  });
  it('says plainly when a page has no article body', () => {
    const r = formatArticle({ ok: false, readerable: false, error: 'no article body found' }, 'x');
    expect(r.usable).toBe(false);
    expect(r.text).toMatch(/does not read as an article/);
    expect(formatArticle({ ok: true, markdown: 'short' }, 'x').usable).toBe(false);
  });
});

describe('formatPageData', () => {
  const raw: RawPageData = {
    title: 'Shop', url: 'https://s.example/p/1', canonical: 'https://s.example/p/1?ref=a', lang: 'en',
    meta: { 'og:title': 'Mug', description: 'A mug' },
    jsonld: [{ '@type': 'Product', name: 'Mug', offers: { '@type': 'Offer', price: '12.50', priceCurrency: 'EUR' } }],
    microdata: [{ type: 'Organization', props: { name: 'Shop', telephone: '+1 555 0100' } }],
    emails: ['hi@s.example'], phones: ['+1 555 0100'], social: { x: ['https://x.com/shop'] }, feeds: [], headings: ['h1 Mug'],
  };
  it('lists every kind of data that was found', () => {
    const t = formatPageData(raw);
    expect(t).toMatch(/Product: .*price: 12\.50/);
    expect(t).toMatch(/og:title: Mug/);
    expect(t).toMatch(/Organization: \{name: Shop, telephone: \+1 555 0100\}/);
    expect(t).toMatch(/Email addresses: hi@s\.example/);
    expect(t).toMatch(/x: https:\/\/x\.com\/shop/);
    expect(t).toMatch(/canonical: /);
  });
  it('says so when a page publishes nothing', () => {
    expect(formatPageData({ ...raw, meta: {}, jsonld: [], microdata: [], emails: [], phones: [], social: {} })).toMatch(/publishes no structured data/);
  });
});

describe('page scripts', () => {
  it('are valid JavaScript expressions', () => {
    expect(() => new Function(`return ${articleExpression()}`)).not.toThrow();
    expect(() => new Function(`return ${pageDataExpression()}`)).not.toThrow();
  });
});
