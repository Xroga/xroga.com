import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { universalCapabilityRegistry } from '../../capabilities/index.js';
import {
  dispatchForGoal,
  enforceExplicitBusinessWorkflowControls,
  enforceExplicitExecutionControls,
  enforceExplicitPublicResearchControls,
  executeHedgedPlannerFallback,
  interpreterModelOrder,
  planExplicitProjectBuild,
  plannerContractCoherenceError,
  protocolSocialResponse,
  resolveStructuredGoalContract,
  selectPlannerRoutes,
  semanticPlannerCompletionOptions,
  SEMANTIC_PLANNER_DEFAULT_TOTAL_TIMEOUT_MS,
  SEMANTIC_PLANNER_HEDGE_DELAY_MS,
  SEMANTIC_PLANNER_MAX_TOTAL_TIMEOUT_MS,
  SEMANTIC_PLANNER_ROUTE_TIMEOUT_MS,
  unresolvedGoalBlockers,
} from './semanticRequestPlanner.js';
import {
  goalContractSchema,
  normalizePlannerDecisionCandidate,
  type GoalContract,
} from './goalContract.js';
import { readFileSync } from 'node:fs';
import { TenantAccessError } from '../../security/tenantErrors.js';
import { AuthorityError } from '../../security/authority/enforce.js';
import { EgressDenied } from '../../security/egress/egressPolicy.js';
import { RuntimeFailure } from './runtimeFailure.js';
import { PostCompletionAccountingError } from '../postCompletionAccounting.js';

function goal(overrides: Partial<GoalContract> = {}): GoalContract {
  return goalContractSchema.parse({
    version: '1.0',
    goal: 'arbitrary user outcome',
    desiredOutcome: 'the requested outcome',
    semanticIntent: 'ANSWER',
    constraints: [],
    acceptance: [],
    historyContext: [],
    projectContext: null,
    deliverables: [],
    requiredCapabilities: ['conversation.respond'],
    requiredAuthorities: [],
    risks: [],
    confidence: 0.9,
    blockers: [],
    contextComplexity: 'low',
    ...overrides,
  });
}

