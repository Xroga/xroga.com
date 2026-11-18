/**
 * Inspection of an Agent Skill (a directory with a SKILL.md and optional bundled scripts) fetched from a public repository.
 *
 * Retrieval and reading never execute anything. This reports what the skill declares (name, description, allowed tools), which bundled scripts
 * exist and what they appear to do (network, process, file deletion, credential access), so a person or the agent can decide whether to run a
 * script in the sandbox. A script that is run goes through the same isolated worker as any repository command; it is never run by inspection.
 */
export interface SkillScript { readonly path: string; readonly interpreter: 'python3' | 'node' | 'sh' | null; readonly bytes: number; readonly signals: readonly string[] }
export interface SkillReport {
  readonly found: boolean;
  readonly directory: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly allowedTools: string | null;
  readonly problems: readonly string[];
  readonly scripts: readonly SkillScript[];
  readonly risk: 'none' | 'review';
}

const SIGNALS: ReadonlyArray<[string, RegExp]> = [
  ['network', /\b(?:curl|wget|requests\.|urllib|http\.client|fetch\(|axios|socket\.|https?:\/\/)/i],
  ['process', /\b(?:subprocess|os\.system|child_process|exec\(|spawn\(|eval\(|Popen)/],
  ['deletes files', /\brm\s+-[a-z]*r|shutil\.rmtree|fs\.rm(?:Sync)?\(|unlinkSync/],
  ['credentials', /(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|\.ssh|\.aws|credentials|\.env\b)/i],
  ['installs software', /\b(?:pip3?\s+install|npm\s+(?:i|install)|apt(?:-get)?\s+install|brew\s+install)\b/],
];

function interpreterFor(path: string): SkillScript['interpreter'] {
  if (/\.py$/.test(path)) return 'python3';
  if (/\.(?:[cm]?js)$/.test(path)) return 'node';
  if (/\.(?:sh|bash)$/.test(path)) return 'sh';
  return null;
}

/** Reads the frontmatter's simple `key: value` lines (no YAML execution, no anchors, no tags). */
export function parseFrontmatter(text: string): { fields: Record<string, string>; closed: boolean } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { fields: {}, closed: false };
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]{0,40}):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '').slice(0, 1000);
  }
  return { fields, closed: true };
}

export function inspectAgentSkill(files: ReadonlyArray<{ path: string; content: string }>, directory = ''): SkillReport {
  const dir = directory.replace(/^\/+|\/+$/g, '');
  const prefix = dir ? `${dir}/` : '';
  const skillFile = files.find((f) => f.path === `${prefix}SKILL.md`);
  if (!skillFile) return { found: false, directory: dir, name: null, description: null, allowedTools: null, problems: ['No SKILL.md in this directory.'], scripts: [], risk: 'none' };
  const { fields, closed } = parseFrontmatter(skillFile.content);
  const problems: string[] = [];
  if (!closed) problems.push('SKILL.md has no closed frontmatter block.');
  if (!fields.name) problems.push('The frontmatter has no name.');
  else if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(fields.name)) problems.push('The name should be lowercase letters, digits and hyphens.');
  if (!fields.description) problems.push('The frontmatter has no description.');
  const scripts: SkillScript[] = files
    .filter((f) => f.path.startsWith(prefix) && f.path !== skillFile.path && (/\.(?:py|[cm]?js|sh|bash)$/.test(f.path) || /(?:^|\/)scripts\//.test(f.path)))
    .map((f) => ({ path: f.path.slice(prefix.length), interpreter: interpreterFor(f.path), bytes: Buffer.byteLength(f.content), signals: SIGNALS.filter(([, re]) => re.test(f.content)).map(([name]) => name) }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const risk = scripts.some((s) => s.signals.length > 0 || s.interpreter === null) ? 'review' : 'none';
  return { found: true, directory: dir, name: fields.name ?? null, description: fields.description ?? null, allowedTools: fields['allowed-tools'] ?? null, problems, scripts, risk };
}
