import { buildIntelligence } from './intelligence.js';
import { loadSource, writeOutput } from './repository.js';
import { renderReport } from './report.js';

type Command = 'intelligence' | 'entities' | 'gaps' | 'discover' | 'report' | 'validate';

function parseArgs(argv: string[]): { command: Command; dryRun: boolean; json: boolean; verbose: boolean } {
  const command = argv[0] as Command;
  if (!['intelligence', 'entities', 'gaps', 'discover', 'report', 'validate'].includes(command)) {
    throw new Error('Usage: growth:<intelligence|entities|gaps|discover|report|validate> [--dry-run] [--json] [--verbose]');
  }
  return { command, dryRun: argv.includes('--dry-run'), json: argv.includes('--json'), verbose: argv.includes('--verbose') };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const source = await loadSource();
  const snapshot = await buildIntelligence(source);
  const validation = {
    valid: snapshot.validationIssues.length === 0,
    issues: snapshot.validationIssues,
    counts: {
      entities: source.entities.length, associations: source.associations.length, facts: source.facts.length,
      demand: source.demand.length, gscRows: source.gscRows.length, observations: source.promptObservations.length, mentions: source.mentions.length,
      formats: source.formatCoverage.length, crawlers: source.crawlerPolicies.length,
    },
  };
  let output: unknown;
  switch (args.command) {
    case 'entities': output = { entities: source.entities, associations: source.associations, facts: source.facts, validation }; break;
    case 'gaps': output = { gaps: snapshot.gaps, providerStates: snapshot.providerStates, unknowns: snapshot.unknowns }; break;
    case 'discover': output = { opportunities: snapshot.opportunities, productOpportunities: snapshot.opportunities.filter((item) => item.actionTypes.includes('PRODUCT')) }; break;
    case 'validate': output = validation; break;
    case 'report': output = renderReport(snapshot); break;
    default: output = snapshot;
  }
  const serialized = typeof output === 'string' && !args.json ? output : JSON.stringify(output, null, 2);
  const extension = typeof output === 'string' && !args.json ? 'md' : 'json';
  const target = await writeOutput(`${args.command}.${extension}`, `${serialized}\n`, args.dryRun);
  if (args.verbose || args.dryRun) process.stderr.write(`${args.dryRun ? 'Dry run' : 'Wrote'} ${target}\n`);
  process.stdout.write(`${serialized}\n`);
  if (args.command === 'validate' && !validation.valid) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Growth intelligence failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
