import type { ProjectFile } from './patches.js';

export interface SecurityFinding {
  severity: 'critical' | 'warn';
  path: string;
  message: string;
}

export interface SecurityScanResult {
  ok: boolean;
  findings: SecurityFinding[];
  /** Files with critical findings stripped/redacted for push safety */
  blocked: boolean;
}

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /sk-[a-zA-Z0-9]{20,}/g, label: 'OpenAI-style secret key' },
  { re: /sk-ant-[a-zA-Z0-9\-_]{20,}/g, label: 'Anthropic secret key' },
  { re: /xai-[a-zA-Z0-9]{20,}/g, label: 'xAI secret key' },
  { re: /ghp_[a-zA-Z0-9]{30,}/g, label: 'GitHub PAT' },
  { re: /github_pat_[a-zA-Z0-9_]{40,}/g, label: 'GitHub fine-grained PAT' },
  { re: /AIza[0-9A-Za-z\-_]{30,}/g, label: 'Google API key' },
  { re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g, label: 'Private key PEM' },
  { re: /AKIA[0-9A-Z]{16}/g, label: 'AWS access key' },
  { re: /supabase_service_role['\"]?\s*[:=]\s*['\"][a-zA-Z0-9._\-]{20,}/gi, label: 'Supabase service role inline' },
];

const DANGEROUS_HTML = [
  { re: /<script[^>]+src=["']https?:\/\/(?!cdn\.|unpkg\.|jsdelivr\.|esm\.sh)/i, label: 'Remote script from unknown host' },
  { re: /document\.write\s*\(/i, label: 'document.write usage' },
  { re: /eval\s*\(/i, label: 'eval() usage' },
  { re: /innerHTML\s*=\s*[^;]+request|innerHTML\s*=\s*[^;]+location/i, label: 'Unsafe innerHTML from request/location' },
];

/**
 * Pre-push security scan — blocks critical secret leaks; warns on risky patterns.
 */
export function scanProjectFiles(files: ProjectFile[]): SecurityScanResult {
  const findings: SecurityFinding[] = [];

  for (const f of files) {
    if (f.path === '.env.example' || f.path.endsWith('.md')) continue;
    const content = f.content ?? '';

    for (const { re, label } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(content)) {
        findings.push({
          severity: 'critical',
          path: f.path,
          message: `Possible hardcoded secret (${label}) — remove before push; use Vercel env / Xroga vault`,
        });
      }
    }

    if (/\.(html|jsx|tsx|js|ts)$/i.test(f.path)) {
      for (const { re, label } of DANGEROUS_HTML) {
        if (re.test(content)) {
          findings.push({ severity: 'warn', path: f.path, message: label });
        }
      }
    }

    if (f.path === 'package.json') {
      try {
        const pkg = JSON.parse(content) as { dependencies?: Record<string, string> };
        const deps = pkg.dependencies || {};
        for (const [name, ver] of Object.entries(deps)) {
          if (ver === '*' || ver === 'latest') {
            findings.push({
              severity: 'warn',
              path: f.path,
              message: `Unpinned dependency ${name}@${ver}`,
            });
          }
        }
      } catch {
        findings.push({ severity: 'critical', path: f.path, message: 'Invalid package.json' });
      }
    }
  }

  const blocked = findings.some((f) => f.severity === 'critical');
  return { ok: !blocked, findings, blocked };
}

/** Redact obvious secrets so a blocked push can still ship a safe tree after abort+fix. */
export function redactCriticalSecrets(files: ProjectFile[]): ProjectFile[] {
  return files.map((f) => {
    let content = f.content;
    for (const { re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      content = content.replace(re, '[REDACTED_SECRET]');
    }
    return { path: f.path, content };
  });
}
