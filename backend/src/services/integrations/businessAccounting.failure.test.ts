import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { generateStructured } from '../../ai/black-hole/structuredOutput.js';
import { isPostCompletionAccountingError, recordCompletedProviderUsage } from '../../ai/postCompletionAccounting.js';

// Execute the actual private selector source with synthetic boundary adapters.
// This avoids adding production injection hooks or calling a paid provider.
for (const [file, name] of [['businessRead.ts', 'selectToolAndArguments'], ['businessAction.ts', 'selectActionToolAndArguments']]) {
  test(`${file} accounting failure does not trigger repair or another provider`, async t => {
    const prior = process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    t.after(() => { if (prior === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = prior; });
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('No network permitted'); });
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const selector = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(selector);
    assert.match(source, /recordCompletedProviderUsage as recordUsage/);
    const code = ts.transpileModule(selector.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    let providerCalls = 0, accountingCalls = 0, failAccounting = true, malformed = false;
    const valid = JSON.stringify({ toolSlug: 'FIXTURE_TOOL', arguments: {}, summary: 'Synthetic action' });
    const adapters = {
      buildCandidatePayload: () => [{ toolSlug: 'FIXTURE_TOOL' }], selectPlannerRoutes: () => ['kimi_k3', 'glm_5_3'],
      generateStructured, isPlainRecord: (value: unknown) => !!value && typeof value === 'object', validateArguments: () => true,
      estimateMessageTokens: () => 1,
      withProviderReservation: async (input: { execute: () => Promise<unknown> }) => input.execute(),
      chatCompletion: async (modelId: string) => { providerCalls++; return { modelId, inputTokens: 2, outputTokens: 1, text: malformed && providerCalls === 1 ? 'invalid JSON' : valid }; },
      recordUsage: async (...args: Parameters<typeof recordCompletedProviderUsage>) => {
        accountingCalls++;
        if (failAccounting) return recordCompletedProviderUsage(...args);
      },
      isPostCompletionAccountingError, ComposioClientError: Error,
    };
    const run = new Function(...Object.keys(adapters), `${code}; return ${name};`)(...Object.values(adapters));
    for (malformed of [false, true]) {
      providerCalls = 0; accountingCalls = 0;
      await assert.rejects(run({ userId: 'fixture', useCase: 'Synthetic selection', tools: [] }), {
        code: 'POST_COMPLETION_ACCOUNTING_UNCERTAIN', providerCompleted: true, accountingUncertain: true, retryable: false,
      });
      assert.equal(providerCalls, 1); assert.equal(accountingCalls, 1);
    }
    failAccounting = false; malformed = true; providerCalls = 0; accountingCalls = 0;
    const result = await run({ userId: 'fixture', useCase: 'Synthetic selection', tools: [] });
    assert.equal(result.toolSlug, 'FIXTURE_TOOL'); assert.equal(providerCalls, 2); assert.equal(accountingCalls, 2, 'malformed completed attempt still accounted');
  });
}
