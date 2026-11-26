// Studies of live acceptance runs: the numbers of one run (mean score with its spread, steps, time, tools used, why a task failed), the difference between two runs,
// and a journal that keeps what is needed to repeat a run (the source version, the model, the flags). The shape comes from reading AgentLab (ServiceNow: summaries with
// standard errors, error classes, ablation reports, a reproducibility journal); the code is written fresh for Xroga's own run files.
//   node fixtures/acceptance/study.mjs summarize <results dir> [--model <name>] [--label <text>] [--no-skills] [--journal]
//   node fixtures/acceptance/study.mjs compare <results dir A> <results dir B>
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreAnswer } from './scorers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const round = (x, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
export const mean = v => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
/** Standard error of the mean, from the sample standard deviation (n - 1); zero for fewer than two values. */
export function stderr(v) {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) / Math.sqrt(v.length);
}

/** Why a task did not finish, in a few classes (the same task failing the same way twice is one finding, not two). */
export function errorClass(row) {
  const text = `${row.status ?? ''} ${row.reason ?? ''}`.toLowerCase();
  if (row.status === 'done' && String(row.answer ?? '').trim()) return null;
  if (row.status === 'done') return 'empty-answer';
  if (/step limit|too many (steps|turns)|turn limit|max.?steps/.test(text)) return 'step-limit';
  if (/stall|stuck|no progress|repeat/.test(text)) return 'stalled';
  if (/timeout|timed out|did not finish in/.test(text)) return 'timeout';
  if (/blocked|captcha|sign.?in|login|forbidden|denied|403|401/.test(text)) return 'blocked-by-site';
  if (/cancel|stopp?ed|abort/.test(text)) return 'stopped';
  if (/model|provider|rate limit|quota|overload|5\d\d/.test(text)) return 'model-or-provider';
  return 'other';
}

/** The rows of one run: a `<task name>.json` per task, as run-live writes them. */
export function loadRun(dir) {
  const rows = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    let json;
    try {
      json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch {
      continue;
    }
    const task = json.reports?.[0]?.result?.tasks?.[0] ?? json.reports?.[0]?.tasks?.[0] ?? json;
    if (!task || typeof task !== 'object') continue;
    rows.push({ name: file.replace(/\.json$/, ''), status: task.status, seconds: Number(task.seconds), turns: Number(task.turns), used: Array.isArray(task.used) ? task.used : [], answer: String(task.answer ?? ''), reason: task.reason });
  }
  return rows;
}

/** Scores every row against the tasks that name it; rows with no task are kept unscored. */
export function scoreRows(tasks, rows) {
  const byName = new Map(tasks.map(t => [t.name, t]));
  return rows.map(r => {
    const task = byName.get(r.name);
    const scored = task ? scoreAnswer(task.expect, r.answer) : undefined;
    return { ...r, score: scored ? scored.score : null, detail: scored?.detail, error: errorClass(r) };
  });
}

export function summarize(scored) {
  const scores = scored.filter(r => r.score !== null).map(r => r.score);
  const used = {};
  for (const r of scored) for (const t of r.used) used[t] = (used[t] ?? 0) + 1;
  const errors = {};
  for (const r of scored) if (r.error) errors[r.error] = (errors[r.error] ?? 0) + 1;
  return {
    tasks: scored.length,
    scored: scores.length,
    meanScore: round(mean(scores)),
    stderr: round(stderr(scores)),
    passed: scores.filter(s => s >= 0.999).length,
    meanTurns: round(mean(scored.map(r => r.turns).filter(Number.isFinite)), 2),
    meanSeconds: round(mean(scored.map(r => r.seconds).filter(Number.isFinite)), 1),
    totalSeconds: round(scored.map(r => r.seconds).filter(Number.isFinite).reduce((s, x) => s + x, 0), 1),
    errors,
    toolsUsed: Object.fromEntries(Object.entries(used).sort((a, b) => b[1] - a[1])),
  };
}

