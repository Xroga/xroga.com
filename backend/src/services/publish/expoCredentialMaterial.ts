import {createPrivateKey} from 'node:crypto';
import {containsCredentialSecretText} from '../../security/egress/dataClassification.js';

function object(raw:string):Record<string,unknown>|null{
 if(typeof raw!=='string'||Buffer.byteLength(raw)>48000)return null;
 try{const parsed=JSON.parse(raw);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}
}
function pem(value:unknown,kind:'google'|'apple'):string|null{
 if(typeof value!=='string'||!value.trim()||value.length>20000)return null;
 try{
  const key=createPrivateKey(value.includes('\\n')&&!value.includes('\n')?value.replace(/\\n/g,'\n'):value);
  if(kind==='google'?key.asymmetricKeyType!=='rsa':key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')return null;
  return key.export({type:'pkcs8',format:'pem'}).toString();
 }catch{return null;}
}
/** Parse protected source only for comparison or a denied export receipt.
 * Parsing never grants permission to transfer a private key. */
export function parseGooglePlayKey(raw:string):Readonly<Record<string,string>>|null{
 const parsed=object(raw),allowed=new Set(['type','project_id','private_key_id','private_key','client_email','client_id','auth_uri','token_uri','auth_provider_x509_cert_url','client_x509_cert_url','universe_domain']);
 if(!parsed||Object.keys(parsed).some(key=>!allowed.has(key))||Object.values(parsed).some(value=>typeof value!=='string'||!value||value.length>20000)
  ||parsed.type!=='service_account'||typeof parsed.project_id!=='string'||!/^[-a-z0-9:.]{1,128}$/.test(parsed.project_id)||typeof parsed.private_key_id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(parsed.private_key_id)||typeof parsed.client_id!=='string'||!/^\d{1,128}$/.test(parsed.client_id)
  ||typeof parsed.client_email!=='string'||!/^[A-Za-z0-9._+-]{1,128}@[A-Za-z0-9.-]{1,180}\.gserviceaccount\.com$/.test(parsed.client_email))return null;
 const key=pem(parsed.private_key,'google');if(!key)return null;
 const{private_key:_private,...publicFields}=parsed;if(containsCredentialSecretText(JSON.stringify(publicFields)))return null;
 if(!['https://accounts.google.com/o/oauth2/auth','https://accounts.google.com/o/oauth2/v2/auth'].includes(String(parsed.auth_uri))
  ||!['https://oauth2.googleapis.com/token','https://accounts.google.com/o/oauth2/token'].includes(String(parsed.token_uri))
  ||parsed.auth_provider_x509_cert_url!==undefined&&parsed.auth_provider_x509_cert_url!=='https://www.googleapis.com/oauth2/v1/certs'
  ||parsed.universe_domain!==undefined&&parsed.universe_domain!=='googleapis.com')return null;
 if(parsed.client_x509_cert_url!==undefined){try{
  const url=new URL(String(parsed.client_x509_cert_url));
  if(url.origin!=='https://www.googleapis.com'||url.username||url.password||url.search||url.hash||decodeURIComponent(url.pathname)!=='/robot/v1/metadata/x509/'+parsed.client_email)return null;
 }catch{return null;}}
 return Object.freeze({...parsed as Record<string,string>,private_key:key});
}
export interface AppleStoreKey {keyId:string;issuerId:string;keyP8:string;teamId?:string}
export function parseAppleStoreKey(raw:string):Readonly<AppleStoreKey>|null{
 const parsed=object(raw),aliases=[['keyId','key_id','keyIdentifier'],['issuerId','issuer_id','issuerIdentifier'],['keyP8','key_p8','privateKey','private_key'],['teamId','team_id','appleTeamId']];
 if(!parsed||Object.keys(parsed).some(key=>!aliases.flat().includes(key)))return null;
 const selected:string[]=[];
 for(const names of aliases){const values=names.filter(name=>parsed[name]!==undefined).map(name=>parsed[name]);if(values.some(v=>typeof v!=='string'||!v.trim()||v.length>20000)||new Set(values.map(v=>String(v).trim())).size>1)return null;selected.push(String(values[0]??'').trim());}
 const[keyId,issuerId,rawKey,teamId]=selected,keyP8=pem(rawKey,'apple');
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(keyId)||!/^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/.test(issuerId)||!keyP8||teamId&&!/^[A-Za-z0-9]{1,128}$/.test(teamId))return null;
 if(containsCredentialSecretText(JSON.stringify({keyId,issuerId,teamId})))return null;
 return Object.freeze({keyId,issuerId,keyP8,...(teamId?{teamId}:{})});
}
