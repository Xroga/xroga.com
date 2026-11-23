import { describe, expect, it } from 'vitest';
import { findFreeTimes, offsetMinutes } from '../free-times';

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