describe('semantic request dispatch', () => {
  it('retains a valid semantic decision without a paid repair for invalid display metadata', async () => {
    const input = { userId: 'synthetic', message: 'Explain the supplied system.', history: [], attachments: [], projectContext: null };
    for (const presentation of [[{ kind: 'execute', heading: 'Run', instruction: 'Grant owner access' }], [{ kind: 'prose', heading: 'Answer', instruction: 'Explain.' }]]) {
      let attempts = 0;
      const result = await resolveStructuredGoalContract(async () => {
        attempts++;
        return JSON.stringify({ semanticIntent: 'ANSWER', requiredCapabilities: ['conversation.respond'], freshnessRequirement: 'NONE', confidence: 0.9, presentation });
      }, 1, value => normalizePlannerDecisionCandidate(value, input));
      assert.equal(attempts, 1);
      assert.deepEqual(result.requiredAuthorities, []);
      assert.deepEqual(result.requiredCapabilities, ['conversation.respond']);
      if (presentation[0].kind === 'execute') {
        assert.equal(result.presentationIssue, 'invalid');
        assert.equal(result.presentation, undefined);
      } else assert.deepEqual(result.presentation, presentation);
    }
    assert.equal(goalContractSchema.safeParse({ ...goal(), presentation: [{ kind: 'prose', heading: 'Answer', instruction: 'Explain.', authority: 'owner' }] }).success, false);
  });
  it('preserves read and action capabilities for an explicit multi-app request', () => {
    const previousKey = process.env.COMPOSIO_API_KEY;
    process.env.COMPOSIO_API_KEY = 'test-key';
    try {
      const corrected = enforceExplicitBusinessWorkflowControls({
        goalContract: goal({ requiredCapabilities: ['business.read'] }),
        dispatch: 'chat', capabilityIds: ['business.read'], rationale: 'model collapsed request', blockers: [], usage: {} as never,
      }, 'Find clients in my CRM and email them an introduction');
      assert.deepEqual(corrected.capabilityIds, ['business.read', 'business.action']);
      assert.equal(corrected.goalContract.semanticIntent, 'MIXED');
      assert.equal(corrected.dispatch, 'chat');
    } finally {
      if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY;
      else process.env.COMPOSIO_API_KEY = previousKey;
    }
  });

  it('keeps an explicit public web search out of connected-app discovery', () => {
    const previousKey = process.env.DEEPSEEK_WEBSEARCH_FETCH_API;
    process.env.DEEPSEEK_WEBSEARCH_FETCH_API = 'test-key';
    try {
      const misroutedGoal = goal({
        semanticIntent: 'INVESTIGATE',
        requiredCapabilities: ['business.read'],
      });
      const corrected = enforceExplicitPublicResearchControls({
        goalContract: misroutedGoal,
        dispatch: 'chat',
        capabilityIds: ['business.read'],
        rationale: 'model-selected app search',
        blockers: [],
        usage: {} as never,
      }, 'Do the web searches and plan a trip to Europe from Pakistan');

      assert.deepEqual(corrected.capabilityIds, ['research.public-web', 'conversation.respond']);
      assert.equal(corrected.goalContract.freshnessRequirement, 'CURRENT_REQUIRED');
      assert.equal(corrected.dispatch, 'chat');
    } finally {
      if (previousKey === undefined) delete process.env.DEEPSEEK_WEBSEARCH_FETCH_API;
      else process.env.DEEPSEEK_WEBSEARCH_FETCH_API = previousKey;
    }
  });

  it('reports provider unavailability instead of falling back to Composio for public search', () => {
    const previousKey = process.env.DEEPSEEK_WEBSEARCH_FETCH_API;
    delete process.env.DEEPSEEK_WEBSEARCH_FETCH_API;
    try {
      const corrected = enforceExplicitPublicResearchControls({
        goalContract: goal({ requiredCapabilities: ['business.read'] }),
        dispatch: 'chat',
        capabilityIds: ['business.read'],
        rationale: 'model-selected app search',
        blockers: [],
        usage: {} as never,
      }, 'Search the web for flight fares');
      assert.equal(corrected.dispatch, 'blocked');
      assert.match(corrected.blockers.join(' '), /research.*provider.*not configured/i);
    } finally {
      if (previousKey !== undefined) process.env.DEEPSEEK_WEBSEARCH_FETCH_API = previousKey;
    }
  });

  it('does not override connected-app reads or a request not to browse', () => {
    const appPlan = {
      goalContract: goal({ requiredCapabilities: ['business.read'] }),
      dispatch: 'chat' as const,
      capabilityIds: ['business.read'],
      rationale: 'connected app read',
      blockers: [],
      usage: {} as never,
    };
    assert.equal(enforceExplicitPublicResearchControls(appPlan, 'Search my Gmail messages'), appPlan);
    assert.equal(enforceExplicitPublicResearchControls(appPlan, 'Do not search the web; read my Gmail'), appPlan);
  });

  it('does not silently drop a requested app action after public web research', () => {
    const plan = {
      goalContract: goal({ requiredCapabilities: ['business.read'] }),
      dispatch: 'chat' as const,
      capabilityIds: ['business.read'],
      rationale: 'model collapsed request',
      blockers: [],
      usage: {} as never,
    };
    const guarded = enforceExplicitPublicResearchControls(plan, 'Search the web for flights and email the results to Jane');
    assert.equal(guarded.dispatch, 'blocked');
    assert.match(guarded.blockers.join(' '), /no action was executed/i);
  });

  it('keeps a normal answer and public research out of the build path', () => {
    assert.equal(dispatchForGoal(goal(), ['conversation.respond']), 'chat');
    assert.equal(
      dispatchForGoal(goal({ semanticIntent: 'INVESTIGATE' }), ['research.public-web', 'conversation.respond']),
      'chat',
    );
  });

  it('does not block authorized read-only research when the interpreter uses the broad external-action label', () => {
    assert.equal(
      dispatchForGoal(
        goal({ semanticIntent: 'EXTERNAL_ACTION' }),
        ['research.public-web', 'conversation.respond'],
      ),
      'chat',
    );
  });

  it('treats an active repository as context rather than mutation intent', () => {
    const readOnly = goal({
      semanticIntent: 'INVESTIGATE',
      projectContext: { repo: 'generated-owner/generated-repository', branch: 'feature/arbitrary-branch', projectRoot: '/' },
      requiredCapabilities: ['repository.read', 'conversation.respond'],
    });
    assert.equal(dispatchForGoal(readOnly, readOnly.requiredCapabilities), 'chat');
  });

  it('routes real implementation to build and refuses unfulfilled external actions', () => {
    assert.equal(dispatchForGoal(goal({ semanticIntent: 'MODIFY' }), ['software.implement', 'repository.write']), 'build');
    assert.equal(dispatchForGoal(goal({ semanticIntent: 'EXTERNAL_ACTION' }), ['conversation.respond']), 'blocked');
  });

  it('rejects a connected-app action that claims it can produce a software Preview', () => {
    const inconsistent = goal({
      semanticIntent: 'EXTERNAL_ACTION',
      previewRequirement: 'REQUIRED',
      requiredCapabilities: ['business.action'],
    });

    assert.match(
      plannerContractCoherenceError(inconsistent) ?? '',
      /cannot create a project Preview/i,
    );
  });

  it('registers user-facing read, response, research, implementation, validation, and write capabilities', () => {
    const ids = new Set(universalCapabilityRegistry.list().map((item) => String(item.id)));
    for (const id of ['attachment.analyze', 'conversation.respond', 'research.public-web', 'research.x', 'repository.read', 'repository.write', 'software.implement', 'validation.run']) {
      assert.ok(ids.has(id), `${id} missing`);
    }
  });

  it('never substitutes a generic scaffold when every implementation provider fails', () => {
    const pipeline = readFileSync(new URL('../pipeline.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(pipeline, /Builder routes returned no files — using the deterministic scaffold/);
    assert.doesNotMatch(pipeline, /AI route was unavailable — continuing with Xroga’s local project generator/);
  });

  it('offers the real validation sandbox without granting unrelated external authority', () => {
    const planner = readFileSync(new URL('./semanticRequestPlanner.ts', import.meta.url), 'utf8');
    assert.match(planner, /\['model:execute', 'sandbox:execute'\]/);
    assert.doesNotMatch(planner, /authorities\.add\('deploy:execute'\)/);
  });
});

describe('software-build planner correction', () => {
  it('corrects a domain-shaped business action into software implementation before execution', async () => {
    const attempts: Array<string | undefined> = [];
    const contract = await resolveStructuredGoalContract(async (hint) => {
      attempts.push(hint);

      if (!hint) {
        return JSON.stringify({
          ...goal({
            goal: 'Create an interactive scheduling product',
            desiredOutcome: 'A responsive application with validation and automated checks',
            semanticIntent: 'EXTERNAL_ACTION',
            previewRequirement: 'REQUIRED',
            deploymentRequirement: 'NONE',
            requiredCapabilities: ['business.action'],
          }),
        });
      }

      return JSON.stringify({
        ...goal({
          goal: 'Create an interactive scheduling product',
          desiredOutcome: 'A responsive application with validation and automated checks',
          semanticIntent: 'MODIFY',
          previewRequirement: 'REQUIRED',
          deploymentRequirement: 'NONE',
          requiredCapabilities: ['software.implement', 'validation.run'],
        }),
      });
    }, 1); // Explicit offline repair budget, never the active planner's default.

    assert.equal(attempts.length, 2);
    assert.match(attempts[1] ?? '', /business\.action cannot create a project Preview/i);
    assert.deepEqual(contract.requiredCapabilities, ['software.implement', 'validation.run']);
    assert.equal(dispatchForGoal(contract, contract.requiredCapabilities), 'build');
  });

  it('preserves explicit Preview and no-deploy controls when the planner omits them', async () => {
    let attempts = 0;
    const interpretation = {
      message:
        'Create a lightweight reservation portal with validation and tests. Create a Preview, but do not deploy it.',
      history: [],
      attachments: [],
      projectContext: null,
    };

    const contract = await resolveStructuredGoalContract(
      async (hint) => {
        attempts += 1;

        return JSON.stringify(
          hint
            ? {
                semanticIntent: 'MODIFY',
                requiredCapabilities: ['software.implement', 'validation.run'],
                freshnessRequirement: 'NONE',
                deploymentRequirement: 'REQUESTED',
                confidence: 0.9,
              }
            : {
                semanticIntent: 'EXTERNAL_ACTION',
                requiredCapabilities: ['business.action'],
                freshnessRequirement: 'NONE',
                confidence: 0.8,
              },
        );
      },
      1,
      (value) => normalizePlannerDecisionCandidate(value, interpretation),
    );

    assert.equal(attempts, 2);
    assert.equal(contract.previewRequirement, 'REQUIRED');
    assert.equal(contract.deploymentRequirement, 'NONE');
    assert.deepEqual(contract.requiredCapabilities, [
      'software.implement',
      'validation.run',
    ]);
  });

  it('enforces explicit product controls at the API boundary before Connect can execute', () => {
    const misroutedGoal = goal({
      semanticIntent: 'EXTERNAL_ACTION',
      previewRequirement: 'NONE',
      deploymentRequirement: 'REQUESTED',
      requiredCapabilities: ['business.action'],
    });

    const corrected = enforceExplicitExecutionControls(
      {
        goalContract: misroutedGoal,
        dispatch: 'chat',
        // The API boundary must not rely on this projection agreeing with the
        // goal contract. A stale/partial projection was the production bug.
        capabilityIds: ['conversation.respond'],
        rationale: 'model-selected external action',
        blockers: [],
        usage: {
          inputTokensUsed: 0,
          outputTokensUsed: 0,
          totalTokensUsed: 0,
          inputTokensRemaining: 1,
          outputTokensRemaining: 1,
          totalTokensRemaining: 1,
          percentUsed: 0,
          quotaPeriodStart: '2026-10-01',
          emergencyTokensAvailable: false,
          emergencyTokensClaimedThisMonth: false,
          totalLimit: 1,
          planTier: 'free',
        },
      },
      'Produce a compact scheduling portal with automated checks. Give me a runnable Preview without deploying it.',
    );

    assert.equal(corrected.dispatch, 'build');
    assert.equal(corrected.goalContract.previewRequirement, 'REQUIRED');
    assert.equal(corrected.goalContract.deploymentRequirement, 'NONE');
    assert.deepEqual(corrected.capabilityIds, [
      'software.implement',
      'validation.run',
    ]);
  });

  it('repairs a build dispatch whose goal contract still points at Connect', () => {
    const corrected = enforceExplicitExecutionControls(
      {
        goalContract: goal({
          semanticIntent: 'EXTERNAL_ACTION',
          previewRequirement: 'REQUIRED',
          deploymentRequirement: 'NONE',
          requiredCapabilities: ['business.action'],
        }),
        dispatch: 'build',
        capabilityIds: ['software.implement', 'validation.run'],
        rationale: 'inconsistent planner projections',
        blockers: [],
        directResponse: 'I will use the connected scheduling service.',
        usage: {
          inputTokensUsed: 0,
          outputTokensUsed: 0,
          totalTokensUsed: 0,
          inputTokensRemaining: 1,
          outputTokensRemaining: 1,
          totalTokensRemaining: 1,
          percentUsed: 0,
          quotaPeriodStart: '2026-10-01',
          emergencyTokensAvailable: false,
          emergencyTokensClaimedThisMonth: false,
          totalLimit: 1,
          planTier: 'free',
        },
      },
      'Make a responsive clinic scheduler with tests. Create a Preview, but do not deploy it.',
    );

    assert.equal(corrected.dispatch, 'build');
    assert.equal(corrected.directResponse, undefined);
    assert.equal(corrected.goalContract.semanticIntent, 'MODIFY');
    assert.equal(corrected.goalContract.previewRequirement, 'REQUIRED');
    assert.equal(corrected.goalContract.deploymentRequirement, 'NONE');
    assert.deepEqual(corrected.goalContract.requiredCapabilities, [
      'software.implement',
      'validation.run',
    ]);
  });
});

describe('semantic authority blockers', () => {
  it('does not let model prose revoke an authority the runtime granted', () => {
    const blockers = unresolvedGoalBlockers([
      'Missing authority for validation.run: sandbox:execute.',
      'An essential product decision is still missing.',
    ], new Set(['model:execute', 'sandbox:execute']));
    assert.deepEqual(blockers, ['An essential product decision is still missing.']);
  });

  it('retains a blocker for authority the runtime did not grant', () => {
    const blockers = unresolvedGoalBlockers(
      ['Missing authority repository:write; user approval is required.'],
      new Set(['model:execute', 'sandbox:execute']),
    );
    assert.equal(blockers.length, 1);
  });
});

describe('semantic planner single-model delivery',()=>{
  it('preserves tenant, authority, egress, stale execution and accounting denials without another request',async()=>{
    const denials=[new TenantAccessError(404,'RESOURCE_NOT_FOUND'),new AuthorityError('AUTHORITY_EXPIRED'),new EgressDenied('FOREIGN_FILE_OWNER'),
      Object.assign(Error('Stale execution'),{code:'RUN_STATE_CONFLICT'}),new PostCompletionAccountingError(),
      ...['MODEL_DISPATCH_BINDING_DENIED','MODEL_CREDENTIAL_EGRESS_DENIED','MODEL_PAYLOAD_INVALID','MODEL_DESTINATION_DENIED'].map(code=>Object.assign(Error('Local denial'),{code}))];
    for(const denial of denials){
      const calls:string[]=[];
      await assert.rejects(executeHedgedPlannerFallback({routes:['deepseek_v4_1_flash_1017','claude_sonnet_5_5'],signal:new AbortController().signal,
        routeTimeoutMs:1000,hedgeDelayMs:0,execute:async model=>{calls.push(model);throw denial;}}),error=>error===denial);
      assert.deepEqual(calls,['deepseek_v4_1_flash_1017']);
    }
  });
  it('never purchases a hedge after a provider outage or a slow default request',async()=>{
    for(const timeout of [false,true]){
      const calls:string[]=[];let aborted=false;
      await assert.rejects(executeHedgedPlannerFallback({routes:['deepseek_v4_1_flash_1017','claude_sonnet_5_5'],signal:new AbortController().signal,
        routeTimeoutMs:10,hedgeDelayMs:0,execute:async(model,signal)=>{
          calls.push(model);if(!timeout)throw Object.assign(Error('Service unavailable'),{status:503});
          return new Promise<string>((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('request timed out'));},{once:true}));
        }}),{code:'PROVIDER_UNAVAILABLE'});
      assert.deepEqual(calls,['deepseek_v4_1_flash_1017']);assert.equal(aborted,timeout);
    }
  });
  it('returns the first plan once and refuses a retired or premium planner before execution',async()=>{
    let calls=0;
    const input={routes:['deepseek_v4_1_flash_1017'] as const,signal:new AbortController().signal,routeTimeoutMs:1000,execute:async()=>{calls++;return 'plan';}};
    assert.deepEqual(await executeHedgedPlannerFallback(input),{value:'plan',modelId:'deepseek_v4_1_flash_1017'});
    for(const model of ['kimi_k3','glm_5_3','deepseek_v4_flash','claude_sonnet_5_5'] as const)await assert.rejects(executeHedgedPlannerFallback({...input,routes:[model]}),{code:'MODEL_DESTINATION_DENIED'});
    assert.equal(calls,1);
  });
  it('retains the bounded JSON decision controls and total deadline',()=>{
    const signal=new AbortController().signal;
    assert.deepEqual(semanticPlannerCompletionOptions(signal),{maxTokens:1500,temperature:0,json:true,reasoningMode:'none',signal});
    assert.equal(SEMANTIC_PLANNER_ROUTE_TIMEOUT_MS,SEMANTIC_PLANNER_DEFAULT_TOTAL_TIMEOUT_MS);
    assert.ok(SEMANTIC_PLANNER_MAX_TOTAL_TIMEOUT_MS<60000);
  });
  it('uses only the default while honoring current operator policy and circuit health',()=>{
    assert.deepEqual(interpreterModelOrder({}),['deepseek_v4_1_flash_1017']);
    assert.deepEqual(selectPlannerRoutes({},()=>({status:'healthy'})),['deepseek_v4_1_flash_1017']);
    for(const env of [{XROGA_DISABLED_PROVIDERS:'zurelay'},{XROGA_ALLOWED_MODELS:'kimi_k3'},{XROGA_ALLOWED_MODELS:'claude_sonnet_5_5'}])assert.throws(()=>interpreterModelOrder(env),/No configured model/);
    assert.throws(()=>selectPlannerRoutes({},()=>({status:'circuit_open'})),{code:'PLANNER_PROVIDER_UNAVAILABLE'});
  });
  it('malformed semantic content cannot buy a second generation and valid content still parses',async()=>{
    let calls=0;
    await assert.rejects(resolveStructuredGoalContract(async()=>{calls++;return 'not JSON';}));assert.equal(calls,1);
    const contract=await resolveStructuredGoalContract(async()=>JSON.stringify({...goal({semanticIntent:'PROPOSE'}),commentary:'not part of the contract'}));
    assert.equal(contract.semanticIntent,'PROPOSE');assert.equal('commentary' in contract,false);
  });
});

