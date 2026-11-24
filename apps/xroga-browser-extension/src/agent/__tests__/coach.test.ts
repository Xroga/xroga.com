import { describe, expect, it } from 'vitest';
import { COOLDOWN_MS, Coach, SLOW_MS, adviceFrom, isRepeat } from '../coach';

describe('adviceFrom', () => {
  it('reads OK as nothing to add and ADVICE as a note', () => {
    expect(adviceFrom('OK')).toBeNull();
    expect(adviceFrom('ok.')).toBeNull();
    expect(adviceFrom('ADVICE: Read the page text with http_get instead of clicking through the menu.')).toMatch(/http_get/);
  });
  it('ignores replies that do not follow the form or are too short', () => {
    expect(adviceFrom('')).toBeNull();
    expect(adviceFrom('You should try something else.')).toBeNull();
    expect(adviceFrom('ADVICE: no')).toBeNull();
  });
  it('cuts a long note', () => {
    expect(adviceFrom(`ADVICE: ${'word '.repeat(500)}`)!.length).toBeLessThanOrEqual(700);
  });
});

describe('isRepeat', () => {
  it('spots near-identical advice and lets new advice through', () => {
    const earlier = ['Use http_get to read the agency pages instead of clicking through the menus.'];
    expect(isRepeat('Use http_get to read agency pages instead of clicking the menus.', earlier)).toBe(true);
    expect(isRepeat('Run python_repl to compute the table from the rows you already hold.', earlier)).toBe(false);
  });
});

describe('Coach.due', () => {
  const make = () => {
    let t = 1_000_000;
    const c = new Coach(() => t);
    return { c, tick: (ms: number) => (t += ms) };
  };
  const turns = (c: Coach, n: number) => { for (let i = 0; i < n; i++) c.turn(); };

  it('leaves a healthy run alone', () => {
    const { c, tick } = make();
    turns(c, 10);
    for (let i = 0; i < 12; i++) c.note(false);
    tick(COOLDOWN_MS + 1);
    c.progress();
    expect(c.due()).toBeNull();
  });
  it('is due after enough failures, but not before the cool-down or the first turns', () => {
    const { c, tick } = make();
    for (let i = 0; i < 4; i++) c.note(true);
    expect(c.due()).toBeNull();
    turns(c, 5);
    expect(c.due()).toBeNull();
    tick(COOLDOWN_MS + 1);
    expect(c.due()).toMatch(/4 of the last 4 calls failed/);
  });
  it('is due when no step finished for a while, and progress resets that', () => {
    const { c, tick } = make();
    turns(c, 6);
    tick(SLOW_MS + 1);
    expect(c.due()).toMatch(/No plan step/);
    c.progress();
    expect(c.due()).toBeNull();
  });
});
