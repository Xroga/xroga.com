import { describe, expect, it } from 'vitest';
import { decodeHeader, parseCalendar, readCalendar, readEmail, readNotebook, readSubtitles } from '../media-text';
import { detectKind, readFileContents } from '../file-format';

const enc = (s: string) => new TextEncoder().encode(s);

describe('notebooks', () => {
  const nb = {
    nbformat: 4,
    metadata: { kernelspec: { display_name: 'Python 3', language: 'python' } },
    cells: [
      { cell_type: 'markdown', source: ['# Title\n', 'Some words.'] },
      { cell_type: 'code', source: ['print(1+1)'], outputs: [{ output_type: 'stream', name: 'stdout', text: ['2\n'] }] },
      { cell_type: 'code', source: 'plot()', outputs: [{ output_type: 'display_data', data: { 'image/png': 'AAAA' } }] },
      { cell_type: 'code', source: '1/0', outputs: [{ output_type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero' }] },
    ],
  };
  it('keeps markdown, code and the text of outputs, and says when an output is a picture', () => {
    const t = readNotebook(JSON.stringify(nb));
    expect(t).toMatch(/Notebook: 4 cells \(Python 3\)/);
    expect(t).toMatch(/# Title\nSome words\./);
    expect(t).toMatch(/In \[2\]:\n```python\nprint\(1\+1\)\n```/);
    expect(t).toMatch(/Output:\n2/);
    expect(t).toMatch(/Output: \(a picture\)/);
    expect(t).toMatch(/ZeroDivisionError: division by zero/);
  });
  it('is detected by content even without a file name', () => {
    expect(detectKind(enc(JSON.stringify(nb)), 'download')).toBe('ipynb');
  });
});

describe('email', () => {
  const plain = [
    'Delivered-To: a@example.test', 'Received: by 10.1.1.1 with SMTP id x;', '        Fri, 21 Nov 2008 20:05:05 -0800 (PST)',
    'From: Mikel Lindsaar <test@lindsaar.net>', 'To: Someone <raasdnil@gmail.com>', 'Subject: Testing 123', 'Date: Sat, 22 Nov 2008 15:04:59 +1100',
    'Content-Type: text/plain; charset=US-ASCII; format=flowed', '', 'Test test', 'Second line.',
  ].join('\r\n');
  it('reads a plain message: subject, people, date and body', () => {
    const t = readEmail(plain);
    expect(t).toMatch(/^Email: Testing 123\nFrom: Mikel Lindsaar <test@lindsaar.net>\nTo: Someone/);
    expect(t).toMatch(/Date: Sat, 22 Nov 2008/);
    expect(t.endsWith('Test test\nSecond line.')).toBe(true);
  });
  it('decodes encoded words and quoted-printable text, prefers the plain part and lists attachments', () => {
    const msg = [
      'From: =?utf-8?B?SsO8cmdlbg==?= <j@example.test>', 'Subject: =?iso-8859-1?Q?Caf=E9_menu?=', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="B1"', '',
      '--B1', 'Content-Type: multipart/alternative; boundary="B2"', '',
      '--B2', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '', 'Caf=C3=A9 at noon=\r\n, bring cash.', '--B2', 'Content-Type: text/html; charset=utf-8', '', '<p>HTML <b>copy</b></p>', '--B2--',
      '--B1', 'Content-Type: application/pdf; name="menu.pdf"', 'Content-Disposition: attachment; filename="menu.pdf"', 'Content-Transfer-Encoding: base64', '', btoa('%PDF-1.4 fake'), '--B1--',
    ].join('\r\n');
    const t = readEmail(msg);
    expect(t).toMatch(/^Email: Café menu\nFrom: Jürgen <j@example.test>/);
    expect(t).toMatch(/Attachments \(1\): menu\.pdf \(application\/pdf, 13 bytes\)/);
    expect(t).toMatch(/Café at noon, bring cash\./);
    expect(t).not.toMatch(/HTML copy/);
  });
  it('falls back to the text of an HTML-only message', () => {
    const t = readEmail(['Subject: Hi', 'Content-Type: text/html', '', '<h1>News</h1><p>Body here</p>'].join('\n'));
    expect(t).toMatch(/# News/);
    expect(t).toMatch(/Body here/);
  });
  it('decodes headers', () => {
    expect(decodeHeader('=?UTF-8?Q?a=C3=A9?= =?UTF-8?Q?b?=')).toBe('aéb');
  });
  it('is detected from the first header line', () => {
    expect(detectKind(enc(plain), 'mail')).toBe('eml');
  });
});

describe('calendar', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20270101', 'DTEND;VALUE=DATE:20270102', 'SUMMARY:New Year\\, Day', 'LOCATION:Everywhere',
    'RRULE:FREQ=YEARLY', 'END:VEVENT', 'BEGIN:VEVENT', 'DTSTART:20270315T093000Z', 'SUMMARY:Board', ' meeting', 'ORGANIZER:mailto:boss@example.test', 'ATTENDEE:mailto:a@x.test', 'ATTENDEE:mailto:b@x.test', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  it('parses events with escapes, folded lines, dates and attendees', () => {
    const ev = parseCalendar(ics);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ summary: 'New Year, Day', start: '2027-01-01', rule: 'FREQ=YEARLY' });
    expect(ev[1]).toMatchObject({ summary: 'Boardmeeting', start: '2027-03-15 09:30 UTC', attendees: 2, organizer: 'boss@example.test' });
  });
  it('shows a table with the date span and pages long calendars', async () => {
    const t = readCalendar(ics);
    expect(t).toMatch(/Calendar: 2 events, from 2027-01-01 to 2027-03-15 09:30 UTC\./);
    expect(t).toMatch(/\| 1 \| 2027-01-01 \| 2027-01-02 \| New Year, Day \| Everywhere \| FREQ=YEARLY \|/);
    const many = ['BEGIN:VCALENDAR', ...Array.from({ length: 120 }, (_, i) => `BEGIN:VEVENT\r\nDTSTART:2027${String((i % 12) + 1).padStart(2, '0')}15\r\nSUMMARY:E${i + 1}\r\nEND:VEVENT`), 'END:VCALENDAR'].join('\r\n');
    const r = await readFileContents(enc(many), { name: 'x.ics', rows: '51-60' });
    expect(r.text).toMatch(/Calendar: 120 events/);
    expect(r.text).toMatch(/\| 51 \|/);
    expect(r.text).not.toMatch(/\| 50 \|/);
  });
});

describe('subtitles', () => {
  it('reads WebVTT with cue numbers, tags and notes as a transcript', () => {
    const vtt = '\uFEFFWEBVTT\n\nNOTE a comment\n\n1\n00:00:00.500 --> 00:00:04.000\nHello <i>there</i>\n\n2\n00:01:05.100 --> 00:01:10.500 align:start\n<c.yellow>Second</c> cue\nover two lines\n';
    const t = readSubtitles(vtt);
    expect(t).toMatch(/^Subtitles: 2 cues, 01:10 long\./);
    expect(t).toMatch(/\[00:00\] Hello there/);
    expect(t).toMatch(/\[01:05\] Second cue over two lines/);
  });
  it('reads SRT with comma times and detects it without a name', () => {
    const srt = '1\r\n00:00:00,000 --> 00:00:01,500\r\nFor www.forom.com\r\n\r\n2\r\n01:02:03,000 --> 01:02:04,000\r\n<i>Tonight</i>\r\n';
    expect(detectKind(enc(srt), 'sub')).toBe('subtitles');
    const t = readSubtitles(srt);
    expect(t).toMatch(/\[00:00\] For www\.forom\.com/);
    expect(t).toMatch(/\[1:02:03\] Tonight/);
  });
});
