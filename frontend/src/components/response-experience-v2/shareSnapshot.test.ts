import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceAiResponse } from '@/lib/xrogaResponseDocument';
import { richShareSnapshot, readRichShareSnapshot, RICH_SHARE_PREFIX } from './shareSnapshot';
import { responseTextV2 } from './exportText';

test('the received graph, calculator, citations and exact source survive a JSON save/reopen/share round trip', () => {
  const source = ['Explain the supplied scenario.', '```xroga-ui', JSON.stringify({type:'graph',nodes:[{id:'a',label:'Client'},{id:'b',label:'Server'}],edges:[{source:'a',target:'b',label:'Authorized request'}]}), '```', 'Calculation:', '```xroga-ui', JSON.stringify({type:'calculator',operation:'product',inputs:[{id:'price',label:'Price',value:25,unit:'USD'},{id:'people',label:'People',value:40}],resultLabel:'Revenue',resultUnit:'USD',precision:2}), '```', 'Conclusion.'].join('\n');
  const enhanced = enhanceAiResponse(source, 'share-roundtrip');
  const input = {id:'share-roundtrip',content:enhanced.content,featureOutput:enhanced.output,webSources:[{title:'Supplied source',url:'https://example.com/page',snippet:'User supplied, not retrieved by this test'}]};
  const text = responseTextV2(input)!;
  const snapshot = richShareSnapshot(input, text)!;
  const reopened = readRichShareSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(reopened.text, text);
  assert.equal(reopened.document?.originalText, source);
  assert.deepEqual(reopened.document?.nodes.map(n=>n.kind), ['prose','graph','prose','calculator','prose']);
  assert.equal(reopened.document?.sources[0].url, input.webSources[0].url);
  assert.match(reopened.text,/1000\.00 USD/);
  assert.equal(reopened.text.match(/Conclusion\./g)?.length,1);
  assert.ok(reopened.text.indexOf('Conclusion.') < reopened.text.indexOf('https://example.com/page'));
});

test('invalid shared edges or calculations retain the full fallback text without running a renderer', () => {
  for (const node of [
    {id:'g',kind:'graph',nodes:[{id:'a',label:'A'}],edges:[{source:'a',target:'missing'}]},
    {id:'c',kind:'calculator',operation:'product',inputs:[{id:'x',label:'X',value:1,min:3}],resultLabel:'Result',precision:2},
  ]) {
    const result = readRichShareSnapshot(RICH_SHARE_PREFIX+JSON.stringify({version:2,text:'Entire original answer.',document:{version:2,id:'m',originalText:'Entire original answer.',streaming:false,nodes:[node],sources:[]}}));
    assert.equal(result.text,'Entire original answer.');
    assert.equal(result.document,undefined);
  }
});

test('legacy, malformed, oversized and in-progress shares fail safely without truncating content', () => {
  assert.deepEqual(readRichShareSnapshot('Legacy text.'),{text:'Legacy text.'});
  assert.deepEqual(readRichShareSnapshot(RICH_SHARE_PREFIX+'{'),{text:RICH_SHARE_PREFIX+'{'});
  assert.equal(richShareSnapshot({id:'m',content:'x'.repeat(100_000)},'x'.repeat(100_000)),undefined);
  const snapshot = RICH_SHARE_PREFIX+JSON.stringify({version:2,text:'Still receiving.',document:{version:2,id:'m',originalText:'Still receiving.',streaming:true,nodes:[],sources:[]}});
  assert.equal(readRichShareSnapshot(snapshot).document,undefined);
});
