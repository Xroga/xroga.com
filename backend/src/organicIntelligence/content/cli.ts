import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { contentManifestSchema } from './model.js';
import { buildGrowthContentSnapshot } from './pipeline.js';
import { renderGrowthContentReport } from './report.js';
import { loadGrowthContentSource, resolveSafeContentPath, writeContentOutput } from './repository.js';
import { suggestInternalLinks, validateCitationReadyManifest } from './engine.js';

type Command = 'research' | 'brief' | 'content' | 'validate' | 'links' | 'visuals';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command;
  if (!['research', 'brief', 'content', 'validate', 'links', 'visuals'].includes(command)) throw new Error('Usage: growth:<research|brief|content|content:validate|links|visuals> [--opportunity id] [--path file] [--dry-run] [--json]');
  const dryRun = process.argv.includes('--dry-run');
  const json = process.argv.includes('--json');
  const snapshot = await buildGrowthContentSnapshot();
  const growth = await loadGrowthContentSource();
  let result: unknown;
  if (command === 'brief') {
    const id = option('--opportunity');
    result = id ? snapshot.briefs.find((brief) => brief.opportunityId === id) ?? { status: 'NO_DATA', reason: `No evidence-backed brief exists for ${id}.` } : snapshot.briefs;
  } else if (command === 'content') {
    const id = option('--opportunity');
    result = { mode: 'CONTROLLED_PLAN_ONLY', assets: id ? snapshot.firstBatch.filter((item) => item.opportunityId === id) : snapshot.firstBatch, note: 'This command produces an evidence-gated plan; it does not mass-generate or publish pages.' };
  } else if (command === 'validate') {
    const requested = option('--path');
    if (requested) {
      const file = await resolveSafeContentPath(requested);
      const manifest = contentManifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      const issues = validateCitationReadyManifest(manifest, growth.sources.filter((source) => manifest.sourceIds.includes(source.sourceId)), growth.claims.filter((claim) => manifest.claimIds.includes(claim.claimId)));
      result = { valid: issues.length === 0, path: path.relative(process.cwd(), file), issues };
    } else result = { valid: snapshot.contentValidation.every((item) => item.issues.length === 0) && snapshot.sourceClaimIssues.length === 0, assets: snapshot.contentValidation, sourceClaimIssues: snapshot.sourceClaimIssues };
  } else if (command === 'links') {
    result = growth.inventory.map((asset) => ({ url: asset.url, suggested: suggestInternalLinks(asset, growth.inventory) }));
  } else if (command === 'visuals') {
    result = growth.manifests.map((manifest) => ({ canonical: manifest.canonical, visuals: manifest.visualManifest }));
  } else result = json ? snapshot : renderGrowthContentReport(snapshot);
  const serialized = typeof result === 'string' && !json ? result : JSON.stringify(result, null, 2);
  const extension = typeof result === 'string' && !json ? 'md' : 'json';
  const target = await writeContentOutput(`${command}.${extension}`, `${serialized}\n`, dryRun);
  if (dryRun || process.argv.includes('--verbose')) process.stderr.write(`${dryRun ? 'Dry run' : 'Wrote'} ${target}\n`);
  process.stdout.write(`${serialized}\n`);
  if (command === 'validate' && 'valid' in (result as object) && !(result as { valid: boolean }).valid) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Growth content command failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
