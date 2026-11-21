import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Chart,staticChartTable} from './chart';
import {nativeMarkdownMatches,NativeVisualContent} from './markdown';

test('financial chart data is readable without changing exact underlying values or matching keys',()=>{
  const props={type:'line' as const,data:[{year:10,balance:18193.9673403229}],x:'year',series:['balance'],format:'currency' as const,currency:'USD'};
  const html=renderToStaticMarkup(createElement(Chart.component,{props,renderNode:()=>null}));
  assert.match(html,/\$18,193\.97/);
  assert.doesNotMatch(html,/18193\.9673403229/);
  assert.deepEqual(staticChartTable(props)?.rows,[['10','18193.9673403229']]);
  assert.equal(props.data[0].balance,18193.9673403229);
  const raw=renderToStaticMarkup(createElement(Chart.component,{props:{...props,format:'number'},renderNode:()=>null}));
  assert.match(raw,/18193\.9673403229/);
});

test('a chart retains units and data while a matching visible section supplies its title',()=>{
  const props={type:'line' as const,data:[{year:1,balance:10600}],x:'year',series:['balance'],presentation:{title:'Balance by year',yLabel:'Balance (USD)',note:'Annual compounding.'}};
  const chart=createElement(Chart.component,{props,renderNode:()=>null});
  const matches=nativeMarkdownMatches({type:'element',typeName:'Section',props:{title:'Balance by year',children:[]}});
  const html=renderToStaticMarkup(createElement(NativeVisualContent.Provider,{value:matches},createElement('section',null,createElement('h2',null,'Balance by year'),chart)));
  assert.equal(html.split('Balance by year').length-1,1);
  assert.match(html,/Balance \(USD\)/);
  assert.match(html,/Annual compounding\./);
  assert.match(html,/10600/);
  assert.match(renderToStaticMarkup(chart),/<strong>Balance by year<\/strong>/);
  const different=nativeMarkdownMatches({type:'element',typeName:'Section',props:{title:'Deposits by year',children:[]}});
  assert.match(renderToStaticMarkup(createElement(NativeVisualContent.Provider,{value:different},chart)),/<strong>Balance by year<\/strong>/);
});
