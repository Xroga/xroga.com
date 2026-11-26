import { describe, expect, it } from 'vitest';
import { summarise } from '../summary';
import type { Lhr } from '../summary';

const lhr: Lhr = {
  lighthouseVersion: '13.6.0',
  finalDisplayedUrl: 'https://a.test/',
  configSettings: { formFactor: 'mobile', throttlingMethod: 'simulate' },
  categories: {
    performance: { title: 'Performance', score: 0.72, auditRefs: [{ id: 'unused-javascript', weight: 1 }, { id: 'render-blocking-resources', weight: 0 }] },
    accessibility: { title: 'Accessibility', score: 0.91, auditRefs: [{ id: 'image-alt', weight: 10 }, { id: 'label', weight: 7 }, { id: 'html-has-lang', weight: 3 }] },
    seo: { title: 'SEO', score: 1, auditRefs: [{ id: 'document-title', weight: 1 }] },
  },
  audits: {
    'first-contentful-paint': { displayValue: '1.4 s' },
    'largest-contentful-paint': { displayValue: '3.9 s' },
    'cumulative-layout-shift': { displayValue: '0.21' },
    'unused-javascript': { title: 'Reduce unused JavaScript', score: 0.3, scoreDisplayMode: 'metricSavings', displayValue: 'Est savings of 210 KiB', details: { type: 'opportunity', overallSavingsMs: 650, overallSavingsBytes: 215_040, items: [{ url: 'https://a.test/app.js' }] } },
    'render-blocking-resources': { title: 'Eliminate render-blocking resources', score: 0.5, scoreDisplayMode: 'metricSavings', details: { type: 'opportunity', overallSavingsMs: 300 } },
    'image-alt': { title: 'Images do not have alt text', score: 0, scoreDisplayMode: 'binary', details: { items: [{ node: { selector: 'img.hero', nodeLabel: 'Hero' } }, { node: { selector: 'img.logo' } }, { node: { selector: 'img.a' } }, { node: { selector: 'img.b' } }] } },
    label: { title: 'Form elements do not have labels', score: 0, scoreDisplayMode: 'binary', details: { items: [{ node: { selector: 'input#q' } }] } },
    'html-has-lang': { title: '<html> has a lang attribute', score: 1, scoreDisplayMode: 'binary' },
    'document-title': { title: 'Document has a title', score: 1, scoreDisplayMode: 'binary' },
  },
};

describe('summarise', () => {
  const out = summarise(lhr);
  it('gives the scores and the load metrics', () => {
    expect(out).toContain('scores (0 to 100): Performance 72 · Accessibility 91 · SEO 100');
    expect(out).toContain('load: FCP 1.4 s · LCP 3.9 s · CLS 0.21');
    expect(out).toContain('mobile, simulate throttling · Lighthouse 13.6.0');
  });
  it('lists the failing audits worst first with the elements concerned', () => {
    expect(out).toMatch(/Accessibility, worst first:\n- Images do not have alt text e\.g\. img\.hero; img\.logo; img\.a \(\+1 more\)\n- Form elements do not have labels e\.g\. input#q/);
    expect(out).not.toContain('has a lang attribute');
    expect(out).toContain('SEO: nothing failed');
  });
  it('names the biggest savings', () => {
    expect(out).toMatch(/biggest savings:\n- Reduce unused JavaScript: about 650 ms, 210 KB\n- Eliminate render-blocking resources: about 300 ms/);
  });
});
