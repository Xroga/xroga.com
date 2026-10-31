import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {createProxyRelay,startProxyIngress} from './proxyChannel.mjs';
import {startEgressProxy} from '../../backend/src/workers/egressProxy.ts';

test('real process channel preserves canonical proxy auth, scope and private-DNS denial',async t=>{
  let dialed=0,ingress;
  const proxy=await startEgressProxy({job:{allowedOrigins:['https://example.com'],limits:{maxDurationMs:10000,maxNavigations:10,maxResponseBytes:65536}},
    resolve:async()=>[{address:'169.254.169.254',family:4}],dial:()=>{dialed++;throw new Error('must never dial');}});
  const relay=createProxyRelay({proxyPort:proxy.port,maxBytes:65536,send:async m=>ingress.receive(m)});
  ingress=await startProxyIngress({port:0,maxBytes:65536,send:async m=>relay.receive(m)});
  t.after(async()=>{relay.close();await ingress.close();await proxy.close();});
  const auth=Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
  async function request(text){
    return new Promise((resolve,reject)=>{
      const socket=net.connect(ingress.port,'127.0.0.1',()=>socket.write(text));let output='';
      socket.setTimeout(3000,()=>{socket.destroy();reject(new Error('local proxy timeout'));});
      socket.on('error',reject);socket.on('data',b=>{output+=b.toString();if(output.includes('\r\n')){socket.destroy();resolve(output.split('\r\n')[0]);}});
    });
  }
  assert.match(await request('CONNECT example.com:443 HTTP/1.1\r\n\r\n'),/407/);
  assert.match(await request(`CONNECT example.com:443 HTTP/1.1\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`),/403/);
  assert.match(await request(`CONNECT 169.254.169.254:80 HTTP/1.1\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`),/403/);
  assert.match(await request(`GET http://169.254.169.254/ HTTP/1.1\r\nHost: 169.254.169.254\r\n\r\n`),/405/);
  assert.equal(dialed,0,'no denied request opened an upstream socket');
  assert.ok(proxy.decisions.some(d=>d.reason==='DNS'&&!d.allowed));
});
