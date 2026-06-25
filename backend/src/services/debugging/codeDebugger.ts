import { claudeGenerate } from '../../lib/anthropic.js';
import { deepSeekChat } from '../../lib/deepseek.js';
import { geminiGenerate } from '../../lib/gemini.js';
import { createContext, runInContext } from 'node:vm';
import type { CodeDebugOutput } from '../../types/features.js';

export interface CodeDebugInput {
  code: string;
  filename: string;
  language?: string;
}

interface CodeDefect {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  line?: number;
  description: string;
  suggestion: string;
}

function countLines(code: string): number {
  return code.split('\n').length;
}

export function computeDebugActionCost(lineCount: number): number {
  if (lineCount <= 200) return 15;
  if (lineCount <= 500) return 30;
  if (lineCount <= 1000) return 50;
  return 75;
}

async function findDefects(code: string, filename: string): Promise<CodeDefect[]> {
  try {
    const raw = await deepSeekChat(
      [{
        role: 'user',
        content: `You are DeepSeek-R1 code reviewer. Find 10-20 defects in this ${filename} code.
Return JSON: {"defects":[{"id":"","severity":"critical|major|minor","line":0,"description":"","suggestion":""}]}\n\n${code}`,
      }],
      { model: 'deepseek-reasoner', maxTokens: 4096 }
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { defects?: CodeDefect[] };
      return parsed.defects ?? [];
    }
  } catch (err) {
    console.error('[CodeDebugger] Reviewer failed:', (err as Error).message);
  }

  const defects: CodeDefect[] = [];
  if (!code.includes('try') && code.includes('async')) {
    defects.push({ id: 'd-1', severity: 'major', description: 'Missing error handling in async code', suggestion: 'Add try/catch blocks' });
  }
  if (code.includes('eval(')) {
    defects.push({ id: 'd-2', severity: 'critical', description: 'Use of eval() is dangerous', suggestion: 'Remove eval and use safer alternatives' });
  }
  return defects;
}

async function fixDefects(code: string, defects: CodeDefect[], filename: string): Promise<string> {
  const defectList = defects.map((d, i) => `${i + 1}. [${d.severity}] ${d.description} → ${d.suggestion}`).join('\n');

  try {
    return await claudeGenerate(
      'You are an expert debugger. Fix ALL defects and return ONLY the corrected code, no explanation.',
      `File: ${filename}\n\nDefects:\n${defectList}\n\nCode:\n${code}`,
      { maxTokens: 8192 }
    );
  } catch (err) {
    console.error('[CodeDebugger] Builder fix failed:', (err as Error).message);
    return code;
  }
}

async function runSandboxTests(code: string, language: string, filename: string): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const isJs = language === 'javascript' || language === 'typescript' || ['js', 'ts', 'mjs'].includes(ext);

  if (isJs) {
    try {
      const sandbox = { console, setTimeout, clearTimeout, Buffer, exports: {}, module: { exports: {} } };
      const context = createContext(sandbox);
      runInContext(code, context, { timeout: 5000 });
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  if (errors.length === 0) {
    const syntaxCheck = basicSyntaxCheck(code);
    if (!syntaxCheck.valid) errors.push(syntaxCheck.error ?? 'Syntax error');
  }

  return { passed: errors.length === 0, errors };
}

function basicSyntaxCheck(code: string): { valid: boolean; error?: string } {
  try {
    new Function(code);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

async function verifyFinalCode(code: string, filename: string): Promise<{ approved: boolean; reasons: string[] }> {
  try {
    const raw = await geminiGenerate(
      'You are the Truth Council. Verify code compiles and is production-ready. Return JSON: {"approved":true,"reasons":[]}',
      `Verify this ${filename} code:\n${code.slice(0, 8000)}`,
      { model: 'gemini-2.0-flash', maxTokens: 1024 }
    );
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as { approved: boolean; reasons: string[] };
    }
  } catch (err) {
    console.error('[CodeDebugger] Truth Council failed:', (err as Error).message);
  }

  const syntax = basicSyntaxCheck(code);
  return {
    approved: syntax.valid,
    reasons: syntax.valid ? ['Code passes syntax verification'] : [syntax.error ?? 'Syntax errors remain'],
  };
}

export async function debugCode(input: CodeDebugInput): Promise<CodeDebugOutput> {
  const lineCount = countLines(input.code);
  const language = input.language ?? inferLanguage(input.filename);
  let currentCode = input.code;
  let totalDefects = 0;
  let iterations = 0;
  const maxIterations = 5;

  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;

    const defects = await findDefects(currentCode, input.filename);
    totalDefects += defects.length;

    const critical = defects.filter((d) => d.severity === 'critical');
    if (defects.length > 0) {
      currentCode = await fixDefects(currentCode, defects, input.filename);
    }

    const qa = await runSandboxTests(currentCode, language, input.filename);
    if (!qa.passed) {
      currentCode = await fixDefects(
        currentCode,
        qa.errors.map((e, idx) => ({
          id: `runtime-${idx}`,
          severity: 'critical' as const,
          description: e,
          suggestion: 'Fix runtime error',
        })),
        input.filename
      );
    }

    const truth = await verifyFinalCode(currentCode, input.filename);

    if (critical.length === 0 && qa.passed && truth.approved) {
      return {
        type: 'code_debug',
        filename: input.filename,
        fixedCode: currentCode,
        language,
        lineCount,
        defectsFound: totalDefects,
        iterations,
        success: true,
        zeroDefects: true,
      };
    }
  }

  return {
    type: 'code_debug',
    filename: input.filename,
    fixedCode: currentCode,
    language,
    lineCount,
    defectsFound: totalDefects,
    iterations,
    success: false,
    zeroDefects: false,
  };
}

function inferLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript', ts: 'typescript', py: 'python', rb: 'ruby',
    go: 'go', rs: 'rust', java: 'java', cpp: 'cpp', c: 'c',
  };
  return map[ext ?? ''] ?? 'javascript';
}
