// Test contracts only. These do not install workers, call providers or certify live journeys.
const rows = [
  ['CHAT', 'Explain idempotency in plain language.', 'ANSWER', ['conversation.respond'], [], ['canonical-durable-execution', 'activity-feeds'], 'backend/src/ai/pipeline.ts', 'Authenticated streamed provider reply plus isolated browser/session restoration is not verified without TEST configuration.'],
  ['WEB-RESEARCH', 'Research current accessibility guidance and cite primary sources.', 'INVESTIGATE', ['research.public-web', 'conversation.respond'], [], ['web-research-citations', 'provenance-evidence'], 'backend/src/ai/pipeline.ts', 'Fresh source retrieval, observed timestamps and provider-backed citations require an approved sandbox feed.'],
  ['EXISTING-REPO-CODING', 'Repair the authorized fixture repository and show diff and test evidence.', 'MODIFY', ['repository.read', 'software.implement', 'repository.write'], ['repository.write'], ['github-coding', 'sandboxes'], 'backend/src/ai/pipeline.ts', 'Authorized repository/sandbox credentials and isolated mutation/verification fixtures are unavailable.'],
  ['NEW-SAAS', 'Build a clinic appointment application with reproducible source artifacts.', 'MODIFY', ['software.implement'], ['sandbox.execute'], ['app-site-creation', 'verification'], 'backend/src/ai/pipeline.ts', 'A full model-to-sandbox build and reproducible artifact receipt has not been independently executed.'],
  ['BUSINESS-READ', 'Read the fixture account contact list without changing it.', 'INVESTIGATE', ['business.read'], ['connection.read'], ['composio-dynamic-tools', 'tenant-isolation'], 'backend/src/services/integrations/businessRead.ts', 'Only owner/read-policy boundaries can be stub-tested now; approved provider sandbox read and account selection remain unverified.'],
  ['BUSINESS-WRITE', 'Prepare deletion of the selected fixture message and ask for confirmation.', 'EXTERNAL_ACTION', ['business.action'], ['connection.write', 'action.confirm'], ['authority-approval', 'webhook-replay-idempotency'], 'backend/src/services/integrations/businessAction.ts', 'Durable exact-scope approval/replay and provider postcondition verification need Commands 007–008 plus isolated DB/provider proof.'],
  ['MIXED-MULTI-OUTCOME', 'Research a topic, update a fixture CRM, create a document and prepare a message.', 'MIXED', ['research.public-web', 'business.action', 'artifact.generate'], ['connection.write', 'action.confirm'], ['multi-intent-requests', 'completion-semantics'], 'backend/src/ai/universal/semanticRequestPlanner.ts', 'Independent dependency fan-out and per-outcome durable partial/recovery evidence are not proved by single-dispatch planning.'],
  ['DOCUMENTS', 'Create a document, spreadsheet and slide summary with readable evidence.', 'MODIFY', ['artifact.generate'], ['artifact.write'], ['drive-docs-slides-sheets', 'xroga-blocks'], 'backend/src/ai/universal/outputEnvelope.ts', 'Existing generators/renderers are partial boundaries; real end-to-end binary validation, durable storage and owner reopen remain unverified.'],
  ['WORK-PACK', 'Start a bounded clinic work pack with reviewed permissions.', 'EXTERNAL_ACTION', ['work-pack.start'], ['pack.install', 'action.confirm'], ['workflow-work-packs', 'activepieces'], null, 'Work-pack catalog/scheduler backend is not implemented by the preview.'],
  ['AI-EMPLOYEE', 'Assign a bounded recurring customer-operations goal.', 'EXTERNAL_ACTION', ['employee.assign'], ['employee.schedule', 'action.confirm'], ['ai-employees', 'schedulers'], null, 'A durable scheduled employee runtime is not established; queue definitions without consumers are not working employees.'],
  ['PAID-ANDROID-PUBLISH', 'In an isolated sandbox, review a quote and publish the fixture Android build.', 'EXTERNAL_ACTION', ['software.implement', 'publish.android'], ['billing.verify', 'publish.submit', 'action.confirm'], ['paid-managed-publishing', 'android-ios-publishing', 'billing'], 'backend/src/services/publish/easPublish.ts', 'Approved provider/payment sandbox, staged payment-to-build authority and store receipts are unavailable; normal CI must not charge or submit.'],
  ['SEO-DRIVE', 'Research an SEO brief and save an authorized report artifact.', 'MIXED', ['research.public-web', 'artifact.generate'], ['artifact.write'], ['seo', 'drive-docs-slides-sheets'], 'backend/src/ai/pipeline.ts', 'Multi-tool owner-scoped durable Drive output and actual source freshness remain unverified.'],
];

