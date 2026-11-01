import type{TenantContext}from'../../security/tenantContext.js';
import{captureExpoAccess,verifyExpoProject,validExpoId,type ExpoAccess,type ExpoQuery}from'./expoAccess.js';
import{parseGooglePlayKey,parseAppleStoreKey}from'./expoCredentialMaterial.js';
import{EgressDenied,enforceEgress}from'../../security/egress/egressPolicy.js';
import{preparedActionDigest}from'../../security/authority/digest.js';
import{persistSecurityDecision}from'../../security/egress/securityDecision.js';
import{AuthorityError}from'../../security/authority/enforce.js';

export interface ExpoStoreInput{userId:string;tenantContext?:TenantContext;signal?:AbortSignal;projectId?:string;identifier?:string}
export interface ExpoStoreResult{ok:boolean;message:string;error?:string;keyId?:string;manualSetupRequired?:boolean;setupUrl?:string}
interface StoreRecord{id:string;app?:{id?:unknown};applicationIdentifier?:string;appleAppIdentifier?:{id?:string;bundleIdentifier?:string};googleServiceAccountKeyForSubmissions?:{id?:string;privateKeyIdentifier?:string;clientEmail?:string};appStoreConnectApiKeyForSubmissions?:{id?:string;keyIdentifier?:string;issuerIdentifier?:string}}
interface StoreApp{id:string;name:string;slug:string;ownerAccount:{id:string;name:string};androidAppCredentialsList?:StoreRecord[];iosAppCredentialsList?:StoreRecord[]}
async function denyMaterial(access:ExpoAccess,projectId:string,account:string,payload:unknown){
 const body={appId:projectId,account,material:payload},targetDigest=preparedActionDigest(body);
 try{
  await enforceEgress({context:access.context,actionClass:'CREDENTIAL_OR_PERMISSION_CHANGE',destination:'https://api.expo.dev/graphql',recipient:account,purpose:'store-private-key-transfer-denied',payload:body,declaredClass:'CREDENTIAL_SECRET',toolTrust:'SERVER_REGISTERED',binding:{userId:access.context.userId,provider:'expo',connectedAccountId:account,operation:'STORE_PRIVATE_KEY_TRANSFER',targetDigest,planDigest:targetDigest}},receipt=>persistSecurityDecision(access.context,receipt));
 }catch(error){if(error instanceof EgressDenied&&error.reason==='SECRET_EGRESS_DENIED'){await access.check();return;}throw error;}
 throw new AuthorityError('EXPO_RAW_STORE_KEY_TRANSFER_NOT_DENIED');
}
/** Frozen Command010 does not permit raw private-key file egress. Configure
 * keys in Expo itself, then verify its exact owned application metadata. */
export async function verifyExpoStoreReadiness(input:ExpoStoreInput,platform:'android'|'ios',queryFor:(access:ExpoAccess)=>ExpoQuery):Promise<ExpoStoreResult>{
 input={...input};const access=await captureExpoAccess(input.userId,input.tenantContext,input.signal);
 const manual=(error:string):ExpoStoreResult=>({ok:false,error,manualSetupRequired:true,setupUrl:'https://expo.dev',message:'Configure the store key directly in the selected Expo project, then verify again. Xroga will not upload your saved private key.'});
 try{
  const projectId=input.projectId?.trim()||await access.pin('expo_project_id');
  if(!projectId)return{ok:false,error:'NO_PROJECT',message:'Link an EAS project first.'};
  if(!validExpoId(projectId)||input.identifier!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,254}$/.test(input.identifier))throw new AuthorityError('EXPO_PROJECT_ADMISSION_DENIED');
  const raw=await access.pin(platform==='android'?'google_play':'apple_asc_api'),material=raw?(platform==='android'?parseGooglePlayKey(raw):parseAppleStoreKey(raw)):null;
  if(raw&&!material){await denyMaterial(access,projectId,'expo:unresolved',raw);return manual('BAD_STORE_KEY');}
  const fields=platform==='android'?'androidAppCredentialsList: androidAppCredentials { id app { id } applicationIdentifier googleServiceAccountKeyForSubmissions { id privateKeyIdentifier clientEmail } }':'iosAppCredentialsList: iosAppCredentials { id app { id } appleAppIdentifier { id bundleIdentifier } appStoreConnectApiKeyForSubmissions { id keyIdentifier issuerIdentifier } }';
  const query=queryFor(access),result=await query<{app?:{byId?:StoreApp}}>(`query XrogaStoreReadiness($appId: String!) { app { byId(appId: $appId) { id name slug ownerAccount { id name } ${fields} } } }`,{appId:projectId});
  const app=result.app?.byId;if(!app)throw new AuthorityError('EXPO_PROJECT_ADMISSION_DENIED');
  const project=await verifyExpoProject(access,query,projectId,app),rows=platform==='android'?app.androidAppCredentialsList:app.iosAppCredentialsList;
  const identifier=(row:StoreRecord)=>platform==='android'?row.applicationIdentifier:row.appleAppIdentifier?.bundleIdentifier;
  if(!Array.isArray(rows)||rows.length>100||rows.some(row=>!row||!validExpoId(row.id)||row.app?.id!==projectId||typeof identifier(row)!=='string'||!identifier(row))||new Set(rows.map(row=>row.id)).size!==rows.length)throw new AuthorityError('EXPO_STORE_TARGET_DENIED');
  const matches=input.identifier?rows.filter(row=>identifier(row)===input.identifier):rows;
  if(matches.length>1)throw new AuthorityError('EXPO_EXACT_APPLICATION_IDENTIFIER_REQUIRED');
  const selected=matches[0],key=platform==='android'?selected?.googleServiceAccountKeyForSubmissions:selected?.appStoreConnectApiKeyForSubmissions;
  let configured=Boolean(key&&validExpoId(key.id));
  if(platform==='android'&&configured){const row=key as StoreRecord['googleServiceAccountKeyForSubmissions'];configured=typeof row?.privateKeyIdentifier==='string'&&validExpoId(row.privateKeyIdentifier)&&typeof row.clientEmail==='string'&&/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/.test(row.clientEmail);if(material)configured=configured&&row!.privateKeyIdentifier===(material as Record<string,string>).private_key_id&&row!.clientEmail===(material as Record<string,string>).client_email;}
  if(platform==='ios'&&configured){const row=key as StoreRecord['appStoreConnectApiKeyForSubmissions'];configured=typeof row?.keyIdentifier==='string'&&validExpoId(row.keyIdentifier)&&typeof row.issuerIdentifier==='string'&&/^[a-f0-9-]{36}$/i.test(row.issuerIdentifier);if(material)configured=configured&&row!.keyIdentifier===(material as{keyId:string}).keyId&&row!.issuerIdentifier===(material as{issuerId:string}).issuerId;}
  await access.check();
  if(configured)return{ok:true,keyId:key!.id,message:`Expo already has the store key configured for ${project.accountName}/${project.slug} (${identifier(selected!)}). No private key was transferred.`};
  if(raw)await denyMaterial(access,projectId,'expo:'+project.accountId,material);
  return manual('EXPO_STORE_CONFIGURATION_REQUIRED');
 }finally{access.close();}
}
