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
  it('finds the tab in "On this open Variant contact form tab, fill ..."', () => {
    const c = namedTabCandidates('On this open Variant contact form tab, fill Name Grace Hopper, Email grace@example.test, and save it once.');
    expect(c).toContain('variant');
    expect(c).toContain('contact');
  });
  it('finds the tab for "the open Orders dashboard page" and ignores unrelated requests', () => {
    expect(namedTabCandidates('In the open Orders dashboard page, export the table')).toContain('orders');
    expect(namedTabCandidates('Find me a contact form for a plumber')).toEqual([]);
    expect(namedTabCandidates('Fill the form on example.com')).toEqual([]);
  });
});
