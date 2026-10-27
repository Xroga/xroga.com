interface RuntimeProcessProbe {
  probeProcess(sessionId:string,processId:string):Promise<boolean|null>;
  exec(sessionId:string,input:{command:string;args:string[];networkPolicy:'none';timeoutMs:number}):Promise<{exitCode:number|null}>;
}
export async function projectRuntimeProcessRunning(runtime:RuntimeProcessProbe,sessionId:string,
  process:{processId:string;pid:number}):Promise<boolean> {
  // A native provider probes the actual process endpoint. A denial or a
  // negative result never authorizes execution in another container.
  const native=await runtime.probeProcess(sessionId,process.processId);
  if(native!==null)return native;
  const result=await runtime.exec(sessionId,{command:'kill',args:['-0',String(process.pid)],networkPolicy:'none',timeoutMs:5000});
  return result.exitCode===0;
}
