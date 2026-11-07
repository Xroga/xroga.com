import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPresentationRelevance } from './presentationRelevance.js';
import { prepareAnswerCoverage, quantitativeScenarioSupport } from './answerCoverage.js';
import { readIntent } from './intentReasoning.js';
import type { AnswerObligations, PresentationPlan } from './responsePresentation.js';

const section = (kind: PresentationPlan[number]['kind'], heading: string, instruction: string, covers?: string[]): PresentationPlan[number] => ({ kind, heading, instruction, ...(covers ? { covers } : {}) });
const need = (id: string, description: string, origin: 'requested' | 'necessary-support' = 'necessary-support'): AnswerObligations[number] => ({ id, description, origin, formats: ['prose'] });

const FLIGHT = 'I want to travel from Dubai to New York. Which airline is best, and how much will tickets cost?';
const WEBSITE = 'Build a website for my real estate agency with property listings, an automation bot, a voice agent and premium UI/UX.';

test('a flight request never receives a software architecture diagram or a trading calculator', () => {
  const plan = [
    section('table', 'Airline comparison', 'Compare airlines, fares, flight duration, layovers and baggage for Dubai to New York.', ['a']),
    section('graph', 'System architecture', 'Draw the API gateway, microservices and database schema behind the booking flow.', ['b']),
    section('calculator', 'Return on investment', 'Let the user explore compound interest and portfolio ROI for ticket spending.', ['c']),
  ];
  const result = assessPresentationRelevance(FLIGHT, plan, [need('a', 'airline comparison'), need('b', 'support'), need('c', 'support')]);
  assert.equal(result.relevant, false);
  assert.deepEqual(result.detail.map(item => [item.heading, item.domain]).sort(), [['Return on investment', 'finance-trading'], ['System architecture', 'software-architecture']]);
});

test('a flight answer with relevant structure passes untouched', () => {
  const plan = [
    section('prose', 'Best options', 'Recommend airlines by the traveller priorities and say which fares are unverified.', ['a']),
    section('table', 'Airline comparison', 'Compare airlines, typical fares, duration, connections and baggage.', ['a']),
  ];
  assert.equal(assessPresentationRelevance(FLIGHT, plan, [need('a', 'airline comparison')]).relevant, true);
});

test('a real estate website build is not given an unrelated trading or finance widget', () => {
  const plan = [
    section('steps', 'Build plan', 'Property listing pages, filters, chatbot and voice agent for the agency.', ['a']),
    section('calculator', 'Trading simulator', 'Interactive candlestick trading simulator with portfolio volatility.', ['z']),
  ];
  const result = assessPresentationRelevance(WEBSITE, plan, [need('a', 'build', 'requested'), need('z', 'support')]);
  assert.equal(result.relevant, false);
  assert.equal(result.detail[0].domain, 'finance-trading');
});

test('what the person explicitly asked for always keeps its section, whatever the field', () => {
  const asked = 'Explain how a trading portfolio can be rebalanced and let me change the numbers in a calculator.';
  const plan = [section('calculator', 'Rebalance calculator', 'Portfolio stock and bond weights with volatility.', ['req-calc'])];
  assert.equal(assessPresentationRelevance(asked, plan, [need('req-calc', 'calculator', 'requested')]).relevant, true);
});

test('subjects the request actually names are never treated as drift', () => {
  const saas = 'Explain a multi-tenant SaaS architecture with Next.js, Supabase and Stripe, including an architecture diagram.';
  const plan = [section('graph', 'Architecture', 'API gateway, backend services, database schema and webhook handling.', ['d'])];
  assert.equal(assessPresentationRelevance(saas, plan, [need('d', 'diagram', 'requested')]).relevant, true);
});

test('drift is left out of the plan and never turns a good answer into a warning', () => {
  const plan = [section('graph', 'Microservices map', 'API gateway, microservices and kubernetes for ticket booking.', ['s'])];
  const out = prepareAnswerCoverage(FLIGHT, plan, [need('s', 'support')]);
  assert.deepEqual(out.omittedOffTopic, ['Microservices map']);
  assert.equal(out.plan.length, 0);
  assert.ok(!out.coverage.issues.some(issue => issue.startsWith('off-topic')), out.coverage.issues.join(','));
});

test('a database comparison for a SaaS is software even though it never says backend or endpoint', () => {
  const prompt = 'Compare PostgreSQL, MySQL and SQLite for a small SaaS';
  const plan = [
    section('table', 'Side-by-side comparison', 'Compare the three on concurrency, operations, scaling and feature fit.', ['c']),
    section('graph', 'Where the database sits', 'Show the frontend, backend, API gateway and database layers of a small SaaS.', ['s']),
  ];
  assert.equal(assessPresentationRelevance(prompt, plan, [need('c', 'comparison'), need('s', 'support')]).relevant, true);
  const out = prepareAnswerCoverage(prompt, plan, [need('c', 'comparison'), need('s', 'support')]);
  assert.equal(out.omittedOffTopic, undefined);
  assert.equal(out.plan.length, 2);
});

