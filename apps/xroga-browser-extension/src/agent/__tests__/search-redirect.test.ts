import { describe, expect, it } from 'vitest';
import { searchUrlToQuery } from '../search-redirect';

describe('searchUrlToQuery', () => {
  it('recognises the results pages of the three engines and reads the query', () => {
    expect(searchUrlToQuery('https://www.google.com/search?q=seo+agency+leeds&hl=en')).toEqual({ engine: 'google', query: 'seo agency leeds' });
    expect(searchUrlToQuery('https://www.google.co.uk/search?hl=en&q=plumber%20york')).toEqual({ engine: 'google', query: 'plumber york' });
    expect(searchUrlToQuery('https://www.bing.com/search?q=dentist')).toEqual({ engine: 'bing', query: 'dentist' });
    expect(searchUrlToQuery('https://duckduckgo.com/?q=roofing+leeds&ia=web')).toEqual({ engine: 'duckduckgo', query: 'roofing leeds' });
    expect(searchUrlToQuery('https://html.duckduckgo.com/html/?q=x+y')).toEqual({ engine: 'duckduckgo', query: 'x y' });
  });

  it('leaves everything else alone: ordinary pages, an engine home page, other schemes, a missing or huge query', () => {
    expect(searchUrlToQuery('https://example.com/search?q=shoes')).toBeNull();
    expect(searchUrlToQuery('https://www.google.com/')).toBeNull();
    expect(searchUrlToQuery('https://www.google.com/maps?q=leeds')).toBeNull();
    expect(searchUrlToQuery('http://www.google.com/search?q=leeds')).toBeNull();
    expect(searchUrlToQuery('https://www.bing.com/search?q=')).toBeNull();
    expect(searchUrlToQuery(`https://www.bing.com/search?q=${'a'.repeat(400)}`)).toBeNull();
    expect(searchUrlToQuery('not a url')).toBeNull();
  });
});
