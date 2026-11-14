// Adapted from Open Intelligent UI src/lib/functions/dates.ts at
// 9df2e64bc44282f6305a47eb6dbbbd8f28139138 (MIT, see ../LICENSE).
import { defineFunction } from '@openuidev/react-lang';
import { z } from 'zod/v4';

const DAY = 86_400_000;
const iso = /^[1-9]\d{3}-\d{2}-\d{2}$/;
const date = () => z.string().regex(iso);

// Only calendar days, never locale-dependent timestamps or the current clock.
function toDay(value: string) {
  const instant = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid ISO calendar date');
  }
  return instant / DAY;
}
function isoDay(day: number) {
  const result = new Date(day * DAY).toISOString().split('T')[0]!;
  if (!iso.test(result)) throw new Error('Date outside supported calendar range');
  return result;
}
function calendarParts(day: number) {
  const d = new Date(day * DAY);
  return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()] as const;
}

export const AddDays = defineFunction({
  name: 'AddDays',
  description: 'Add a whole number of days to a supplied YYYY-MM-DD calendar date. Negative values go backwards.',
  params: z.object({ date: date(), days: z.number().int().min(-366000).max(366000) }),
  returns: date(),
  fn: ({ date, days }) => isoDay(toDay(date) + days),
});

export const DaysBetween = defineFunction({
  name: 'DaysBetween',
  description: 'Calendar days from one supplied YYYY-MM-DD date to another. Negative if the second date is earlier.',
  params: z.object({ from: date(), to: date() }),
  returns: z.number(),
  fn: ({ from, to }) => toDay(to) - toDay(from),
});

export const AddMonths = defineFunction({
  name: 'AddMonths',
  description: 'Add whole calendar months to a supplied YYYY-MM-DD date. Jan 31 plus one month is the last day of February.',
  params: z.object({ date: date(), months: z.number().int().min(-12000).max(12000) }),
  returns: date(),
  fn: ({ date, months }) => {
    const [year, month, day] = calendarParts(toDay(date));
    const target = month + months;
    const targetYear = year + Math.floor(target / 12);
    if (targetYear < 1000 || targetYear > 9999) throw new Error('Date outside supported calendar range');
    const last = new Date(Date.UTC(year, target + 1, 0)).getUTCDate();
    return isoDay(Date.UTC(year, target, Math.min(day, last)) / DAY);
  },
});

export const StartOf = defineFunction({
  name: 'StartOf',
  description: 'First day of the supplied YYYY-MM-DD date’s week (Monday), month or year.',
  params: z.object({ date: date(), unit: z.enum(['week', 'month', 'year']) }),
  returns: date(),
  fn: ({ date, unit }) => {
    const day = toDay(date);
    if (unit === 'week') return isoDay(day - ((new Date(day * DAY).getUTCDay() + 6) % 7));
    const [y, m] = calendarParts(day);
    return isoDay(Date.UTC(y, unit === 'month' ? m : 0, 1) / DAY);
  },
});