test('explaining and executing the same subject are read as different outcomes', () => {
  const outcome = (prompt: string) => readIntent(prompt).outcome;
  assert.notEqual(outcome('Explain a real estate website architecture'), outcome('Build the real estate website.'));
  assert.equal(outcome('Explain a real estate website architecture'), 'something_understood');
  assert.equal(outcome('Build a website for my real estate agency with property listings.'), 'software_running_somewhere');
  assert.equal(outcome('Explain the cause of this TypeError: Cannot read properties of undefined'), 'something_understood');
  assert.equal(outcome('Fix the error in my repository'), 'something_broken_working_again');
  assert.equal(outcome('I run a SaaS agency. Recommend useful automations, explain how they work, and show me workflow diagrams before I build anything.'), 'something_understood');
  assert.equal(outcome('Build automation number two.'), 'software_running_somewhere');
  assert.equal(outcome('Compare flight options from Dubai to New York and tell me the best airline'), 'a_question_answered');
});

test('a prose-only obligation the planner forgot to bind is carried by the prose section, but a missing visual is not', () => {
  const prompt = 'If I invest $5,000 at 7% compounded yearly, how much will I have after 10 years?';
  const plan = [section('prose', 'Answer', 'State the result.', ['ob1']), section('calculator', 'Calculation', 'Show the formula.', ['ob3'])];
  const obligations: AnswerObligations = [
    { id: 'ob1', description: 'the result', origin: 'requested', formats: ['prose'] },
    { id: 'ob2', description: 'the assumptions', origin: 'necessary-support', formats: ['prose'] },
    { id: 'ob3', description: 'the calculation', origin: 'requested', formats: ['calculator'] },
  ];
  const out = prepareAnswerCoverage(prompt, plan, obligations);
  assert.equal(out.coverage.complete, true, out.coverage.issues.join(','));
  assert.deepEqual(out.plan[0].covers, ['ob1', 'ob2']);
  const noCalculator = prepareAnswerCoverage(prompt, [section('prose', 'Answer', 'State the result.', ['ob1'])], obligations);
  assert.equal(noCalculator.coverage.complete, false);
  assert.ok(noCalculator.coverage.issues.includes('missing:ob3:calculator'), noCalculator.coverage.issues.join(','));
  const noProse = prepareAnswerCoverage('Explain how compound interest works.', [section('calculator', 'Calculation', 'Show the formula.', ['ob3'])], obligations);
  assert.ok(noProse.coverage.issues.includes('missing:ob1:prose'), 'without a prose section nothing carries the prose obligations');
});

test('a worked numeric scenario gets key figures and an adjustable calculator, even when the planner chose prose only', () => {
  const prompt = 'Explain the risk and reward of a trade with entry at $100, stop loss at $95 and target at $112. What position size risks 1% of a $10,000 account?';
  const out = prepareAnswerCoverage(prompt, [], [{ id: 'ob1', description: 'Explain the risk and reward', origin: 'requested', formats: ['prose'] }]);
  assert.deepEqual(out.plan.map(item => item.kind), ['prose', 'table', 'calculator']);
  assert.deepEqual(out.plan.map(item => item.heading), ['Short answer', 'Key figures', 'Adjust the numbers']);
  assert.equal(out.coverage.complete, true, out.coverage.issues.join(','));
});

test('the scenario rule stays out of the way of simple, brief or declined requests', () => {
  assert.equal(quantitativeScenarioSupport('What is the capital of Australia?').length, 0);
  assert.equal(quantitativeScenarioSupport('If I invest $5,000 for 10 years, how much? Short answer please.').length, 0);
  assert.equal(quantitativeScenarioSupport('What does a 2:1 ratio mean in trading?').length, 0);
  const noCalculator = quantitativeScenarioSupport('Entry $100, stop $95, target $112 and a 1% risk on $10,000: what position size? No calculator please.');
  assert.deepEqual(noCalculator.map(item => item.id), ['support-key-figures']);
  const both = quantitativeScenarioSupport('A loan of $20,000 at 6% for 5 years: what is the monthly payment?');
  assert.deepEqual(both.map(item => item.id), ['support-key-figures', 'support-scenario-calculator']);
});

test('a table or calculator the planner already planned is never added a second time', () => {
  const prompt = 'Explain the risk and reward of a trade with entry at $100, stop loss at $95 and target at $112. What position size risks 1% of a $10,000 account?';
  const planned = [section('prose', 'Short answer', 'Answer.', ['ob1']), section('table', 'Trade math', 'Figures.', ['ob2']), section('calculator', 'Position size', 'Formula.', ['ob3'])];
  const obligations: AnswerObligations = [
    { id: 'ob1', description: 'explain', origin: 'requested', formats: ['prose'] },
    { id: 'ob2', description: 'figures', origin: 'necessary-support', formats: ['table'] },
    { id: 'ob3', description: 'position size', origin: 'requested', formats: ['calculator'] },
  ];
  const out = prepareAnswerCoverage(prompt, planned, obligations);
  assert.deepEqual(out.plan.map(item => item.kind), ['prose', 'table', 'calculator']);
  assert.equal(out.coverage.complete, true, out.coverage.issues.join(','));
  const tableOnly = prepareAnswerCoverage(prompt, [planned[0], planned[1]], obligations.slice(0, 2));
  assert.deepEqual(tableOnly.plan.map(item => item.kind), ['prose', 'table', 'calculator'], 'a missing calculator is still added');
});
