// Test-process preload only. Never imported by application production source.
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(!['127.0.0.1','localhost'].includes(url.hostname))return Promise.reject(new Error('GOLDEN_EXTERNAL_FETCH_DENIED'));
  return original(input,options);
};
