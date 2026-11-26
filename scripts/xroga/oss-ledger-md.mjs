// Renders docs/xroga/oss-capability-ledger.json as docs/xroga/OSS-REUSE-LEDGER.md. Run after oss-ledger.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const ledger = JSON.parse(readFileSync(resolve(root, 'docs/xroga/oss-capability-ledger.json'), 'utf8'));
const cell = v => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '-';
const counts = (key) => Object.entries(ledger.rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {})).map(([k, n]) => `${k}: ${n}`).join(', ');

const lines = [
  '# Open-Source Reuse Ledger',
  '',
  `Generated ${ledger.generated_at} from \`docs/xroga/oss-capability-ledger.json\` (${ledger.count} repositories, the 2026-11-20 handoff catalog).`,
  '',
  'SHA, licence, archived flag and activity were fetched from GitHub for each repository. A row is **INSPECTED (metadata only)** unless the Evidence columns show source study, code and tests. A repository link, clone or README read is not an integration.',
  '',
  `Classification: ${counts('classification')}`,
  '',
  `Status: ${counts('status')}`,
  '',
  '| # | Repository | Pinned SHA | Licence | Classification | Status | Xroga code path | Tests | Reason / rights note |',
  '|--:|---|---|---|---|---|---|---|---|',
];
ledger.rows.forEach((r, i) => {
  const reason = [r.adoption_or_rejection_reason, r.rights_note, r.default_treatment && `handoff: ${r.default_treatment}`].filter(Boolean).join(' | ');
  lines.push(`| ${i + 1} | [${r.upstream_repo}](${r.canonical_url ?? '#'}) | ${cell((r.source_sha ?? '').slice(0, 10))} | ${cell(r.license_spdx ?? 'none found')} | ${cell(r.classification)} | ${cell(r.status)} | ${cell((r.xroga_file_paths ?? []).join('; '))} | ${cell((r.new_tests ?? []).join('; '))} | ${cell(reason)} |`);
});
lines.push('', '## Deliberately rejected or deferred for code reuse', '');
for (const r of ledger.rows.filter(r => r.classification === 'REJECT')) lines.push(`- **${r.upstream_repo}** (${r.license_spdx ?? 'no licence found'}): ${r.rights_note ?? r.default_treatment}.`);
lines.push('', '## Not yet measured', '', 'No row has a before/after performance measurement. The only live DeepSeek evidence is in `LIVE-TRIAL-20261120.md` and `LIVE-RUNS-20261120-B.md` (one TraceDraw pass, one fail, one public form pass).', '');
writeFileSync(resolve(root, 'docs/xroga/OSS-REUSE-LEDGER.md'), lines.join('\n'));
console.log('wrote OSS-REUSE-LEDGER.md');
