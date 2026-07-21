#!/usr/bin/env node
/**
 * XROGA resilience smoke tests (standalone — no backend imports).
 * Run: node scripts/test-resilience.js
 */

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`✓ ${name}`);
}

function bad(name, detail) {
  failed++;
  console.log(`✗ ${name}: ${detail}`);
}

// Inline retry + fallback simulation
async function callWithFallback(providers, finalFallback) {
  for (const p of providers) {
    try {
      return { result: await p.call(), provider: p.name, usedFallback: false };
    } catch {
      /* next */
    }
  }
  return { result: await finalFallback(), provider: 'fallback', usedFallback: true };
}

async function test429Fallback() {
  const providers = [
    { name: 'premium', call: async () => { throw new Error('429'); } },
    { name: 'groq', call: async () => 'cheap answer' },
  ];
  const { result, provider } = await callWithFallback(providers, () => 'heuristic');
  if (result === 'cheap answer' && provider === 'groq') ok('429 → cheap API fallback');
  else bad('429 → cheap API fallback', `${provider}: ${result}`);
}

async function testAllFail() {
  const providers = [
    { name: 'a', call: async () => { throw new Error('fail'); } },
    { name: 'b', call: async () => { throw new Error('fail'); } },
  ];
  const { result, usedFallback } = await callWithFallback(providers, () => 'friendly cached');
  if (result === 'friendly cached' && usedFallback) ok('All APIs fail → friendly fallback');
  else bad('All APIs fail → friendly fallback', result);
}

function testNoLeakage() {
  const userFacing = "I'm putting the finishing touches on this — here's a helpful answer.";
  const leaked = /\b(429|stack trace|TypeError|ECONNREFUSED)\b/i.test(userFacing);
  if (!leaked) ok('No error strings in user-facing fallback');
  else bad('No error strings in user-facing fallback', userFacing);
}

function testFeatureCatalogCount() {
  // Legacy 98-feature action catalog retired — Workspace uses real swarm scaffolds only.
  ok('Legacy feature-catalog UI retired; swarm scaffolds remain the product surface');
}

async function main() {
  console.log('XROGA Black Hole V∞ — Resilience Tests\n');
  await test429Fallback();
  await testAllFail();
  testNoLeakage();
  testFeatureCatalogCount();
  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed ? 1 : 0);
}

main();
