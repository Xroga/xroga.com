#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectRepository, renderBadgeSvg, renderHuman, safeOutputPath } from './core.mjs';

function parse(argv) {
  const value = (name, fallback = null) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] ?? fallback : fallback; };
  const root = argv.find((item) => !item.startsWith('-')) ?? '.';
  const minimum = Number(value('--minimum-score', '0'));
  if (!Number.isInteger(minimum) || minimum < 0 || minimum > 100) throw new Error('INVALID_THRESHOLD: --minimum-score must be an integer from 0 to 100.');
  return { root, json: argv.includes('--json'), output: value('--output'), badge: value('--badge'), minimum, failOnCritical: argv.includes('--fail-on-critical') };
}

async function main() {
  const args = parse(process.argv.slice(2));
  const result = await inspectRepository(args.root);
  const serialized = args.json ? `${JSON.stringify(result, null, 2)}\n` : renderHuman(result);
  if (args.output) {
    const target = safeOutputPath(args.root, args.output); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, serialized, 'utf8');
  } else process.stdout.write(serialized);
  if (args.badge) {
    const target = safeOutputPath(args.root, args.badge); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, renderBadgeSvg(result), 'utf8');
  }
  if (result.score < args.minimum) process.exitCode = 2;
  if (args.failOnCritical && result.criticalCount > 0) process.exitCode = 3;
}

main().catch((error) => { process.stderr.write(`Xroga Project Check failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
