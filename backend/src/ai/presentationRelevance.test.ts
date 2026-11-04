import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPresentationRelevance } from './presentationRelevance.js';
import { prepareAnswerCoverage } from './answerCoverage.js';
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

test('the coverage gate reports drift as incomplete instead of silently accepting it', () => {
  const plan = [section('graph', 'Microservices map', 'API gateway, microservices and kubernetes for ticket booking.', ['s'])];
  const out = prepareAnswerCoverage(FLIGHT, plan, [need('s', 'support')]);
  assert.equal(out.coverage.complete, false);
  assert.ok(out.coverage.issues.some(issue => issue.startsWith('off-topic:software-architecture')), out.coverage.issues.join(','));
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
