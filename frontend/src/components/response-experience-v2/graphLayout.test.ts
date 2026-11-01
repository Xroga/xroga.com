import test from 'node:test';
import assert from 'node:assert/strict';
import { isLinearFlowV2, graphLayersV2 } from './graphLayout';
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
