import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { redactLocalLog } from './disposable-supabase.mjs';
if(process.env.CI!=='true'||process.env.XB01_DISPOSABLE_SUPABASE!=='1')throw new Error('Local security CI only');
const root=resolve(import.meta.dirname,'../..'),out=join(root,'artifacts/batch-01-local-security');mkdirSync(out,{recursive:true});
const secrets=Object.entries(process.env).filter(([key,value])=>/(?:KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL)/i.test(key)&&value&&value.length>5).map(([,value])=>value);
for(const name of ['backend.log','frontend.log']) if(existsSync(join(root,name))) {
  const log=redactLocalLog(readFileSync(join(root,name),'utf8'),secrets).replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').slice(-16000);
  writeFileSync(join(out,`${name}.redacted`),log,{mode:0o600});console.log(`--- ${name} (redacted, bounded) ---\n${log}`);
}
