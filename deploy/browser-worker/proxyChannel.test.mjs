import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {createProxyRelay,startProxyIngress} from './proxyChannel.mjs';

test('real local sockets relay bytes only to the configured proxy and close',async t=>{
  const server=net.createServer(socket=>socket.on('data',data=>socket.write(data)));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const failed=[];let ingress;
  const relay=createProxyRelay({proxyPort:server.address().port,maxBytes:4096,send:async m=>ingress.receive(m),onFailure:e=>failed.push(e)});
  ingress=await startProxyIngress({port:0,maxBytes:4096,send:async m=>relay.receive(m),onFailure:e=>failed.push(e)});
  t.after(async()=>{relay.close();await ingress.close();await new Promise(resolve=>server.close(resolve));});
  const client=net.connect(ingress.port,'127.0.0.1');t.after(()=>client.destroy());
  await once(client,'connect');client.write('CONNECT example.com:443 HTTP/1.1\r\n\r\n');
  const [response]=await once(client,'data');assert.equal(response.toString(),'CONNECT example.com:443 HTTP/1.1\r\n\r\n');
  client.destroy();assert.equal(failed.length,0);
});

test('malformed frames and caller-supplied destinations cannot choose a host',()=>{
  const relay=createProxyRelay({proxyPort:1,maxBytes:4096,send:async()=>{}});
  try{
    for(const message of [null,{type:'proxy-data',id:1,data:'not base64!'},{type:'proxy-data',id:1,data:'YQ=='},{type:'proxy-open',id:-1},{type:'proxy-open',id:1,host:'169.254.169.254',port:80}])assert.throws(()=>relay.receive(message));
  }finally{relay.close();}
});

test('duplicate connection IDs are rejected',()=>{
  const relay=createProxyRelay({proxyPort:1,maxBytes:4096,send:async()=>{}});
  try{relay.receive({type:'proxy-open',id:1});assert.throws(()=>relay.receive({type:'proxy-open',id:1}),/REPLAY/);}
  finally{relay.close();}
});
