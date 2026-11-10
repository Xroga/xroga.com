import { describe, expect, it } from 'vitest';
import { directNavigation } from '../direct-url';

describe('directNavigation', () => {
  it('reads a bare domain after "go to"', () => {
    expect(directNavigation('Go to xroga.com and tell me the page heading and the URL. Do not click or type anything.')).toEqual({
      url: 'https://xroga.com/',
      newTab: false,
    });
  });

  it('keeps an explicit address and the new-tab request', () => {
    expect(directNavigation('Open https://stackendbox.com in a new tab, read the page heading, and tell me the heading and URL.')).toEqual({
      url: 'https://stackendbox.com/',
      newTab: true,
    });
  });

  it('keeps a path and strips trailing punctuation', () => {
    expect(directNavigation('Visit www.example.com/pricing, then summarise it.')?.url).toBe('https://www.example.com/pricing');
  });

  it('leaves everything else to the model', () => {
    expect(directNavigation('Find the best laptop under $800')).toBeNull();
    expect(directNavigation('Tell me what xroga.com does')).toBeNull();
    expect(directNavigation('Compare xroga.com and example.com prices')).toBeNull();
    expect(directNavigation('Go to example.com and then to example.org')).toBeNull();
    expect(directNavigation('Open report.pdf and summarise it')).toBeNull();
    expect(directNavigation('Go to the pricing page')).toBeNull();
  });
});
