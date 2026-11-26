import { describe, expect, it } from 'vitest';
import { BlockedQueue, challengeNote, type Challenge } from '../challenge';

const person: Challenge = { vendor: 'reCAPTCHA', kind: 'person', signal: 'text: i am not a robot' };
const block: Challenge = { vendor: 'Akamai', kind: 'block', signal: 'text: access denied' };
const wait: Challenge = { vendor: 'Cloudflare', kind: 'wait', signal: 'title: just a moment' };

describe('BlockedQueue', () => {
  it('lists each site once, without query strings, and says what the person does', () => {
    const q = new BlockedQueue();
    expect(q.add('https://www.shop.test/listing?token=SECRET', person)).toBe(true);
    expect(q.add('https://shop.test/other', person)).toBe(false);
    expect(q.add('https://bank.test/x', block)).toBe(true);
    expect(q.size).toBe(2);
    const text = q.lines().join('\n');
    expect(text).toContain('- shop.test: reCAPTCHA wants a person to pass its check; open https://www.shop.test/listing yourself');
    expect(text).toContain('- bank.test: Akamai refused the visit');
    expect(text).not.toContain('SECRET');
  });

  it('ignores a clearing interstitial and a missing or bad address', () => {
    const q = new BlockedQueue();
    expect(q.add('https://a.test/', wait)).toBe(false);
    expect(q.add(undefined, person)).toBe(false);
    expect(q.add('not a url', person)).toBe(false);
    expect(q.size).toBe(0);
  });
});

describe('challengeNote for a person check', () => {
  it('never offers to solve it, and lets other work carry on', () => {
    const note = challengeNote(person);
    expect(note).toContain('Do not try to solve, bypass or repeat it');
    expect(note).toContain('ask_user');
    expect(note).toContain('carry on');
  });
});
