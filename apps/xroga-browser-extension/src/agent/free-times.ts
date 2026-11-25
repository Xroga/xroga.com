// `find_free_times`: common free windows for several people in different time zones, computed, not reasoned. A model converting busy slots between zones
// in its head gets them wrong often (measured: 2 of 3 live runs proposed a slot that overlapped a converted meeting or fell outside working hours); this
// takes each person's zone, working hours and busy slots and returns the windows that are free for everyone, in the zone the answer needs. Pure: no page,
// no network.

export interface Participant {
  name?: string;
  /** An IANA zone ("Asia/Karachi") or a fixed offset ("UTC+5", "UTC-03:30"). */
  timeZone: string;
  /** Local working hours, "09:00-17:00". */
  workHours?: string;
  /** Busy slots in the person's own zone: "2026-12-07 14:00-16:00". */
  busy?: string[];
}

export interface FreeTimesArgs {
  participants: Participant[];
  /** First and last day, "YYYY-MM-DD", in the output zone. */
  from: string;
  to: string;
  minutes: number;
  outputZone: string;
  weekdaysOnly?: boolean;
  limit?: number;
}

const STEP = 15;
const DAY = 24 * 60;

/** Minutes east of UTC for a zone at an instant. */
export function offsetMinutes(zone: string, utcMs: number): number {
  const fixed = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(zone.trim());
  if (fixed) return (fixed[1] === '-' ? -1 : 1) * (Number(fixed[2]) * 60 + Number(fixed[3] ?? 0));
  if (/^(?:utc|gmt|z)$/i.test(zone.trim())) return 0;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((local - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
}

const hm = (s: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`"${s}" is not a time like 09:00`);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** A local "YYYY-MM-DD HH:MM" in a zone, as UTC ms (the offset is taken at that moment). */
function localToUtc(date: string, minutes: number, zone: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, 0, minutes);
  return guess - offsetMinutes(zone, guess - offsetMinutes(zone, guess) * 60_000) * 60_000;
}

const pad = (n: number) => String(n).padStart(2, '0');
function format(utcMs: number, zone: string): { date: string; time: string } {
  const local = new Date(utcMs + offsetMinutes(zone, utcMs) * 60_000);
  return { date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`, time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}` };
}

/** One moment in one zone, shown in other zones (idea: the `convert_time` tool of modelcontextprotocol/servers `time`, MIT, written fresh). `at` is "YYYY-MM-DD HH:MM" in `from`. */
const NL = String.fromCharCode(10);

export function convertTime(args: { at: string; from: string; to: string[] }): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})$/.exec(String(args.at ?? '').trim());
  if (!m) throw new Error('at must look like 2026-12-07 14:30, in the from zone');
  if (!args.from || !Array.isArray(args.to) || !args.to.length) throw new Error('give the from zone and at least one zone in to');
  const utc = localToUtc(m[1]!, hm(m[2]!), args.from);
  const sign = (zone: string) => { const o = offsetMinutes(zone, utc); return `UTC${o < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`; };
  const day = (zone: string) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(utc + offsetMinutes(zone, utc) * 60_000).getUTCDay()];
  const show = (zone: string) => { const f = format(utc, zone); return `${zone}: ${f.date} ${f.time} (${day(zone)}, ${sign(zone)})`; };
  return `${m[1]} ${m[2]} in ${args.from} is, at that moment (offsets are the ones in force on that date, daylight saving included):${NL}${[args.from, ...args.to].map(show).join(NL)}`;
}

export function findFreeTimes(args: FreeTimesArgs): { windows: string[]; text: string } {
  if (!Array.isArray(args.participants) || !args.participants.length) throw new Error('participants is a non-empty list');
  if (!(args.minutes > 0 && args.minutes <= DAY)) throw new Error('minutes is the length of the call, such as 30');
  const weekdaysOnly = args.weekdaysOnly !== false;
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
  const people = args.participants.map(p => {
    const [a, b] = (p.workHours ?? '09:00-17:00').split('-').map(hm);
    const busy = (p.busy ?? []).map(s => {
      const m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(s.trim());
      if (!m) throw new Error(`busy slot "${s}" is not like 2026-12-07 14:00-16:00`);
      return [localToUtc(m[1]!, hm(m[2]!), p.timeZone), localToUtc(m[1]!, hm(m[3]!), p.timeZone)] as const;
    });
    return { name: p.name ?? p.timeZone, zone: p.timeZone, a: a!, b: b!, busy };
  });
  const free = (t: number) => {
    const end = t + args.minutes * 60_000;
    return people.every(p => {
      const s = format(t, p.zone), e = format(end - 60_000, p.zone);
      if (s.date !== e.date) return false;
      const day = new Date(`${s.date}T00:00:00Z`).getUTCDay();
      if (weekdaysOnly && (day === 0 || day === 6)) return false;
      const startMin = hm(s.time), endMin = hm(e.time) + 1;
      if (startMin < p.a || endMin > p.b) return false;
      return !p.busy.some(([x, y]) => t < y && end > x);
    });
  };
  const windows: string[] = [];
  let t = localToUtc(args.from, 0, args.outputZone);
  const stop = localToUtc(args.to, DAY, args.outputZone);
  let lastEnd = -Infinity;
  for (; t + args.minutes * 60_000 <= stop && windows.length < limit; t += STEP * 60_000) {
    if (t < lastEnd || !free(t)) continue;
    const s = format(t, args.outputZone), e = format(t + args.minutes * 60_000, args.outputZone);
    windows.push(`${s.date} ${s.time}-${e.time}`);
    // One window per free stretch is enough to offer; the next offer starts after this stretch ends.
    let u = t;
    while (u + args.minutes * 60_000 <= stop && free(u)) u += STEP * 60_000;
    lastEnd = u;
  }
  const text = windows.length
    ? `Common free windows of ${args.minutes} minutes in ${args.outputZone} (computed from every person's zone, working hours and busy slots; one per free stretch):\n${windows.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
    : `No common ${args.minutes}-minute window between ${args.from} and ${args.to} fits every person's working hours and busy slots.`;
  return { windows, text };
}

export const FREE_TIMES_TOOL = {
  name: 'find_free_times',
  source: 'agent' as const,
  group: 'working' as const,
  description:
    'Compute common free windows for people in different time zones instead of converting times in your head. Give each person their zone (IANA like "Asia/Karachi" or "UTC+5"), working hours ("09:00-17:00") and busy slots in their own zone ("2026-12-07 14:00-16:00"), the day range, the length in minutes and the zone the answer must use. Returns windows free for everyone. For one moment in several zones ("what is 3pm New York in Karachi and London") give only convert: {at, from, to}.',
  parameters: {
    type: 'object',
    properties: {
      participants: {
        type: 'array', maxItems: 20,
        items: { type: 'object', properties: { name: { type: 'string' }, timeZone: { type: 'string' }, workHours: { type: 'string' }, busy: { type: 'array', maxItems: 100, items: { type: 'string' } } }, required: ['timeZone'] },
      },
      from: { type: 'string' },
      to: { type: 'string' },
      minutes: { type: 'number' },
      outputZone: { type: 'string' },
      weekdaysOnly: { type: 'boolean' },
      limit: { type: 'number' },
      convert: { type: 'object', description: 'Instead of free windows: show ONE moment in other zones. at is "YYYY-MM-DD HH:MM" in the from zone', properties: { at: { type: 'string' }, from: { type: 'string' }, to: { type: 'array', maxItems: 12, items: { type: 'string' } } }, required: ['at', 'from', 'to'] },
    },
    required: [] as string[],
    additionalProperties: false,
  },
};
