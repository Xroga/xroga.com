import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function classifyMigration(file, sql, history) {
  const version = file.replace(/\.sql$/, '');
  const exact = history.filter(row => row.version === version);
  const aliases = history.filter(row => row.version !== version &&
    (row.version === file || row.name === file || row.name === version.replace(/^\d+_/, '')));
  const markers = [...sql.matchAll(/^.*(?:create or replace function|alter table|create policy|drop policy|revoke |grant |drop column|drop table|truncate ).*$/gim)]
    .map(match => match[0].trim()).slice(0, 12);
  // Static triage only. SQL bodies and existing production objects must be
  // compared before any deployment. No regex can prove rollout compatibility.
  let classification = 'UNKNOWN';
  if (exact.length) classification = 'APPLIED_HISTORY_MATCH';
  else if (/^\s*(?:drop\s+table\b|truncate\s+(?:table\s+)?[a-z_"])|\balter\s+table\b[^;]*\bdrop\s+column\b/im.test(sql.replace(/^\s*--.*$/gm, ''))) classification = 'DESTRUCTIVE_OR_BACKFILL_REVIEW_REQUIRED';
  else if (/\b(?:create\s+or\s+replace\s+function|revoke|grant|policy|trigger|alter\s+table)\b/i.test(sql)) classification = 'COMPATIBILITY_ROLLOUT_REQUIRED';
  return { file, version, sha256: createHash('sha256').update(sql).digest('hex'),
    runnerWouldSkip: exact.length > 0, classification,
    aliasVersions: aliases.map(row => row.version), riskMarkers: markers,
    missingAssertion: exact.length ? 'History match does not establish absence of schema drift.'
      : 'Exact runner version absent. Compare actual objects and aliases, then rehearse against a disposable production-shaped snapshot before approved application.',
    approvalNeeded: !exact.length };
}

export function compareMigrations(directory, history) {
  return readdirSync(directory).filter(file => file.endsWith('.sql')).sort()
    .map(file => classifyMigration(file, readFileSync(join(directory, file), 'utf8'), history));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const historyPath = process.argv[2], outputPath = process.argv[3];
  if (!historyPath || !outputPath) throw Error('Usage: compare-production-migrations.mjs HISTORY.json OUTPUT.json');
  const input = JSON.parse(readFileSync(historyPath, 'utf8'));
  if (!Array.isArray(input.migrations) || !input.migrations.every(row => typeof row.version === 'string')) throw Error('Invalid history metadata');
  const migrations = compareMigrations(resolve('supabase/migrations'), input.migrations);
  const report = { scope: 'READ_ONLY_STATIC_ROLLOUT_TRIAGE_NOT_SQL_APPLICATION_APPROVAL',
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    projectRef: input.projectRef, historyCollectedAt: input.collectedAt,
    historySha256: createHash('sha256').update(readFileSync(historyPath)).digest('hex'),
    runnerMatching: 'Exact schema_migrations.version equals filename without .sql. Only 022_phase1_token_usage has a special table reconciliation.',
    sourceFiles: migrations.length, historyRows: input.migrations.length,
    exactApplied: migrations.filter(row => row.runnerWouldSkip).length,
    missingRunnerIdentifiers: migrations.filter(row => !row.runnerWouldSkip).length,
    customerRowsRead: false, sqlApplied: false, migrations };
  writeFileSync(resolve(outputPath), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ sourceFiles: report.sourceFiles, historyRows: report.historyRows,
    exactApplied: report.exactApplied, missingRunnerIdentifiers: report.missingRunnerIdentifiers,
    classifications: Object.fromEntries([...new Set(migrations.map(row => row.classification))]
      .map(status => [status, migrations.filter(row => row.classification === status).length])) }));
}
