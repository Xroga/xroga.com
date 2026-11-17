import { describe, expect, it } from 'vitest';
import { parseUrl } from '../navigate';

describe('navigation addresses', () => {
  it('opens a public http:// site over https, as Chrome HTTPS-first does', () => {
    expect(parseUrl('http://www.example.com/contact')).toBe('https://www.example.com/contact');
    expect(parseUrl('example.com/about')).toBe('https://example.com/about');
  });

  it('leaves local addresses, numeric addresses and any address with a port as written', () => {
    expect(parseUrl('http://127.0.0.1:8080/a')).toBe('http://127.0.0.1:8080/a');
    expect(parseUrl('http://example.com:8080/a')).toBe('http://example.com:8080/a');
    expect(parseUrl('http://printer.local/a')).toBe('http://printer.local/a');
    expect(parseUrl('http://10.0.0.5/a')).toBe('http://10.0.0.5/a');
  });
});
