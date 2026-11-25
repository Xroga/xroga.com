import { describe, expect, it } from 'vitest';
import { convertTime, findFreeTimes, offsetMinutes } from '../free-times';

describe('findFreeTimes', () => {
  it('finds windows free for Ana (Lisbon) and Bilal (Karachi), converting his busy slots and hours', () => {
    const { windows } = findFreeTimes({
      participants: [
        { name: 'Ana', timeZone: 'UTC+0', workHours: '09:00-17:00', busy: ['2026-12-07 14:00-15:00', '2026-12-09 09:00-12:00'] },
        { name: 'Bilal', timeZone: 'UTC+5', workHours: '09:00-17:00', busy: ['2026-12-08 20:00-21:00', '2026-12-07 14:00-16:00'] },
      ],
      from: '2026-12-07',
      to: '2026-12-11',
      minutes: 30,
      outputZone: 'UTC+0',
    });
    // Shared hours in Lisbon are 09:00-12:00; on 7 December Bilal is busy 09:00-11:00 Lisbon, on 9 December Ana is busy 09:00-12:00.
    expect(windows[0]).toBe('2026-12-07 11:00-11:30');
    expect(windows).toContain('2026-12-08 09:00-09:30');
    expect(windows.some(w => w.startsWith('2026-12-09'))).toBe(false);
    expect(windows.some(w => w.startsWith('2026-12-07 09'))).toBe(false);
    for (const w of windows) {
      const [, a] = w.split(' ');
      expect(Number(a!.slice(0, 2))).toBeGreaterThanOrEqual(9);
      expect(Number(a!.slice(6, 8)) * 60 + Number(a!.slice(9, 11))).toBeLessThanOrEqual(12 * 60);
    }
  });

  it('reads IANA zones with daylight saving, and fixed offsets', () => {
    expect(offsetMinutes('Asia/Karachi', Date.UTC(2026, 11, 7, 12))).toBe(300);
    expect(offsetMinutes('Europe/Lisbon', Date.UTC(2026, 6, 1, 12))).toBe(60);
    expect(offsetMinutes('UTC-03:30', 0)).toBe(-210);
  });

  it('says so when nothing fits, and refuses malformed slots', () => {
    const none = findFreeTimes({ participants: [{ timeZone: 'UTC+0', workHours: '09:00-10:00' }, { timeZone: 'UTC+12', workHours: '09:00-10:00' }], from: '2026-12-07', to: '2026-12-08', minutes: 30, outputZone: 'UTC+0' });
    expect(none.windows).toHaveLength(0);
    expect(none.text).toMatch(/No common/);
    expect(() => findFreeTimes({ participants: [{ timeZone: 'UTC', busy: ['tomorrow 9'] }], from: '2026-12-07', to: '2026-12-07', minutes: 30, outputZone: 'UTC' })).toThrow(/busy slot/);
  });
});

describe('convertTime', () => {
  it('shows one moment in other zones with the offsets in force that day, daylight saving included', () => {
    const summer = convertTime({ at: '2026-07-15 15:00', from: 'America/New_York', to: ['Asia/Karachi', 'Europe/London'] });
    expect(summer).toContain('America/New_York: 2026-07-15 15:00 (Wednesday, UTC-04:00)');
    expect(summer).toContain('Asia/Karachi: 2026-07-16 00:00 (Thursday, UTC+05:00)');
    expect(summer).toContain('Europe/London: 2026-07-15 20:00 (Wednesday, UTC+01:00)');
    const winter = convertTime({ at: '2026-12-15 15:00', from: 'America/New_York', to: ['Europe/London'] });
    expect(winter).toContain('Europe/London: 2026-12-15 20:00 (Tuesday, UTC+00:00)');
  });
  it('accepts fixed offsets and refuses a malformed moment or an empty target list', () => {
    expect(convertTime({ at: '2026-12-07 09:30', from: 'UTC+5', to: ['UTC-03:30'] })).toContain('UTC-03:30: 2026-12-07 01:00');
    expect(() => convertTime({ at: 'tomorrow 3pm', from: 'UTC', to: ['UTC+1'] })).toThrow(/at must look like/);
    expect(() => convertTime({ at: '2026-12-07 09:30', from: 'UTC', to: [] })).toThrow(/at least one zone/);
  });
});
