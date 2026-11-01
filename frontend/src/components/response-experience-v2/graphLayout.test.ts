import test from 'node:test';
import assert from 'node:assert/strict';
import { isLinearFlowV2, graphLayersV2, graphPositionsV2 } from './graphLayout';
import type { ResponseNodeV2 } from './document';

test('continuous diagrams require the supplied edges to prove the full sequence', () => {
  const graph: Extract<ResponseNodeV2, {kind:'graph'}> = { id:'g', kind:'graph', nodes:[{id:'a',label:'Input'},{id:'b',label:'Check'},{id:'c',label:'Result'}], edges:[{source:'b',target:'c'},{source:'a',target:'b'}] };
  assert.equal(isLinearFlowV2(graph), true);
  for (const edges of [[], [{source:'a',target:'b'}], [{source:'a',target:'b'},{source:'a',target:'c'}], [...graph.edges,{source:'c',target:'a'}]]) {
    assert.equal(isLinearFlowV2({...graph,edges}), false);
  }
  assert.equal(isLinearFlowV2({...graph,nodes:[graph.nodes[1],graph.nodes[0],graph.nodes[2]]}), false);
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
