import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPresentationCoverage, createPresentationProjection, type AnswerObligations, type PresentationPlan } from './responsePresentation.js';
import { goalContractSchema, normalizePlannerDecisionCandidate } from './universal/goalContract.js';

const obligations: AnswerObligations = [
  { id: 'relationships', description: 'Explain the supplied component relationships.', origin: 'requested', formats: ['graph'] },
  { id: 'data-shape', description: 'Show the relevant proposed records and fields.', origin: 'necessary-support', formats: ['table'] },
  { id: 'scope-comparison', description: 'Compare the requested access scopes.', origin: 'requested', formats: ['cards'] },
];
const graph: PresentationPlan[number] = { kind: 'graph', heading: 'Connections', instruction: 'Use the supplied topology.', covers: ['relationships'] };

test('requirements missing from the plan cannot pass merely because its selected sections are valid', () => {
  assert.deepEqual(assessPresentationCoverage([graph], obligations), {
    complete: false, issues: ['missing:data-shape:table', 'missing:scope-comparison:cards'],
  });
  const complete: PresentationPlan = [graph,
    { kind: 'table', heading: 'Records', instruction: 'Preserve the supplied fields.', covers: ['data-shape'] },
    { kind: 'cards', heading: 'Access scopes', instruction: 'Preserve the supplied distinctions.', covers: ['scope-comparison'] },
  ];
  assert.equal(assessPresentationCoverage(complete, obligations).complete, true);
  assert.equal(assessPresentationCoverage([{ ...graph, kind: 'prose', covers: obligations.map(x => x.id) }], obligations).complete, false);
});

test('coverage is request-specific rather than a fixed system template', () => {
  assert.equal(assessPresentationCoverage([], [{ id: 'reply', description: 'Answer the greeting.', origin: 'requested', formats: ['prose'] }]).complete, true);
  assert.equal(assessPresentationCoverage([{ kind: 'steps', heading: 'Release', instruction: 'Explain the supplied release stages.', covers: ['stages'] }], [
    { id: 'stages', description: 'Explain the release sequence only.', origin: 'requested', formats: ['steps'] },
  ]).complete, true);
  assert.equal(assessPresentationCoverage([graph]).complete, false);
  assert.equal(assessPresentationCoverage([{ ...graph, covers: ['invented'] }], obligations).complete, false);
  assert.equal(assessPresentationCoverage([graph], [...obligations, obligations[0]]).complete, false);
});

test('a valid routing decision survives incomplete coverage without granting authority or requiring paid repair', () => {
  const decision = { semanticIntent: 'ANSWER', requiredCapabilities: ['conversation.respond'], freshnessRequirement: 'NONE', presentation: [graph], answerObligations: obligations };
  const result = goalContractSchema.parse(normalizePlannerDecisionCandidate(decision, { message: 'Explain the supplied system and compare its access scopes.', history: [], attachments: [], projectContext: null }));
  assert.equal(result.presentationIssue, 'invalid');
  assert.deepEqual(result.answerObligations, obligations);
  assert.deepEqual(result.presentation, [graph]);
  assert.deepEqual(result.requiredAuthorities, []);
});

test('one invalid visual preserves explanations and later valid sections without rendering rejected data', () => {
  const plan: PresentationPlan = [graph, { kind: 'prose', heading: 'Caveat', instruction: 'Preserve the caveat.' }];
  const raw = JSON.stringify({
    s0: { markdown: 'The source explanation remains available.', data: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', source: 'a', target: 'missing', label: 'Invalid' }] } },
    s1: { markdown: 'The later caveat also remains available.', data: null },
  });
  const projection = createPresentationProjection(plan);
  projection.append(raw);
  const result = projection.finish(raw);
  assert.equal(result.ok, false);
  assert.equal(result.original, raw);
  assert.match(result.response, /source explanation/);
  assert.match(result.response, /later caveat/);
  assert.match(result.response, /could not be validated/);
  assert.doesNotMatch(result.response, /```xroga-ui/);
});
