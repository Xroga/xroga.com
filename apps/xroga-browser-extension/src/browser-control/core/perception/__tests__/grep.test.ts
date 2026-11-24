import { describe, expect, it } from 'vitest';
import { grepContent } from '../grep';

const page = ['# Pricing', 'Starter 10 pounds', 'Pro 30 pounds', 'Enterprise on request', '## Contact', 'Call 0113 000 1111', 'Email hello@a.test', 'Footer'].join('\n');

describe('grepContent', () => {
  it('returns matching lines with their neighbours, numbered, case-insensitively', () => {
    const r = grepContent(page, 'PRO ', 1);
    expect(r.matches).toBe(1);
    expect(r.text).toContain('2- Starter 10 pounds');
    expect(r.text).toContain('3: Pro 30 pounds');
    expect(r.text).toContain('4- Enterprise on request');
  });
  it('takes a regular expression, and plain text when it is not one', () => {
    expect(grepContent(page, '\\d{4} \\d{3} \\d{4}', 0).text).toContain('6: Call 0113 000 1111');
    expect(grepContent('a (b\nc', '(b', 0).matches).toBe(1);
  });
  it('says so when nothing matches and caps the matches shown', () => {
    expect(grepContent(page, 'zebra').text).toMatch(/no line of the page contains "zebra"/);
    const many = Array.from({ length: 100 }, (_, i) => `row ${i} match`).join('\n');
    const r = grepContent(many, 'match', 0, 5);
    expect(r.matches).toBe(100);
    expect(r.text).toContain('95 more matching lines not shown');
  });
});
