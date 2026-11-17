import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Chart,staticChartTable} from './chart';

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
