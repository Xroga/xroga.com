import { describe, expect, it } from 'vitest';
import { normalize, numbersIn, scoreAnswer, scoreList, scoreNumber, scoreUrl } from '../../../fixtures/acceptance/scorers.mjs';
import tasks from '../../../fixtures/acceptance/tasks.json';

describe('acceptance scorers', () => {
  it('normalises case, accents, quotes and spaces', () => {
    expect(normalize('  “Bolt  &  Nut” Ltd, Zürich ')).toBe('bolt & nut ltd, zurich');
  });
  it('reads numbers with separators and units', () => {
    expect(numbersIn('$1,250.50 and 12 % and 4.2 metres')).toEqual([1250.5, 12, 4.2]);
  });
  it('scores a number by closeness', () => {
    expect(scoreNumber('total: 295 units', 295, 0).score).toBe(1);
    expect(scoreNumber('about 290', 295, 0).score).toBeGreaterThan(0.9);
    expect(scoreNumber('about 290', 295, 0).score).toBeLessThan(1);
    expect(scoreNumber('none', 295).score).toBe(0);
  });
  it('scores contains_all by the share found and names what is missing', () => {
    const r = scoreAnswer({ type: 'contains_all', values: ['19.80', '1,200', 'Managing board'] }, 'Express is 19.80 EUR, 1,200 pallets.');
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.detail).toMatch(/missing: Managing board/);
  });
  it('gives nothing to an answer that states a forbidden value', () => {
    const r = scoreAnswer({ type: 'contains_all', values: ['60'], forbidden: ['Report #10'] }, 'The last is 60, after Report #10');
    expect(r.score).toBe(0);
    expect(r.detail).toMatch(/states a wrong value/);
  });
  it('scores lists by F1 and urls by address', () => {
    expect(scoreList('a and b', ['a', 'b', 'c']).score).toBeCloseTo(0.8, 1);
    expect(scoreUrl('see https://x.test/a/?q=1#top', 'https://x.test/a').score).toBe(1);
    expect(scoreUrl('see https://x.test/b', 'https://x.test/a').score).toBe(0);
  });
  it('combines parts with all', () => {
    const r = scoreAnswer({ type: 'all', parts: [{ type: 'contains_all', values: ['East'] }, { type: 'number', value: 295, tolerance: 0 }] }, 'East, 295 units');
    expect(r.score).toBe(1);
  });
  it('has a scorable expectation in every registered task, and a perfect answer scores 1', () => {
    const perfect: Record<string, string> = {
      'A1-xlsx-orders': 'Bolt & Nut Ltd has not paid (row 3); last order 2026-03-01 in row 4',
      'A2-docx-agreement': 'Express 19.80 EUR; 1,200 pallets; Managing board; 45 days',
      'A3-article-fees': '4.2 metres, 790 euros, harbour master Tomas Reyes, harbour@gazette.example',
      'A4-hold-reveal': 'The code is 4821',
      'A5-endless-feed': 'The last report is Report #60',
      'A6-epub-storm': 'The storm of April chapter, 14 April, 951 millibars (The Storm of April)',
      'A7-pptx-results': 'Slide 1: Q4 results: revenue 4.2M up 11 percent, churn 2.1 percent',
      'A8-csv-analysis': 'East sold the most: 143 + 152 = 295',
    };
    for (const t of tasks as unknown as Array<{ name: string; expect: never }>) {
      expect(perfect[t.name], t.name).toBeTruthy();
      expect(scoreAnswer(t.expect, perfect[t.name]).score, t.name).toBe(1);
    }
  });
});