describe('social protocol fast path', () => {
  it('answers only bounded social turns and never questions or attached requests', () => {
    assert.match(protocolSocialResponse('hello') ?? '', /help you/i);
    assert.match(protocolSocialResponse('Good evening — glad to be here.') ?? '', /help you/i);
    assert.match(protocolSocialResponse('Hello there — nice to connect!') ?? '', /help you/i);
    assert.equal(protocolSocialResponse('Can you build a parser?'), null);
    assert.equal(protocolSocialResponse('hello?', false), null);
    assert.equal(protocolSocialResponse('Hello — inspect this repository'), null);
    assert.equal(protocolSocialResponse('hi', true), null);
  });
});

describe('explicit universal build command', () => {
  it('routes the canonical arbitrary project directly without guessing a product type', async t => {
    const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']; const prior = keys.map(key => process.env[key]);
    process.env.SUPABASE_URL = 'http://127.0.0.1:49195'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
    t.after(() => keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; }));
    t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input)); assert.equal(url.origin, 'http://127.0.0.1:49195');
      assert.equal(url.pathname, '/rest/v1/user_token_usage'); assert.equal(url.searchParams.get('user_id'), 'eq.generated-user');
      return Response.json({ user_id: 'generated-user', plan_tier: 'free', plan_budget_usd: 1.65,
        quota_period_start: `${new Date().toISOString().slice(0, 7)}-01`, input_tokens: 0, output_tokens: 0,
        spent_usd: 0, rollover_usd: 0, model_usage: {} });
    });
    const plan = await planExplicitProjectBuild({
      userId: 'generated-user',
      message: '/build update the selected source and run its tests',
      projectContext: { repo: 'arbitrary-owner/arbitrary-repository', branch: 'topic/generated-branch', projectRoot: '/packages/tool' },
    });
    assert.equal(plan.dispatch, 'build');
    assert.equal(plan.goalContract.semanticIntent, 'MODIFY');
    assert.deepEqual(plan.goalContract.projectContext, {
      repo: 'arbitrary-owner/arbitrary-repository', branch: 'topic/generated-branch', projectRoot: '/packages/tool',
    });
    assert.deepEqual(plan.capabilityIds, ['repository.read', 'software.implement', 'validation.run', 'repository.write']);
    assert.doesNotMatch(plan.goalContract.goal, /^\/build/);
  });

  it('refuses an empty explicit build command', async () => {
    await assert.rejects(
      planExplicitProjectBuild({ userId: 'generated-user', message: '/build', projectContext: { repo: 'o/r', branch: 'b', projectRoot: '/' } }),
      (error: unknown) => (error as { code?: string }).code === 'INVALID_GOAL',
    );
  });
});
