import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectEgress} from './audit-egress-callers.mjs';
test('AST audit sees executable transports, aliases, browser, MCP and process sinks, not generated strings',()=>{
  const rows=inspectEgress('backend/src/fixture.ts',`import {request as outbound} from 'node:https';
    const send=globalThis.fetch; async function run(url){await send(url);outbound(url);await page.goto(url);await mcp.callTool({name:'x'});spawn('curl',[url]);}
    const generated=\`await fetch(userUrl)\`;`);
  assert.deepEqual(rows.map(r=>r.transport),['fetch','transport:request','goto','callTool','subprocess-or-dynamic-execution']);
  assert.ok(rows.every(r=>r.disposition==='PENDING_SOURCE_TRACE'&&r.entryPoint==='run'));
});
test('a constant origin or central import never silently certifies caller ownership',()=>{
  const rows=inspectEgress('backend/src/fixture.ts',`await fetch('https://api.example/path?token=DO_NOT_INVENT_A_RECEIPT');await boundedPublicGet(url,limits);`);
  assert.equal(rows[0].destination,'https://api.example');assert.ok(!JSON.stringify(rows).includes('DO_NOT_INVENT'));
  assert.equal(rows[1].currentProtection,'CENTRAL_PUBLIC_GET_CANDIDATE_NOT_SEMANTIC_CERTIFICATION');
  assert.ok(rows.every(r=>r.disposition==='PENDING_SOURCE_TRACE'));
});

test('aliased process execution and pinned uploads remain obligations, response sends and regex exec are excluded',()=>{
  const rows=inspectEgress('backend/src/fixture.ts',`import {execFile as launch} from 'node:child_process';
    launch('curl'); await boundedPublicPost(url,body,type,check);
    res\n.status(200).send(body); const match = pattern.exec(value);`);
  assert.deepEqual(rows.map(r=>r.transport),['subprocess-or-dynamic-execution','boundedPublicPost']);
});