/** Run B against run A on the tasks both have: the paired difference of the scores with its standard error, and the tasks that moved. */
export function compare(a, b) {
  const byName = new Map(a.map(r => [r.name, r]));
  const pairs = b.filter(r => byName.has(r.name) && r.score !== null && byName.get(r.name).score !== null).map(r => ({ name: r.name, a: byName.get(r.name), b: r }));
  const diffs = pairs.map(p => p.b.score - p.a.score);
  const moved = pairs.map(p => ({ name: p.name, score: round(p.b.score - p.a.score, 2), turns: round(p.b.turns - p.a.turns, 1), seconds: round(p.b.seconds - p.a.seconds, 1) }));
  return {
    common: pairs.length,
    onlyInA: a.filter(r => !b.some(x => x.name === r.name)).map(r => r.name),
    onlyInB: b.filter(r => !a.some(x => x.name === r.name)).map(r => r.name),
    meanScoreDifference: round(mean(diffs)),
    stderr: round(stderr(diffs)),
    // a difference is only called real when it is larger than two standard errors
    verdict: diffs.length < 3 ? 'too few common tasks to tell' : Math.abs(mean(diffs)) > 2 * stderr(diffs) && mean(diffs) !== 0 ? (mean(diffs) > 0 ? 'B is better' : 'B is worse') : 'no clear difference',
    regressions: moved.filter(m => m.score < 0),
    improvements: moved.filter(m => m.score > 0),
    meanTurnsDifference: round(mean(pairs.map(p => p.b.turns - p.a.turns).filter(Number.isFinite)), 2),
    meanSecondsDifference: round(mean(pairs.map(p => p.b.seconds - p.a.seconds).filter(Number.isFinite)), 1),
  };
}

/** What is needed to repeat a run. `git` may be unavailable: the field then says so rather than guessing. */
export function reproInfo(options = {}) {
  const git = args => {
    try {
      return execFileSync('git', args, { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return 'unknown';
    }
  };
  let version = 'unknown';
  try {
    version = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    /* keep */
  }
  return {
    date: (options.date ?? new Date()).toISOString().slice(0, 10),
    label: options.label ?? '',
    model: options.model ?? 'unknown',
    skills: options.noSkills ? 'off' : 'on',
    sha: git(['rev-parse', '--short=10', 'HEAD']),
    dirty: git(['status', '--porcelain']) === '' ? 'no' : 'yes',
    extension: version,
    node: process.version,
    platform: process.platform,
  };
}

export const JOURNAL_COLUMNS = ['date', 'label', 'model', 'skills', 'sha', 'dirty', 'extension', 'node', 'platform', 'tasks', 'scored', 'meanScore', 'stderr', 'passed', 'meanTurns', 'meanSeconds', 'errors'];
const cell = v => {
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One line for the journal; the header is written when the file is new, and a file with other columns is refused rather than mixed. */
export function appendJournal(path, info, summary) {
  const row = { ...info, ...summary };
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JOURNAL_COLUMNS.join(',') + '\n');
  } else {
    const header = readFileSync(path, 'utf8').split('\n')[0];
    if (header !== JOURNAL_COLUMNS.join(',')) throw new Error(`the journal ${path} has other columns than this version writes`);
  }
  appendFileSync(path, JOURNAL_COLUMNS.map(c => cell(row[c])).join(',') + '\n');
}

function print(summary, scored) {
  console.log(`${summary.tasks} tasks, ${summary.scored} scored: mean ${summary.meanScore} ± ${summary.stderr} (standard error), ${summary.passed} full marks`);
  console.log(`mean ${summary.meanTurns} turns and ${summary.meanSeconds} s a task, ${summary.totalSeconds} s in all`);
  console.log(`tools used: ${Object.entries(summary.toolsUsed).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  console.log(`not finished well: ${Object.entries(summary.errors).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  for (const r of scored.filter(x => x.score !== null && x.score < 0.999)) console.log(`  ${r.name}: ${r.score.toFixed(2)} (${r.detail ?? ''})${r.error ? ` [${r.error}]` : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  const tasks = JSON.parse(readFileSync(join(here, 'tasks.json'), 'utf8'));
  const flag = name => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (cmd === 'summarize' && rest[0]) {
    const scored = scoreRows(tasks, loadRun(rest[0]));
    const summary = summarize(scored);
    print(summary, scored);
    if (rest.includes('--journal')) {
      const journal = join(here, '..', '..', '..', '..', 'docs', 'xroga', 'evidence', 'acceptance-journal.csv');
      appendJournal(journal, reproInfo({ model: flag('model'), label: flag('label'), noSkills: rest.includes('--no-skills') }), summary);
      console.log(`added to ${journal}`);
    }
  } else if (cmd === 'compare' && rest[0] && rest[1]) {
    const result = compare(scoreRows(tasks, loadRun(rest[0])), scoreRows(tasks, loadRun(rest[1])));
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error('usage: study.mjs summarize <results dir> [--model m] [--label l] [--no-skills] [--journal] | compare <dir A> <dir B>');
    process.exit(2);
  }
}