export const fixtureContracts = rows.map(([suffix, intent, semanticIntent, capabilities, authorities, families, implementation, gap]) => {
  const id = `GJ-${suffix}`, fixtureId = `fixture-${suffix.toLowerCase()}`;
  const effects = authorities.length > 0;
  const taskNames = ['interpret', 'prepare', ...(effects ? ['authorize'] : []), 'execute', 'verify', 'present'];
  const graph = suffix === 'MIXED-MULTI-OUTCOME' ? [
    ['interpret', []], ['research', ['interpret']], ['prepare-crm', ['interpret']], ['authorize-crm', ['prepare-crm']],
    ['execute-crm', ['authorize-crm']], ['document', ['research']], ['prepare-message', ['document', 'execute-crm']],
    ['authorize-message', ['prepare-message']], ['execute-message', ['authorize-message']],
    ['verify-each-outcome', ['research', 'document', 'execute-crm', 'execute-message']], ['present-partial-or-verified', ['verify-each-outcome']],
  ] : suffix === 'PAID-ANDROID-PUBLISH' ? [
    ['preflight', []], ['quote', ['preflight']], ['verify-sandbox-payment', ['quote']], ['build', ['verify-sandbox-payment']],
    ['qa', ['build']], ['authorize-submission', ['qa']], ['sandbox-submit', ['authorize-submission']],
    ['verify-provider-status', ['sandbox-submit']], ['present', ['verify-provider-status']],
  ] : taskNames.map((name,index)=>[name,index?[taskNames[index-1]]:[]]);
  return {
    id, fixtureId, userIntent: intent,
    tenant: { ownerId: '11111111-1111-4111-8111-111111111111', outsiderId: '22222222-2222-4222-8222-222222222222', realm: 'ISOLATED_FIXTURE_ONLY' },
    requirements: ['XB01-C005', ...families.map(family => `XR-FAMILY-${family}`)],
    prerequisiteConnections: effects ? ['Namespaced isolated account with explicit owner/resource scope; never a default production account'] : ['Approved stub/public evidence feed; no live provider credentials inherited'],
    capabilityClasses: capabilities,
    planningGraph: graph.map(([name,dependencies])=>({id:`${fixtureId}:${name}`,operation:name,dependencies:dependencies.map(dependency=>`${fixtureId}:${dependency}`)})),
    authorityPoints: effects ? authorities.map(authority => ({authority, boundary: 'Backend derives actor/resource scope; immutable action digest and bounded grant before effects'})) : [{authority: 'authenticated.read', boundary: 'Server identity, owner-filtered history and bounded model budget; no write authority'}],
    budgetRules: ['Conservative estimate and bounded reservation before each chargeable operation', 'Idempotent settlement/release; missing durable accounting blocks paid execution', 'Storage quota is distinct from AI spend'],
    durableState: ['Owner-bound goal/plan version', 'Append-only run events with stable sequence', 'Approval/evidence/artifact references persisted before verified completion'],
    providerSandboxBehavior: 'Strict in-process HTTP stubs/loopback transport for PR tests; no real emails, charges, publication, Git writes or customer data. Provider sandbox remains an independently blocked tier.',
    verificationEvidence: [{id: `${fixtureId}:evidence`, kind: 'outcome-specific', requirement: suffix === 'CHAT' ? 'Authenticated response/event identity and restored sequence/history' : 'Independent authorized postconditions and validated artifact/provider receipt; a model saying done is insufficient'}],
    uiEventsBlocks: ['Versioned canonical event adapters, not a second SSE architecture', suffix === 'WEB-RESEARCH' ? 'Source/citation/evidence XrogaBlocks with timestamps' : 'Narrative plus appropriate evidence/artifact/approval/status XrogaBlocks'],
    completionSemantics: 'No PASS until all required postconditions, ownership, budget and durable evidence are independently recorded. Stub success is not production completion.',
    timeoutRetry: 'Bounded timeout/retry; uncertain writes stay pending/blocked, never blindly replayed. Refresh disconnects transport, not the durable operation.',
    cleanup: 'Fresh fixture namespace per test; restore mocks/env, close loopback servers and end local runs. Isolated provider resources require verified cleanup; never production users.',
    positiveAssertions: ['Valid typed planning contract preserves requested outcomes', 'Expected component boundaries return scoped results', 'UI evidence remains readable after replay/restore'],
    negativeAssertions: ['Unauthenticated/body-supplied identity rejected', 'Second tenant cannot inspect owner resources', 'Business write without confirmation is rejected', 'Confirmation for modified prepared action is rejected', 'Provider failure cannot become verified', 'Provider timeout does not blindly replay uncertain writes', 'Duplicated webhook/event cannot create a second effect/outcome', 'Browser refresh does not cancel a long execution', 'Unsupported capability stays blocked', 'One failed independent subtask prevents all-success claims', 'A prompt asking to claim success without evidence cannot create a verified receipt'],
    implementationPaths: implementation ? [implementation] : [],
    state: 'BLOCKED_KNOWN_GAP',
    blockers: [{requirementIds: families.map(family => `XR-FAMILY-${family}`), ownerCommands: suffix === 'BUSINESS-WRITE' ? ['007', '008'] : ['LATER_PENDING_HISTORICAL_EXPORT'], missingCapability: gap}],
    goal: {version: '1.0', goal: intent, desiredOutcome: intent, semanticIntent, constraints: ['Fixture only; no external side effects'], acceptance: ['Required independent evidence is present'], historyContext: [], projectContext: null,
      ...(suffix === 'WEB-RESEARCH' || suffix === 'SEO-DRIVE' ? {freshnessRequirement:'CURRENT_REQUIRED',sourcePolicy:{mode:'official_only',scope:'public_web',officialDomains:['www.w3.org']}} : {}),
      ...(suffix === 'NEW-SAAS' || suffix === 'EXISTING-REPO-CODING' ? {previewRequirement:'REQUIRED'} : {}),
      deliverables: [{id:`${fixtureId}:outcome`,mediaType:suffix === 'WEB-RESEARCH' || suffix === 'SEO-DRIVE'?'text/markdown':'text/plain',description:`Fixture receipt/evidence for ${intent}`,required:true,acceptance:['Independent postcondition evidence; not model text']}],
      requiredCapabilities: capabilities, requiredAuthorities: authorities, risks: [], confidence: 1, blockers: [], contextComplexity: 'low'},
  };
});
