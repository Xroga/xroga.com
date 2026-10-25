import assert from 'node:assert/strict';
import test from 'node:test';
import {playwrightVersionFromImage,buildSandboxCommand} from './inSandboxBrowser.js';

const image='mcr.microsoft.com/playwright@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07';
test('the retained immutable browser image selects its independently verified matching driver',()=>{
  assert.equal(playwrightVersionFromImage(image),'1.62.0');
  assert.equal(playwrightVersionFromImage(image.replace('baed','aaaa')),null);
  const command=buildSandboxCommand({startScript:null,staticRoot:'.',entryPath:'/',domExpectations:[],interactions:[],
    totalTimeoutMs:60000,serverTimeoutMs:20000,install:false,playwrightVersion:playwrightVersionFromImage(image)});
  assert.match(command.args[1]!,/playwright-core@1\.62\.0/);
  assert.match(command.args[1]!,/npm install --ignore-scripts/);
});
