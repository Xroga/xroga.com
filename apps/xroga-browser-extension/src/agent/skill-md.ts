// Agent Skills SKILL.md parsing and validation (the portable format from https://github.com/agentskills/agentskills, Apache-2.0).
// Only the documented frontmatter fields are read. A skill file is untrusted text: nothing here executes it, and `allowed-tools` is recorded as a
// request that the caller may ignore, never as a grant. Pure and dependency free.

export interface SkillMd {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools: string[];
  metadata: Record<string, string>;
  body: string;
}

export type SkillMdResult = { ok: true; skill: SkillMd } | { ok: false; error: string };

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function unquote(v: string): string {
  const t = v.trim();
  return /^(['"]).*\1$/.test(t) ? t.slice(1, -1) : t;
}

/** Parses the small YAML subset the spec uses: `key: value`, a folded or literal block (`>` / `|`), and one level of nested `metadata:` keys. */
export function parseSkillMd(source: string, options: { lenient?: boolean } = {}): SkillMdResult {
  const text = source.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { ok: false, error: 'SKILL.md must start with a --- frontmatter block' };
  const end = text.indexOf('\n---', 4);
  if (end < 0) return { ok: false, error: 'the frontmatter block is not closed with ---' };
  const front = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, '');
  const fields: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  const lines = front.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) return { ok: false, error: `unreadable frontmatter line ${i + 1}` };
    const [, key, rest] = m;
    if (key === 'metadata' && rest === '') {
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) {
        const sub = /^\s+([\w.-]+):\s*(.*)$/.exec(lines[++i]!);
        if (sub) metadata[sub[1]!] = unquote(sub[2]!);
      }
    } else if (rest === '>' || rest === '|' || rest === '>-' || rest === '|-') {
      const parts: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]!) || lines[i + 1] === '')) parts.push(lines[++i]!.trim());
      fields[key!] = rest.startsWith('>') ? parts.filter(Boolean).join(' ') : parts.join('\n').trim();
    } else {
      // A plain value that carries on over the next indented lines (valid YAML: the lines are folded with a space), or a list under the key (`- item`).
      const parts = [unquote(rest!)];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) parts.push(lines[++i]!.trim().replace(/^-\s+/, ''));
      fields[key!] = parts.filter(Boolean).join(' ');
    }
  }
  // Third-party skills were written for other clients: with `lenient` a name is read as the spec reads it (any language's letters and digits, normalised, lowercased) and over-long names or
  // descriptions load anyway, as the agentskills client guide advises. A skill with no name or no description is still skipped. Default strict, which every verified source keeps.
  const name = options.lenient ? (fields.name ?? '').normalize('NFKC').trim().toLowerCase() : (fields.name ?? '');
  const description = fields.description ?? '';
  if (!name) return { ok: false, error: 'name is required' };
  if (options.lenient ? !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(name) : name.length > 64 || !NAME.test(name)) return { ok: false, error: 'name must be 1-64 characters: lowercase letters, digits and single hyphens' };
  if (!description) return { ok: false, error: 'description is required' };
  if (!options.lenient && description.length > 1024) return { ok: false, error: 'description is longer than 1024 characters' };
  if (!options.lenient && fields.compatibility && fields.compatibility.length > 500) return { ok: false, error: 'compatibility is longer than 500 characters' };
  const allowed = (fields['allowed-tools'] ?? '').split(/\s+/).filter(Boolean);
  return {
    ok: true,
    skill: { name, description, license: fields.license, compatibility: fields.compatibility, allowedTools: allowed, metadata, body },
  };
}
