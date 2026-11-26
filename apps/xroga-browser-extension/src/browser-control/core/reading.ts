/**
 * Conditions on what an element reads, for `wait`: the value or text of a counter, a status label, a price, a progress figure.
 * Ported in idea from Full Self Browsing's reactive triggers (fullselfbrowsing/FSB @ 28284b8c, MIT, extension/ai/tool-definitions.js `trigger`: changed,
 * threshold, equals, contains, regex). Here they are checked by the `wait` tool, on the tab and frame session the run already owns, so a watch cannot
 * outlive the run or touch a tab it does not own.
 */
export interface ReadingCondition {
  equals?: string;
  contains?: string;
  matches?: string;
  above?: number;
  below?: number;
  changed?: boolean;
}

/** A number from page text: "1,234.50", "3,5 %", "$ 12", "(7)" -> 1234.5, 3.5, 12, 7. Null when the text has none. */
export function parseNumber(text: string): number | null {
  const m = text.replace(/ /g, ' ').match(/-?\d[\d.,\s']*/);
  if (!m) return null;
  let s = m[0].replace(/[\s']/g, '').replace(/[.,]+$/, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // The later separator is the decimal one.
    const dec = lastDot > lastComma ? '.' : ',';
    s = dec === '.' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    // "3,5" is a decimal comma; "1,234" and "1,234,567" are thousands.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The conditions the reading does not meet, as short sentences with what was read. `previous` is the reading when the wait began. */
export function unmetReading(cond: ReadingCondition, reading: string, previous: string): string[] {
  const out: string[] = [];
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const r = norm(reading);
  const shown = r.length > 60 ? `${r.slice(0, 60)}…` : r;
  if (cond.equals !== undefined && r.toLowerCase() !== norm(cond.equals).toLowerCase()) out.push(`it reads "${shown}", not "${cond.equals}"`);
  if (cond.contains !== undefined && !r.toLowerCase().includes(norm(cond.contains).toLowerCase())) out.push(`it reads "${shown}", which lacks "${cond.contains}"`);
  if (cond.matches !== undefined) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(cond.matches, 'i');
    } catch {
      out.push(`"${cond.matches}" is not a valid pattern`);
    }
    if (re && !re.test(r)) out.push(`it reads "${shown}", which does not match ${cond.matches}`);
  }
  if (cond.above !== undefined || cond.below !== undefined) {
    const n = parseNumber(r);
    if (n === null) out.push(`it reads "${shown}", which has no number`);
    else {
      if (cond.above !== undefined && !(n > cond.above)) out.push(`it reads ${n}, not above ${cond.above}`);
      if (cond.below !== undefined && !(n < cond.below)) out.push(`it reads ${n}, not below ${cond.below}`);
    }
  }
  if (cond.changed && norm(previous) === r) out.push(`it still reads "${shown}"`);
  return out;
}
