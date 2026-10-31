// A transport for the existing authenticated, DNS-pinned CONNECT proxy.
// Frames never choose a destination. The host opens only its fixed local proxy.
// The sandbox has no external network and exposes this ingress on loopback only.
import net from 'node:net';

const MAX_FRAME=32768;
function frame(m){
  if(!m||!['proxy-open','proxy-data','proxy-close'].includes(m.type)||!Number.isSafeInteger(m.id)||m.id<1)throw new Error('PROXY_CHANNEL_INVALID');
  if(Object.keys(m).some(key=>!['type','id',...(m.type==='proxy-data'?['data']:[])].includes(key)))throw new Error('PROXY_CHANNEL_INVALID');
  if(m.type==='proxy-data'){
    if(typeof m.data!=='string'||m.data.length>MAX_FRAME*4/3+4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.data))throw new Error('PROXY_CHANNEL_INVALID');
    return Buffer.from(m.data,'base64');
  }
  return undefined;
}

function channel({send,maxBytes,maxConnections=64,onFailure=()=>{}}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(maxConnections)||maxConnections<1||maxConnections>256)throw new Error('PROXY_CHANNEL_LIMIT');
  const sockets=new Map();let count=0,bytes=0,closed=false;
  const close=()=>{closed=true;for(const socket of sockets.values())socket.destroy();sockets.clear();};
  const fail=()=>{close();onFailure(new Error('PROXY_CHANNEL_FAILED'));};
  const transmit=async message=>{if(closed)return;try{await send(message);}catch{fail();}};
  const attach=(id,socket)=>{
    if(closed||sockets.has(id)||++count>maxConnections){socket.destroy();throw new Error('PROXY_CHANNEL_LIMIT');}
    sockets.set(id,socket);socket.setTimeout(30000,()=>socket.destroy());
    socket.on('error',()=>socket.destroy());
    socket.on('close',()=>{if(sockets.delete(id))void transmit({type:'proxy-close',id});});
    socket.on('data',async chunk=>{
      socket.pause();
      bytes+=chunk.length;
      if(bytes>maxBytes){fail();return;}
      for(let offset=0;offset<chunk.length&&!closed;offset+=MAX_FRAME)
        await transmit({type:'proxy-data',id,data:chunk.subarray(offset,offset+MAX_FRAME).toString('base64')});
      if(!closed)socket.resume();
    });
  };
  const receive=m=>{
    const data=frame(m);
    if(closed)throw new Error('PROXY_CHANNEL_CLOSED');
    const socket=sockets.get(m.id);
    // A close may cross the peer's own close in flight. It grants no authority.
    if(!socket){if(m.type==='proxy-close')return;throw new Error('PROXY_CHANNEL_UNKNOWN');}
    if(m.type==='proxy-close'){sockets.delete(m.id);socket.destroy();return;}
    if(m.type!=='proxy-data')throw new Error('PROXY_CHANNEL_INVALID');
    bytes+=data.length;
    if(bytes>maxBytes||socket.writableLength+data.length>2*1024*1024){fail();throw new Error('PROXY_CHANNEL_LIMIT');}
    socket.write(data);
  };
  return {attach,receive,close,transmit};
}

export function createProxyRelay({proxyPort,...options}){
  if(!Number.isSafeInteger(proxyPort)||proxyPort<1||proxyPort>65535)throw new Error('PROXY_CHANNEL_PORT');
  const peer=channel(options);
  const used=new Set();
  return {close:peer.close,receive:m=>{
    frame(m);
    if(m.type==='proxy-open'){
      if(used.has(m.id))throw new Error('PROXY_CHANNEL_REPLAY');
      used.add(m.id);
      peer.attach(m.id,net.connect({host:'127.0.0.1',port:proxyPort}));
    }else peer.receive(m);
  }};
}

export async function startProxyIngress({port,...options}){
  if(!Number.isSafeInteger(port)||port<0||port>65535)throw new Error('PROXY_CHANNEL_PORT');
  const peer=channel(options);let seq=0;
  const server=net.createServer(socket=>{
    const id=++seq;
    socket.pause();
    try{peer.attach(id,socket);}catch{socket.destroy();return;}
    void peer.transmit({type:'proxy-open',id}).then(()=>socket.resume());
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {port:server.address().port,receive:peer.receive,
    close:async()=>{peer.close();await new Promise(resolve=>server.close(resolve));}};
}
