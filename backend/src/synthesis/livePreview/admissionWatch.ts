/** Connection lifetime guard, not a scheduler. Never retry or reconnect after
 * a denied/failed authority read. The client must obtain fresh admission. */
export function watchPreviewAdmission(check:()=>Promise<boolean>,deny:()=>void,expiresAt:number,
  options:{intervalMs?:number;checkTimeoutMs?:number}={}):()=>void {
  let stopped=false;let checking=false;
  let checkTimer:ReturnType<typeof setTimeout>|undefined;
  const stop=()=>{stopped=true;clearInterval(interval);clearTimeout(expiry);if(checkTimer)clearTimeout(checkTimer);};
  const refuse=()=>{if(stopped)return;stop();deny();};
  const interval=setInterval(()=>{
    if(stopped||checking)return;checking=true;
    checkTimer=setTimeout(refuse,options.checkTimeoutMs??5000);
    void Promise.resolve().then(check).then(allowed=>{if(!allowed)refuse();},refuse).finally(()=>{
      if(checkTimer)clearTimeout(checkTimer);checking=false;
    });
  },options.intervalMs??5000);
  const expiry=setTimeout(refuse,Math.max(0,Math.min(2147483647,expiresAt-Date.now())));
  interval.unref();expiry.unref();
  return stop;
}
