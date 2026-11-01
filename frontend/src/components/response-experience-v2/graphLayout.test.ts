import test from 'node:test';
import assert from 'node:assert/strict';
import { isLinearFlowV2, graphLayersV2, graphPositionsV2, graphCanvasV2 } from './graphLayout';
import type { ResponseNodeV2 } from './document';

test('readable diagram bounds contain every node and preserve branch topology on narrow screens', () => {
  const graph: Extract<ResponseNodeV2,{kind:'graph'}> = {id:'g',kind:'graph',nodes:['client','app','auth','billing','data'].map(id=>({id,label:id,detail:'Original detail '.repeat(8)})),edges:[{source:'client',target:'app'},{source:'app',target:'auth'},{source:'app',target:'billing'},{source:'auth',target:'data'}]};
  const before = JSON.stringify(graph);
  const layout = graphCanvasV2(graph);
  for (const p of layout.positions) {
    assert.ok(p.x >= 0 && p.y >= 0);
    assert.ok(p.x + layout.nodeWidth <= layout.width);
    assert.ok(p.y + layout.nodeHeight <= layout.height);
  }
  const auth = layout.positions.find(p=>p.id==='auth')!;
  const billing = layout.positions.find(p=>p.id==='billing')!;
  assert.equal(auth.y, billing.y);
  assert.ok(Math.abs(auth.x-billing.x) >= layout.nodeWidth);
  assert.equal(JSON.stringify(graph),before);
});

test('continuous diagrams require the supplied edges to prove the full sequence', () => {
  const graph: Extract<ResponseNodeV2, {kind:'graph'}> = { id:'g', kind:'graph', nodes:[{id:'a',label:'Input'},{id:'b',label:'Check'},{id:'c',label:'Result'}], edges:[{source:'b',target:'c'},{source:'a',target:'b'}] };
  assert.equal(isLinearFlowV2(graph), true);
  for (const edges of [[], [{source:'a',target:'b'}], [{source:'a',target:'b'},{source:'a',target:'c'}], [...graph.edges,{source:'c',target:'a'}]]) {
    assert.equal(isLinearFlowV2({...graph,edges}), false);
  }
  assert.equal(isLinearFlowV2({...graph,nodes:[graph.nodes[1],graph.nodes[0],graph.nodes[2]]}), false);
});

test('mobile canvas reflows branches vertically at readable scale and preserves every edge', () => {
  const graph: Extract<ResponseNodeV2,{kind:'graph'}> = {id:'mobile',kind:'graph',nodes:['a','b','c','d'].map(id=>({id,label:id})),edges:[{source:'a',target:'b'},{source:'a',target:'c'},{source:'c',target:'d'},{source:'d',target:'a'}]};
  const original = JSON.stringify(graph);
  const layout = graphCanvasV2(graph,true);
  assert.ok(layout.width <= 340);
  assert.equal(new Set(layout.positions.map(p=>p.x)).size,1);
  assert.equal(new Set(layout.positions.map(p=>p.y)).size,graph.nodes.length);
  assert.equal(layout.edgeLanes.length,graph.edges.length);
  for (const lane of layout.edgeLanes) if (lane !== null) assert.ok(lane < layout.positions[0].x);
  assert.equal(JSON.stringify(graph),original);
});

test('skip-level and cyclic connections have separate lanes outside every node', () => {
  const graph: Extract<ResponseNodeV2, {kind:'graph'}> = { id:'g', kind:'graph', nodes:['a','b','c'].map(id => ({id,label:id})), edges:[{source:'a',target:'b'},{source:'b',target:'c'},{source:'a',target:'c'}] };
  for (const candidate of [graph, {...graph, edges:[...graph.edges,{source:'c',target:'a'}]}]) {
    const original = JSON.stringify(candidate);
    const layout = graphCanvasV2(candidate);
    const lanes = layout.edgeLanes.filter((lane): lane is number => lane !== null);
    assert.ok(lanes.length > 0);
    assert.equal(new Set(lanes).size, lanes.length);
    for (const lane of lanes) assert.ok(lane + 86 < Math.min(...layout.positions.map(p => p.x)));
    assert.equal(layout.edgeLanes.length, candidate.edges.length);
    assert.equal(JSON.stringify(candidate), original);
  }
});

test('branch layout follows actual dependencies and refuses to invent an order for cycles', () => {
  const graph: Extract<ResponseNodeV2, {kind:'graph'}> = {id:'g',kind:'graph',nodes:['start','a','b','end'].map(id => ({id,label:id})),edges:[{source:'start',target:'a'},{source:'start',target:'b'},{source:'a',target:'end'},{source:'b',target:'end'}]};
  assert.deepEqual(graphLayersV2(graph), [['start'],['a','b'],['end']]);
  assert.equal(graphLayersV2({...graph,edges:[...graph.edges,{source:'end',target:'start'}]}), null);
  assert.deepEqual(graphLayersV2({...graph,edges:[]}), [['start','a','b','end']]);
});

test('cyclic SaaS graph receives distinct positions without losing nodes or changing edges', () => {
  const graph: Extract<ResponseNodeV2,{kind:'graph'}> = {id:'saas',kind:'graph',nodes:['client','next','supabase','stripe'].map(id=>({id,label:id})),edges:[{source:'client',target:'next'},{source:'next',target:'supabase'},{source:'next',target:'stripe'},{source:'stripe',target:'next',label:'Webhook'}]};
  const original = JSON.stringify(graph);
  const positions = graphPositionsV2(graph);
  assert.deepEqual(positions.map(p=>p.id),graph.nodes.map(n=>n.id));
  assert.equal(new Set(positions.map(p=>`${p.x},${p.y}`)).size,4);
  assert.equal(JSON.stringify(graph),original);
  const mobile = graphPositionsV2(graph, true, 280);
  assert.equal(new Set(mobile.map(p=>p.x)).size,1);
  assert.deepEqual(mobile.map(p=>p.y),[0,280,560,840]);
  assert.equal(JSON.stringify(graph),original);
});

test('the generated four-node five-edge architecture fits a desktop answer without sentence-sized routing gutters', () => {
  const graph: Extract<ResponseNodeV2,{kind:'graph'}> = {id:'actual-shape',kind:'graph',nodes:['Browser','Next.js','Supabase','Stripe'].map(id=>({id,label:id})),edges:[
    {source:'Browser',target:'Next.js',label:'Server Actions / Pages'},
    {source:'Browser',target:'Supabase',label:'RLS via user JWT'},
    {source:'Next.js',target:'Supabase',label:'Service Role'},
    {source:'Next.js',target:'Stripe',label:'Checkout / Portal'},
    {source:'Stripe',target:'Next.js',label:'Verified webhook events'},
  ]};
  const before=JSON.stringify(graph),layout=graphCanvasV2(graph);
  assert.ok(layout.width<=824,`Unexpected desktop width ${layout.width}`);
  assert.equal(layout.edgeLanes.length,5);
  assert.equal(JSON.stringify(graph),before);
});
