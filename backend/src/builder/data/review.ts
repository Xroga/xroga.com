import { createHash } from 'node:crypto';

/**
 * Conservative SQL review for a migration that will run in a CUSTOMER's database.
 *
 * It is a gate, not a proof: it classifies what a migration would do so a person sees the risk
 * before approving, and it refuses what must never run unattended. Destructive statements need a
 * separate, higher-risk approval. Anything it cannot classify is reported, never silently allowed.
 */

export type RiskLevel = 'safe' | 'review' | 'destructive';

export interface ReviewFinding {
  readonly level: RiskLevel;
  readonly rule: string;
  readonly message: string;
  readonly statement: string;
}

export interface MigrationReview {
  readonly digest: string;
  readonly statements: number;
  readonly risk: RiskLevel;
  readonly findings: readonly ReviewFinding[];
  readonly createsTables: readonly string[];
  readonly tablesWithoutRls: readonly string[];
  /** True when nothing in the migration is destructive and every table it creates enables RLS. */
  readonly appliable: boolean;
}

/** Splits on semicolons that are outside strings, comments and dollar-quoted bodies. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      continue;
    }
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      const stop = end < 0 ? sql.length : end + dollar[0].length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) j += 2;
          else break;
        } else j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ';') {
      if (current.trim()) out.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const norm = (statement: string) => statement.replace(/\s+/g, ' ').trim();
const clip = (statement: string) => (statement.length > 160 ? `${statement.slice(0, 160)}…` : statement);
const rank: Record<RiskLevel, number> = { safe: 0, review: 1, destructive: 2 };

interface Rule {
  readonly rule: string;
  readonly level: RiskLevel;
  readonly test: (statement: string) => boolean;
  readonly message: string;
}

const RULES: readonly Rule[] = [
  { rule: 'drop', level: 'destructive', test: (s) => /^drop\s+(table|schema|column|database|type|view|materialized|index|function|trigger|policy)\b/i.test(s) && !/^drop\s+(policy|trigger)\s+if\s+exists\b/i.test(s), message: 'Removes an object. Data or behaviour may be lost.' },
  { rule: 'alter-drop', level: 'destructive', test: (s) => /^alter\s+table\b.*\bdrop\s+(column|constraint)\b/i.test(s), message: 'Drops a column or constraint from an existing table.' },
  { rule: 'truncate', level: 'destructive', test: (s) => /^truncate\b/i.test(s), message: 'Deletes every row in a table.' },
  { rule: 'delete-all', level: 'destructive', test: (s) => /^delete\s+from\b/i.test(s) && !/\bwhere\b/i.test(s), message: 'Deletes every row: there is no WHERE condition.' },
  { rule: 'update-all', level: 'destructive', test: (s) => /^update\b/i.test(s) && !/\bwhere\b/i.test(s), message: 'Rewrites every row: there is no WHERE condition.' },
  { rule: 'rename', level: 'review', test: (s) => /^alter\s+table\b.*\brename\b/i.test(s), message: 'Renames a table or column; existing code that uses the old name will break.' },
  { rule: 'alter-type', level: 'review', test: (s) => /^alter\s+table\b.*\balter\s+column\b.*\btype\b/i.test(s), message: 'Changes a column type, which can fail or lose precision.' },
  { rule: 'disable-rls', level: 'destructive', test: (s) => /\bdisable\s+row\s+level\s+security\b/i.test(s) || /\bno\s+force\s+row\s+level\s+security\b/i.test(s), message: 'Turns off row-level security.' },
  { rule: 'grant-public', level: 'destructive', test: (s) => /^grant\b[\s\S]*\bto\b[\s\S]*\b(anon|public)\b/i.test(s), message: 'Grants access to signed-out visitors or everyone.' },
  { rule: 'always-true-write-policy', level: 'destructive', test: (s) => /^create\s+policy\b/i.test(s) && /\bfor\s+(insert|update|delete|all)\b/i.test(s) && /\b(using|with\s+check)\s*\(\s*true\s*\)/i.test(s), message: 'A write policy that allows everyone.' },
  { rule: 'policy-for-anon', level: 'destructive', test: (s) => /^create\s+policy\b/i.test(s) && /\bto\s+[^;]*\banon\b/i.test(s), message: 'A policy that applies to signed-out visitors.' },
  { rule: 'auth-schema', level: 'destructive', test: (s) => /^(alter|drop|truncate)\s+(table\s+)?(if\s+exists\s+)?(only\s+)?"?auth"?\./i.test(s) || /^(delete\s+from|insert\s+into|update)\s+"?auth"?\./i.test(s) || /^create\s+trigger\b[\s\S]*\bon\s+"?auth"?\./i.test(s), message: 'Changes the authentication system itself.' },
  { rule: 'other-managed-schema', level: 'destructive', test: (s) => /^(alter|drop|truncate|create)\b[\s\S]*\b(storage|realtime|supabase_functions|vault|pg_catalog|information_schema)\./i.test(s), message: 'Changes a schema managed by Supabase.' },
  { rule: 'extension', level: 'review', test: (s) => /^create\s+extension\b/i.test(s), message: 'Installs a database extension.' },
  { rule: 'definer-no-path', level: 'destructive', test: (s) => /security\s+definer/i.test(s) && !/set\s+search_path\s*(=|to)\s*(''|"")/i.test(s), message: 'A SECURITY DEFINER function without an empty search_path can be hijacked.' },
  { rule: 'role', level: 'destructive', test: (s) => /^(create|alter|drop)\s+(role|user)\b/i.test(s), message: 'Creates or changes database roles.' },
  { rule: 'dynamic-sql', level: 'review', test: (s) => /\bexecute\s+(format|'|\w+\s*\|\|)/i.test(s), message: 'Runs dynamically built SQL.' },
];

const SAFE_PREFIX = /^(create\s+(or\s+replace\s+)?(function|trigger|index|unique\s+index|table|policy)|create\s+table\s+if\s+not\s+exists|alter\s+table\b[\s\S]*\b(enable\s+row\s+level\s+security|add\s+column|force\s+row\s+level\s+security)|drop\s+(policy|trigger)\s+if\s+exists|revoke|grant|comment\s+on|create\s+index|notify)\b/i;

export function reviewMigration(sql: string): MigrationReview {
  const statements = splitStatements(sql);
  const findings: ReviewFinding[] = [];
  const created = new Set<string>();
  const rls = new Set<string>();
  for (const raw of statements) {
    const statement = norm(raw);
    let matched = false;
    for (const rule of RULES) {
      if (rule.test(statement)) {
        findings.push({ level: rule.level, rule: rule.rule, message: rule.message, statement: clip(statement) });
        matched = true;
      }
    }
    const table = /^create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([A-Za-z_][\w]*)"?/i.exec(statement);
    if (table) created.add(table[1].toLowerCase());
    const enable = /^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([A-Za-z_][\w]*)"?\s+enable\s+row\s+level\s+security/i.exec(statement);
    if (enable) rls.add(enable[1].toLowerCase());
    if (!matched && !SAFE_PREFIX.test(statement)) {
      findings.push({ level: 'review', rule: 'unclassified', message: 'This statement is not one Xroga recognises as routine. A person should read it.', statement: clip(statement) });
    }
  }
  const tablesWithoutRls = [...created].filter((name) => !rls.has(name));
  for (const name of tablesWithoutRls) {
    findings.push({ level: 'destructive', rule: 'table-without-rls', message: `Table ${name} is created without row-level security, so anyone with the public key could read it.`, statement: `create table ${name}` });
  }
  const risk = findings.reduce<RiskLevel>((worst, finding) => (rank[finding.level] > rank[worst] ? finding.level : worst), 'safe');
  return {
    digest: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex'),
    statements: statements.length,
    risk,
    findings,
    createsTables: [...created].sort(),
    tablesWithoutRls,
    appliable: risk !== 'destructive',
  };
}
