// read_file on real files from the internet in the formats added after the first release: a Jupyter notebook, an email message, a calendar
// of 700 events, and WebVTT and SRT subtitles.
import { readFileAt } from '../../extension/file-read';
import { defineScenario, outcome } from './registry';

const RAW = 'https://raw.githubusercontent.com';

defineScenario({
  id: 'S4-read-file-real',
  set: 'C',
  title: 'real notebook, email, calendar and subtitle files are read as text',
  covers: 'a Jupyter notebook from GitHub, an .eml message, the Thunderbird US holiday calendar (700 events, paged), WebVTT and SRT subtitle files',
  async run() {
    const nb = await readFileAt(`${RAW}/jakevdp/PythonDataScienceHandbook/master/notebooks/00.00-Preface.ipynb`);
    const eml = await readFileAt(`${RAW}/mikel/mail/master/spec/fixtures/emails/plain_emails/basic_email.eml`);
    const ics = await readFileAt('https://www.thunderbird.net/media/caldata/autogen/USHolidays.ics');
    const icsPage = await readFileAt('https://www.thunderbird.net/media/caldata/autogen/USHolidays.ics', { rows: '51-60' });
    const vtt = await readFileAt(`${RAW}/brenopolanski/html5-video-webvtt-example/master/MIB2-subtitles-pt-BR.vtt`);
    const srt = await readFileAt(`${RAW}/andreyvit/subtitle-tools/master/sample.srt`);
    const checks: Record<string, boolean> = {
      notebook: /^read_file \(ipynb\):\nNotebook: \d+ cells/.test(nb.text) && /# Preface/.test(nb.text) && /What Is Data Science\?/.test(nb.text),
      email: /Email: Testing 123/.test(eml.text) && /From: Mikel Lindsaar <test@lindsaar\.net>/.test(eml.text),
      calendar: /Calendar: 700 events/.test(ics.text) && /New Year's Day/.test(ics.text),
      calendarPaging: /\| 51 \|/.test(icsPage.text) && !/\| 50 \|/.test(icsPage.text),
      vtt: /Subtitles: \d+ cues/.test(vtt.text) && /\[00:00\] Aprendi a me virar/.test(vtt.text),
      srt: /Subtitles: \d+ cues/.test(srt.text) && /\[00:00\] For www\.forom\.com/.test(srt.text) && /Tonight's the night\./.test(srt.text) && !/<i>/.test(srt.text),
    };
    return outcome(
      'every real file reads as text with its structure',
      JSON.stringify({ failed: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), nb: nb.text.slice(0, 160), eml: eml.text.slice(0, 200), ics: ics.text.slice(0, 260), vtt: vtt.text.slice(0, 200), srt: srt.text.slice(0, 200) }),
      Object.values(checks).every(Boolean),
    );
  },
});
