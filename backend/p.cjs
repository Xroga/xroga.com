const fs=require('fs');const f='src/operations/operationsEngine.ts';let s=fs.readFileSync(f,'utf8');const crlf=s.includes('\r\n');if(crlf)s=s.replace(/\r\n/g,'\n');
const a="const SENSITIVE = [\n  /(?:postgres(?:ql)?|mysql|redis):\/\/[^\s\"']+/gi,";
if(!s.includes(a))throw new Error('anchor');
const add="const SENSITIVE = [\n  // Whole credential shapes first, so the generic key=value rule below cannot stop at the first space or semicolon and leave the secret behind.\n  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,\n  /(?:proxy-)?authorization\s*[:=]\s*(?:(?:basic|bearer|digest|token)\s+)?[^\s,;\"']+/gi,\n  /(?:set-)?cookie\s*[:=][^\r\n]+/gi,\n  /\beyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]+/g,\n  /\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g,\n  /\bAIza[0-9A-Za-z_-]{20,}/g,\n  /\b[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*=\s*[^\s,;\"']+/g,\n  /(?:postgres(?:ql)?|mysql|redis):\/\/[^\s\"']+/gi,";
s=s.replace(a,()=>add);
if(crlf)s=s.replace(/\n/g,'\r\n');fs.writeFileSync(f,s);
