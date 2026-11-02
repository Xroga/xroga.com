import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedDiagramV2 } from './diagramSyntax';

test('new live SaaS flow and sequence preserve every authored connection without executing Mermaid', () => {
  const flow = `graph TD
User --> Next.js["Next.js (App Router)"]
Next.js --> Supabase["Supabase Auth"]
Supabase --> DB["PostgreSQL + RLS"]
Next.js --> Stripe["Stripe Checkout / Webhooks"]
Stripe --> Next.js
DB --> Next.js`;
  const graph = supportedDiagramV2(flow)!;
  assert.equal(graph.nodes.length, 5); assert.equal(graph.edges.length, 6);
  assert.equal(graph.nodes.find(n => n.id === 'DB')?.label, 'PostgreSQL + RLS');
  assert.deepEqual(graph.edges[4], { source: 'Stripe', target: 'Next.js' });
  const sequence = supportedDiagramV2(`sequenceDiagram
User->>Next.js: Select plan
Next.js->>Stripe: Create Checkout Session
Stripe-->>User: Redirect to Stripe Checkout
User->>Stripe: Complete payment
Stripe->>Next.js: POST /api/webhook (checkout.session.completed)
Next.js->>Supabase: Update tenant.subscription_status
Next.js-->>User: Redirect to dashboard`)!;
  assert.equal(sequence.edges.length, 7);
  assert.deepEqual(sequence.nodes.map(n=>n.id), ['User','Next.js','Stripe','Supabase']);
  assert.deepEqual(sequence.edges[2], {source:'Stripe', target:'User',label:'Redirect to Stripe Checkout'});
  assert.deepEqual(sequence.edges[6], {source:'Next.js', target:'User',label:'Redirect to dashboard'});
  assert.equal(sequence.edges[4].label, 'POST /api/webhook (checkout.session.completed)');
  assert.equal(sequence.edges[5].target, 'Supabase');
});

test('diagram adapter is general, bounded and fails visibly back to original source on unsupported syntax', () => {
  const graph = supportedDiagramV2('flowchart LR; A["Input; not a statement"] -->|validate| B --> C[Result]')!;
  assert.equal(graph.edges.length, 2); assert.equal(graph.nodes[0].label, 'Input; not a statement');
  assert.deepEqual(supportedDiagramV2('graph TD\nInput-node-->Output.node')?.edges, [{ source: 'Input-node', target: 'Output.node' }]);
  assert.equal(supportedDiagramV2('sequenceDiagram\nparticipant A as Customer\nA->>B: Request')?.nodes[0].label, 'Customer');
  assert.equal(supportedDiagramV2('sequenceDiagram\nA->>B: Request\n' + Array.from({length:101},(_,i)=>`participant P${i}`).join('\n')), undefined);
  for (const source of ['graph TD\nA-->B\nclick A "https://evil.test"', 'graph TD\nA-->B\nstyle A fill:red', 'graph TD\nA[one]-->A[two]', 'graph TD\nA["unfinished]', 'pie\nA:1', 'graph TD\n' + 'x'.repeat(12_000)]) assert.equal(supportedDiagramV2(source), undefined);
  assert.equal(supportedDiagramV2('graph TD\nA["<script>alert(1)</script>"]-->B')?.nodes[0].label, '<script>alert(1)</script>');
});
