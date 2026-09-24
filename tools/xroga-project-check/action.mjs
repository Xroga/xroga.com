import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectRepository, renderBadgeSvg, renderHuman, safeOutputPath } from './core.mjs';

function boolean(value) { return String(value).toLowerCase() === 'true'; }
async function append(target, value) { if (target) await appendFile(target, `${value}\n`, 'utf8'); }

async function main() {
  const root = process.env.GITHUB_WORKSPACE ?? '.';
  const reportRelative = process.env.INPUT_REPORT_PATH || 'xroga-project-check.json';
  const badgeRelative = process.env.INPUT_BADGE_PATH || 'xroga-project-check.svg';
  const report = safeOutputPath(root, reportRelative); const badge = safeOutputPath(root, badgeRelative);
  const result = await inspectRepository(root);
  await mkdir(path.dirname(report), { recursive: true }); await mkdir(path.dirname(badge), { recursive: true });
  await writeFile(report, `${JSON.stringify(result, null, 2)}\n`, 'utf8'); await writeFile(badge, renderBadgeSvg(result), 'utf8');
  await append(process.env.GITHUB_STEP_SUMMARY, `## ${renderHuman(result).replace(/\n/g, '\n')}\n`);
  await append(process.env.GITHUB_OUTPUT, `score=${result.score}`);
  await append(process.env.GITHUB_OUTPUT, `band=${result.band}`);
  await append(process.env.GITHUB_OUTPUT, `critical-count=${result.criticalCount}`);
  await append(process.env.GITHUB_OUTPUT, `report-path=${reportRelative}`);
  await append(process.env.GITHUB_OUTPUT, `badge-path=${badgeRelative}`);
  const minimum = Number(process.env.INPUT_MINIMUM_SCORE || '0');
  if (!Number.isInteger(minimum) || minimum < 0 || minimum > 100) throw new Error('minimum-score must be an integer from 0 to 100.');
  if (result.score < minimum) process.exitCode = 2;
  if (boolean(process.env.INPUT_FAIL_ON_CRITICAL) && result.criticalCount > 0) process.exitCode = 3;
}

main().catch((error) => { process.stderr.write(`Xroga Project Check action failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
