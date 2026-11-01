import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ContainerBrowserWorker,type DockerResult} from './containerBrowserWorker.js';
const repoRoot=fileURLToPath(new URL('../../../',import.meta.url)),id=(n:string)=>n.repeat(64),label={'xroga.browser-job':'1'};
const c=(key:string,state:string,name=`/xroga-bj-browser-${key.repeat(16)}`)=>({Id:id(key),Name:name,Config:{Labels:label},State:{Running:state==='running',Paused:false,Restarting:false,Status:state},HostConfig:{RestartPolicy:{Name:'no'}}});
const n=(key:string,active=false)=>({Id:id(key),Name:`xroga-bj-${key.repeat(16)}`,Labels:label,Internal:true,Containers:active?{active:{}}:{}});
function fixture(rows:Record<string,unknown>,containers:string[],networks:string[],race=false){const commands:string[][]=[];return{commands,worker:new ContainerBrowserWorker({repoRoot,browserImage:'synthetic@sha256:'+'a'.repeat(64),proxyImage:'synthetic-proxy',reapDocker:(args):DockerResult=>{commands.push(args);if(args[0]==='ps')return{status:0,stdout:containers.join('\n'),stderr:''};if(args[0]==='network'&&args[1]==='ls')return{status:0,stdout:networks.join('\n'),stderr:''};if(args.includes('inspect'))return{status:0,stdout:JSON.stringify([rows[args.at(-1)!]]),stderr:''};return{status:race?1:0,stdout:'',stderr:''};}})};}
test('orphan cleanup never force-removes another live job and checks stopped ownership',()=>{
 const f=fixture({[id('1')]:c('1','running'),[id('2')]:c('2','exited'),[id('3')]:c('3','exited','/important'),[id('4')]:n('4',true),[id('5')]:n('5')},[id('1'),id('2'),id('3')],[id('4'),id('5')]);
 assert.deepEqual(f.worker.reapOrphans(),{containers:1,networks:1});const mutations=f.commands.filter(a=>a[0]==='rm'||a[0]==='network'&&a[1]==='rm');assert.deepEqual(mutations,[['rm',id('2')],['network','rm',id('5')]]);assert.ok(f.commands.every(a=>!a.includes('-f')&&!a.includes('--force')&&!a.includes('-v')&&!a.includes('--volumes')));
});
test('restart/attach race cannot be counted as a successful orphan deletion',()=>{
 const f=fixture({[id('2')]:c('2','exited'),[id('5')]:n('5')},[id('2')],[id('5')],true);assert.deepEqual(f.worker.reapOrphans(),{containers:0,networks:0});assert.ok(f.commands.every(a=>!a.includes('-f')));
});
test('untrusted identifiers, missing labels and malformed inspection cannot become cleanup commands',()=>{
 const row=c('2','exited');row.Config.Labels={'xroga.browser-job':'0'};const f=fixture({[id('2')]:row},['--all','../../important',id('2')],['--all']);assert.deepEqual(f.worker.reapOrphans(),{containers:0,networks:0});assert.equal(f.commands.filter(a=>a[0]==='rm'||a[0]==='network'&&a[1]==='rm').length,0);
});
