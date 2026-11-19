import { describe, expect, it } from 'vitest';
import { namedTabCandidates } from '../tab-intent';

describe('which open tab a request names', () => {
  it('finds the product named in "use my TraceDraw tab (already open in this window)"', () => {
    expect(namedTabCandidates('Use my TraceDraw tab (already open in this window). In a new document, draw a blue rectangle and a red circle.')).toContain('tracedraw');
  });
  it('finds a host name', () => {
    expect(namedTabCandidates('I have opened tracedraw.github.io in my browser, make a logo')).toContain('tracedraw.github.io');
  });
  it('does nothing unless the user says a tab is already open, and ignores ordinary words', () => {
    expect(namedTabCandidates('Open TraceDraw and draw a blue rectangle')).toEqual([]);
    expect(namedTabCandidates('Use my tab: draw a blue rectangle and export it')).toEqual([]);
  });
});
