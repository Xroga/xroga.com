// Generates src/browser-control/core/injection-patterns.ts from idpishield's patterns/builtin.go (Apache-2.0, github.com/pinchtab/idpishield @ 6f889fc).
// The Go regular expressions are copied as written; each one is checked to compile in JavaScript and the few that do not are listed and left out.
// Usage: node scripts/gen-injection-patterns.mjs <path to builtin.go>
import fs from 'node:fs';

const src = fs.readFileSync(process.argv[2], 'utf8');
const re = /p\(\s*"([^"]+)",\s*`([^`]*)`,\s*(Category\w+),\s*(\d+),\s*(Lang\w+),\s*"([^"]*)"\s*\)/g;
const cats = {
  CategoryInstructionOverride: 'instruction-override',
  CategoryExfiltration: 'exfiltration',
  CategoryRoleHijack: 'role-hijack',
  CategoryJailbreak: 'jailbreak',
  CategoryIndirectCommand: 'indirect-command',
  CategorySocialEngineering: 'social-engineering',
  CategoryStructuralInjection: 'structural-injection',
  CategoryDataDestruction: 'data-destruction',
  CategoryTransactionCoercion: 'transaction-coercion',
  CategoryOutputSteering: 'output-steering',
  CategoryResourceExhaustion: 'resource-exhaustion',
  CategoryAgentHijacking: 'agent-hijacking',
};
const out = [];
const skipped = [];
let m;
while ((m = re.exec(src))) {
  const [, id, pattern, cat, sev, lang, desc] = m;
  try {
    new RegExp(pattern, 'iu');
  } catch (error) {
    skipped.push(`${id}: ${error.message}`);
    continue;
  }
  out.push(`  [${JSON.stringify(id)}, ${JSON.stringify(pattern)}, ${JSON.stringify(cats[cat])}, ${sev}, ${JSON.stringify(lang.replace('Lang', '').toLowerCase())}, ${JSON.stringify(desc)}],`);
}
const header = `// Prompt-injection patterns for text read from web pages. Copied from idpishield (github.com/pinchtab/idpishield, Apache-2.0, commit 6f889fc), patterns/builtin.go,
// by scripts/gen-injection-patterns.mjs: id, regular expression (case-insensitive), threat category, severity 1 to 5, language, description. Do not edit by hand; regenerate.
// ${out.length} patterns${skipped.length ? `; left out because they do not compile in JavaScript: ${skipped.join('; ')}` : ''}.
export type InjectionPattern = readonly [id: string, pattern: string, category: string, severity: number, language: string, description: string];
export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
`;
fs.writeFileSync(new URL('../src/browser-control/core/injection-patterns.ts', import.meta.url), header + out.join('\n') + '\n];\n');
console.log(`wrote ${out.length} patterns, skipped ${skipped.length}`);
for (const s of skipped) console.log('  skipped', s);
