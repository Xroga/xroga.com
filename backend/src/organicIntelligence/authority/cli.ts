import { buildAuthoritySnapshot } from './pipeline.js';
import { renderAuthorityReport } from './report.js';
import { writeAuthorityOutput } from './repository.js';

type Command = 'authority' | 'mentions' | 'distribute' | 'github' | 'oss' | 'video' | 'creators' | 'reports' | 'badge' | 'validate';
const commands: Command[] = ['authority', 'mentions', 'distribute', 'github', 'oss', 'video', 'creators', 'reports', 'badge', 'validate'];

function parseArgs(argv: string[]): { command: Command; dryRun: boolean; json: boolean; verbose: boolean } {
  const command = argv[0] as Command;
  if (!commands.includes(command)) throw new Error(`Usage: growth:<${commands.join('|')}> [--dry-run] [--json] [--verbose]`);
  return { command, dryRun: argv.includes('--dry-run'), json: argv.includes('--json'), verbose: argv.includes('--verbose') };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = await buildAuthoritySnapshot();
  const validation = {
    valid: snapshot.satelliteFindings.every((item) => snapshot.source.satellites.find((source) => source.id === item.satelliteId)?.releaseReady !== true || item.issues.length === 0),
    counts: {
      nodes: snapshot.graph.nodes.length, edges: snapshot.graph.edges.length,
      verifiedReceipts: snapshot.source.receipts.filter((item) => ['VERIFIED_MENTION', 'VERIFIED_LINK'].includes(item.status)).length,
      influenceOpportunities: snapshot.influenceOpportunities.length, creators: snapshot.source.creators.length,
      communities: snapshot.source.communities.length, videos: snapshot.videoOpportunities.length,
    },
    satelliteFindings: snapshot.satelliteFindings,
  };
  let output: unknown;
  switch (args.command) {
    case 'mentions': output = { opportunities: snapshot.influenceOpportunities, receipts: snapshot.source.receipts, corrections: snapshot.narrativeCorrections, unknowns: snapshot.unknowns.filter((item) => /mention|external/i.test(item)) }; break;
    case 'distribute': output = { mode: 'PLAN_ONLY', batch: snapshot.firstControlledBatch, outreach: snapshot.outreachQueue, externalActionsExecuted: [] }; break;
    case 'github': output = snapshot.githubAudit; break;
    case 'oss': output = { satellites: snapshot.source.satellites, findings: snapshot.satelliteFindings }; break;
    case 'video': output = { opportunities: snapshot.videoOpportunities, briefs: snapshot.videoBriefs, status: snapshot.videoOpportunities.length ? 'AVAILABLE' : 'NO_DATA' }; break;
    case 'creators': output = { creators: snapshot.creatorQualification, communities: snapshot.communityFindings }; break;
    case 'reports': output = { receipts: snapshot.source.receipts, privacyGate: 'PUBLIC reports require a public repository, owner opt-in, safe privacy class and substantive unique analysis.' }; break;
    case 'badge': output = { status: 'LOCAL_COMPUTED_ONLY', claim: 'Xroga Project Check', forbiddenClaim: 'Xroga Verified' }; break;
    case 'validate': output = validation; break;
    default: output = args.json ? snapshot : renderAuthorityReport(snapshot);
  }
  const serialized = typeof output === 'string' && !args.json ? output : JSON.stringify(output, null, 2);
  const extension = typeof output === 'string' && !args.json ? 'md' : 'json';
  const target = await writeAuthorityOutput(`${args.command}.${extension}`, `${serialized}\n`, args.dryRun);
  if (args.verbose || args.dryRun) process.stderr.write(`${args.dryRun ? 'Dry run' : 'Wrote'} ${target}\n`);
  process.stdout.write(`${serialized}\n`);
  if (args.command === 'validate' && !validation.valid) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Growth authority failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
