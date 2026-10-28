import { getSupabasePublicConfig } from './config';

export async function requireGitHubProvider(): Promise<void> {
  const config = getSupabasePublicConfig();
  const response = await fetch(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.publishableKey },
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok||response.redirected||response.type==='opaqueredirect') {
    await response.body?.cancel().catch(()=>undefined);
    throw new Error('Authentication provider status unavailable');
  }
  const reader=response.body?.getReader(),decoder=new TextDecoder();let bytes=0,text='';
  let settings:{external?:{github?:boolean}};
  try{
    if(reader)for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>65536)throw Error('Invalid settings receipt');text+=decoder.decode(next.value,{stream:true});}
    text+=decoder.decode();settings=JSON.parse(text);
  }catch{throw new Error('Authentication provider status unavailable');}
  finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
  if (settings?.external?.github !== true) {
    throw new Error('GitHub provider is not enabled');
  }
}
