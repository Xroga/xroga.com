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
      'R1-csv-airtravel': 'JUL 1960 had the most, 622; July 1960 had 131 more than July 1958 (491)',
      'R2-xlsx-rows': 'Columns: SR., NAME, GENDER, AGE, DATE, COUNTRY; 2721 data rows',
      'R3-pptx-slide': '1 slide: Presentation Title Text and Subtitle Text',
      'R4-article-essay': 'How to Do Great Work, July 2023: natural aptitude, deep interest, scope to do great work',
      'R5-page-data': 'x.com/ThePSF, linkedin python-software-foundation; feeds: Python Software Foundation News, Python Job Opportunities, Python Enhancement Proposals',
      'R6-endless-quotes': '100 quotes; the last is by George R.R. Martin',
    };
    for (const t of tasks as unknown as Array<{ name: string; expect: never }>) {
      expect(perfect[t.name], t.name).toBeTruthy();
      expect(scoreAnswer(t.expect, perfect[t.name]).score, t.name).toBe(1);
    }
  });
});
