import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BLACK_HOLE_TASK_CLASSES,
  analyzeTask,
  type BlackHoleTaskClass,
} from './taskClass.js';

// ---------------------------------------------------------------------------
// The class list is a contract, not a suggestion
// ---------------------------------------------------------------------------

test('every class §4 names is supported', () => {
  const required: BlackHoleTaskClass[] = [
    'simple_chat', 'rewrite', 'summarize', 'classification', 'extraction',
    'structured_extraction', 'analysis', 'reasoning', 'deep_reasoning', 'research',
    'coding', 'repository_coding', 'architecture', 'debugging', 'refactoring',
    'long_horizon_engineering', 'vision', 'multimodal', 'agentic', 'tool_workflow',
    'security_review', 'deployment_debugging',
  ];
  assert.deepEqual([...BLACK_HOLE_TASK_CLASSES].sort(), [...required].sort());
});

// ---------------------------------------------------------------------------
// Deterministic signals — §4's four worked examples
// ---------------------------------------------------------------------------

test('an attached image classifies as vision without a model call', () => {
  const analysis = analyzeTask({
    prompt: 'what do you make of this',
    attachments: [{ mediaType: 'image/png', name: 'screenshot.png' }],
  });
  assert.equal(analysis.primary, 'vision');
  assert.equal(analysis.confident, true);
  assert.equal(analysis.hasImageAttachment, true);
  assert.ok(analysis.requiredAuthority.includes('inspectMedia'));
});

test('an image beside a document classifies as multimodal, not vision', () => {
  // A route that can read the image is not automatically one that can read the PDF too.
  const analysis = analyzeTask({
    prompt: 'compare these',
    attachments: [
      { mediaType: 'image/jpeg', name: 'chart.jpg' },
      { mediaType: 'application/pdf', name: 'report.pdf' },
    ],
  });
  assert.equal(analysis.primary, 'multimodal');
  assert.equal(analysis.hasNonImageAttachment, true);
});

test('a declared repository mutation requires write authority', () => {
  const analysis = analyzeTask({
    prompt: 'add a health endpoint',
    repositoryMutationRequested: true,
  });
  assert.equal(analysis.primary, 'repository_coding');
  assert.ok(analysis.requiredAuthority.includes('writeProjectFiles'));
  assert.ok(analysis.requiredAuthority.includes('mutateRepository'));
  assert.equal(analysis.confident, true);
});

test('current X information routes to X research', () => {
  const analysis = analyzeTask({ prompt: 'what are people saying on x.com about the launch' });
  assert.equal(analysis.researchKind, 'x');
  assert.equal(analysis.requiresResearch, true);
  assert.ok(analysis.classes.includes('research'));
});

test('a known URL is fetched rather than searched for', () => {
  const analysis = analyzeTask({
    prompt: 'summarize https://example.com/docs/getting-started for me',
  });
  assert.equal(analysis.researchKind, 'url_fetch');
  assert.deepEqual(analysis.knownUrls, ['https://example.com/docs/getting-started']);
});

test('a bare domain is not mistaken for a fetchable URL', () => {
  // "compare stripe.com and adyen.com" is a search, not a fetch. A pattern loose enough to
  // catch a bare domain turns that request into a fetch of the wrong page.
  const analysis = analyzeTask({ prompt: 'compare stripe.com and adyen.com pricing' });
  assert.deepEqual(analysis.knownUrls, []);
  assert.notEqual(analysis.researchKind, 'url_fetch');
});

// ---------------------------------------------------------------------------
// Authority derivation is the security-relevant output
// ---------------------------------------------------------------------------

test('a question about a repository does not claim write authority', () => {
  // Over-claiming write authority pushes read-only questions onto engineering models and away
  // from the research route that should answer them.
  const analysis = analyzeTask({ prompt: 'how is this repository structured?' });
  assert.equal(analysis.requiredAuthority.includes('writeProjectFiles'), false);
});

test('coding intent without a project scope is coding, not repository_coding', () => {
  const analysis = analyzeTask({ prompt: 'write me a function that debounces calls' });
  assert.ok(analysis.classes.includes('coding'));
  assert.equal(analysis.classes.includes('repository_coding'), false);
  assert.equal(analysis.requiredAuthority.includes('writeProjectFiles'), false);
});

test('coding intent inside a project does claim write authority', () => {
  const analysis = analyzeTask({ prompt: 'add pagination to the users list', projectId: 'p-1' });
  assert.equal(analysis.primary, 'repository_coding');
  assert.ok(analysis.requiredAuthority.includes('writeProjectFiles'));
});

test('a deploy request claims deploy authority', () => {
  const analysis = analyzeTask({ prompt: 'deploy the app to production', projectId: 'p-1' });
  assert.ok(analysis.requiredAuthority.includes('deploy'));
});

// ---------------------------------------------------------------------------
// Keyword classes
// ---------------------------------------------------------------------------

test('specific classes win over the generic ones they resemble', () => {
  const deployment = analyzeTask({ prompt: 'the vercel deployment failed with a build error' });
  assert.ok(deployment.classes.includes('deployment_debugging'));

  const security = analyzeTask({ prompt: 'do a security review of the auth flow for xss' });
  assert.ok(security.classes.includes('security_review'));

  const longHorizon = analyzeTask({ prompt: 'migrate the codebase off the old ORM' });
  assert.ok(longHorizon.classes.includes('long_horizon_engineering'));
});

test('a caller-supplied schema means structured extraction', () => {
  const analysis = analyzeTask({ prompt: 'pull the fields', responseSchemaRequested: true });
  assert.ok(analysis.classes.includes('structured_extraction'));
  assert.equal(analysis.classes.includes('extraction'), false);
  assert.equal(analysis.confident, true);
});

test('offered tools make a request a tool workflow, and autonomy makes it agentic', () => {
  const workflow = analyzeTask({ prompt: 'check the status', toolsOffered: ['http_get'] });
  assert.ok(workflow.classes.includes('tool_workflow'));

  const agentic = analyzeTask({
    prompt: 'keep going until the tests pass',
    toolsOffered: ['run_tests', 'edit_file'],
  });
  assert.ok(agentic.classes.includes('agentic'));
});

test('previous failures add a debugging class', () => {
  const analysis = analyzeTask({ prompt: 'try building the landing page again', previousFailures: 2 });
  assert.ok(analysis.classes.includes('debugging'));
});

test('an ordinary greeting is simple_chat and is not marked confident', () => {
  const analysis = analyzeTask({ prompt: 'hey there' });
  assert.equal(analysis.primary, 'simple_chat');
  // Nothing strong fired, so a later stage is free to escalate this one to a model.
  assert.equal(analysis.confident, false);
});

test('classes are unique and primary is always the first', () => {
  const analysis = analyzeTask({
    prompt: 'debug the failing build and refactor the broken module',
    projectId: 'p-1',
    previousFailures: 1,
  });
  assert.equal(new Set(analysis.classes).size, analysis.classes.length);
  assert.equal(analysis.primary, analysis.classes[0]);
});
