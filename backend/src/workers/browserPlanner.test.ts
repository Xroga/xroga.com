import assert from 'node:assert/strict';
import { beforeEach, describe, it, type TestContext } from 'node:test';
import { browserModelFixture, ownedBrowserJob } from './browserModelFixture.test.js';
import { parseBrowserJob } from './browserJob.js';
import { BrowserPlannerError, planBrowserTask } from './browserPlanner.js';

const job=(ai=0)=>{const j=ownedBrowserJob();return{...j,limits:{...j.limits,maxModelCostMicros:ai}};};
let fixture:ReturnType<typeof browserModelFixture>;
beforeEach(t=>{fixture=browserModelFixture(t as TestContext);});
function deps(content:unknown,usage:unknown={prompt_tokens:500,completion_tokens:120}){
  fixture.reply=()=>({id:'synthetic-planner',choices:[{message:{content:typeof content==='string'?content:JSON.stringify(content)}}],usage});
  return{ledger:fixture.ledger,bodies:fixture.bodies,d:{modelId:'deepseek_v4_flash' as const}};
}
const opts=()=>({authority:fixture.authority});
const good = { steps: [{ op: 'click', selector: 'li.next > a' }, { op: 'screenshot', name: 'p2.png' }], expect: [{ kind: 'finalUrlPrefix', prefix: 'https://example.com/page/2' }, { kind: 'artifact', name: 'p2.png' }] };

describe('browser planner (untrusted model output, canonical ledger)', () => {
  it('returns a validated plan, settles measured usage, and sends only the user-given scope', async () => {
    const { d, ledger, bodies } = deps(good);
    const r = await planBrowserTask('go to page two', job(), d,opts());
    assert.equal(r.plan.steps.length, 2); assert.ok(r.costMicros > 0);
    assert.equal(ledger.reserved.length,1);assert.equal(ledger.settled.length,1);assert.equal(ledger.released.length,0);assert.equal(ledger.atomic,1);
    assert.deepEqual(JSON.parse(bodies[0].messages[1].content).allowedOrigins, ['https://example.com']);
  });
  it('a model cannot widen scope, grant itself a write, add AI steps, or skip verification', async () => {
    await assert.rejects(planBrowserTask('x', job(), deps({ ...good, steps: [{ op: 'goto', url: 'https://evil.example/' }] }).d,opts()), (e) => e instanceof BrowserPlannerError && e.code === 'PLAN_INVALID');
    const granted = deps({ ...good, writeGrant: { grantId: 'grant-0001', actions: ['submit'] }, steps: [{ op: 'click', selector: 'form button', consequential: true }] });
    await assert.rejects(planBrowserTask('x', job(), granted.d,opts()), (e) => e instanceof BrowserPlannerError && /write grant/.test(e.message));
    await assert.rejects(planBrowserTask('x', job(100_000), deps({ ...good, steps: [{ op: 'aiAct', instruction: 'click' }] }).d,opts()), /AI steps were not allowed/);
    await assert.rejects(planBrowserTask('x', job(), deps({ steps: good.steps, expect: [] }).d,opts()), /verified/);
    await assert.rejects(planBrowserTask('x', job(), deps('not json').d,opts()), (e) => e instanceof BrowserPlannerError && e.code === 'PLAN_INVALID');
  });
  it('releases the reservation when the provider fails or reports no usage', async () => {
    const failing = deps(good); fixture.reply=()=>Response.json({error:{message:'synthetic unavailable'}},{status:503});
    await assert.rejects(planBrowserTask('x', job(), failing.d,opts()), (e:any) => e.status===503);
    assert.equal(failing.ledger.released.length, 1);
    const unmeasured = deps(good, null);
    await assert.rejects(planBrowserTask('x', job(), unmeasured.d,opts()), (e:any) => e.code==='POST_COMPLETION_ACCOUNTING_UNCERTAIN');
    assert.equal(unmeasured.ledger.released.length, 2); assert.equal(unmeasured.ledger.settled.length, 0);
  });
});
