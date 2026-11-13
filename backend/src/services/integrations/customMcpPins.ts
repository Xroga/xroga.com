// Owner-pinned custom MCP tools (RFC-CUSTOM-MCP-EXECUTION, stage 1).
//
// A custom MCP server is third-party code: its tool names, descriptions and schemas are text it controls. A tool of it may be offered
// to the browser agent only when the owner pinned that exact definition and the server still serves exactly that definition. A pin is
// never read from a request: it is looked up here by the verified tenant, and the live definition is compared at call time.
import {createHash} from 'node:crypto';
import {requireTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {canonicalAuthorityJson} from '../../security/authority/digest.js';

export type CustomPinDenial='CUSTOM_MCP_EXECUTION_OFF'|'CUSTOM_MCP_NOT_PINNED'|'CUSTOM_MCP_PIN_REVOKED'|'CUSTOM_MCP_DEFINITION_CHANGED'|'CUSTOM_MCP_RISK_NOT_ALLOWED'|'CUSTOM_MCP_CALL_LIMIT'|'CUSTOM_MCP_DEFINITION_UNAVAILABLE';

export interface CustomMcpPin{userId:string;toolkit:string;toolSlug:string;serverUrl:string;authMode:string;definitionDigest:string;riskClass:'read';maxCallsPerRun:number;revokedAt:string|null}
export interface CustomMcpDefinition{
  /** The server as registered: its address and how it is authenticated. */
  server:{appUrl:string;authSchemes:readonly string[];noAuth:boolean};
  /** The tool exactly as the server describes it. */
  tool:{slug:string;name?:string;description?:string;inputSchema?:unknown};
}
export interface CustomMcpPinStore{
  get(userId:string,toolkit:string,toolSlug:string):Promise<CustomMcpPin|undefined>;
  upsert(pin:Omit<CustomMcpPin,'revokedAt'>&{confirmationId?:string}):Promise<void>;
  revoke(userId:string,toolkit:string,toolSlug:string|undefined,reason:string):Promise<void>;
  listActive(userId:string):Promise<CustomMcpPin[]>;
}

/** The feature is off unless the operator turned it on for this deployment. Off keeps the original behaviour exactly. */
export function customMcpExecutionEnabled(env:NodeJS.ProcessEnv=process.env):boolean{return env.XROGA_CUSTOM_MCP_EXECUTION==='on';}

/** What "the same tool" means: the server's address and auth, and the tool's name, description and schema. Computed on the server only. */
export function customMcpDefinitionDigest(definition:CustomMcpDefinition):string{
  const value={
    server:{appUrl:definition.server.appUrl,authSchemes:[...definition.server.authSchemes].sort(),noAuth:definition.server.noAuth},
    tool:{slug:definition.tool.slug,name:definition.tool.name??null,description:definition.tool.description??null,inputSchema:definition.tool.inputSchema??null},
  };
  return createHash('sha256').update(canonicalAuthorityJson(JSON.parse(JSON.stringify(value)))).digest('hex');
}

const rowToPin=(row:Record<string,unknown>):CustomMcpPin=>({
  userId:String(row.user_id),toolkit:String(row.toolkit),toolSlug:String(row.tool_slug),serverUrl:String(row.server_url),authMode:String(row.auth_mode),
  definitionDigest:String(row.definition_digest),riskClass:'read',maxCallsPerRun:Number(row.max_calls_per_run),revokedAt:row.revoked_at?String(row.revoked_at):null,
});

export function supabaseCustomMcpPinStore(context:TenantContext):CustomMcpPinStore{
  context=requireTenantContext(context);
  const db=()=>getTenantSupabaseAdmin(context).from('custom_mcp_tool_pins');
  return{
    async get(userId,toolkit,toolSlug){
      if(userId!==context.userId)return undefined;
      const{data,error}=await db().select('*').eq('user_id',context.userId).eq('toolkit',toolkit).eq('tool_slug',toolSlug).maybeSingle();
      if(error)throw new Error('CUSTOM_MCP_PIN_STORE_UNAVAILABLE');
      return data?rowToPin(data as Record<string,unknown>):undefined;
    },
    async upsert(pin){
      if(pin.userId!==context.userId||pin.riskClass!=='read')throw new Error('CUSTOM_MCP_RISK_NOT_ALLOWED');
      const{error}=await db().upsert({user_id:context.userId,toolkit:pin.toolkit,tool_slug:pin.toolSlug,server_url:pin.serverUrl,auth_mode:pin.authMode,
        definition_digest:pin.definitionDigest,risk_class:'read',max_calls_per_run:pin.maxCallsPerRun,confirmation_id:pin.confirmationId??null,
        pinned_at:new Date().toISOString(),revoked_at:null,revoked_reason:null},{onConflict:'user_id,toolkit,tool_slug'});
      if(error)throw new Error('CUSTOM_MCP_PIN_STORE_UNAVAILABLE');
    },
    async revoke(userId,toolkit,toolSlug,reason){
      if(userId!==context.userId)return;
      let query=db().update({revoked_at:new Date().toISOString(),revoked_reason:reason.slice(0,120)}).eq('user_id',context.userId).eq('toolkit',toolkit).is('revoked_at',null);
      if(toolSlug)query=query.eq('tool_slug',toolSlug);
      const{error}=await query;
      if(error)throw new Error('CUSTOM_MCP_PIN_STORE_UNAVAILABLE');
    },
    async listActive(userId){
      if(userId!==context.userId)return[];
      const{data,error}=await db().select('*').eq('user_id',context.userId).is('revoked_at',null).limit(200);
      if(error)throw new Error('CUSTOM_MCP_PIN_STORE_UNAVAILABLE');
      return((data??[]) as Record<string,unknown>[]).map(rowToPin);
    },
  };
}

/**
 * Whether a call to this custom tool may be offered for the owner's per-call approval. Fails closed on every doubt: the feature off,
 * no pin, a revoked pin, a risk class other than read, or a live definition that differs from the pinned one (which also revokes the pin).
 */
export async function verifyCustomMcpPin(input:{
  context:TenantContext;toolkit:string;toolSlug:string;requireRisk:'read';
  store:CustomMcpPinStore;fetchDefinition:()=>Promise<CustomMcpDefinition>;env?:NodeJS.ProcessEnv;
}):Promise<{ok:true;pin:CustomMcpPin}|{ok:false;reason:CustomPinDenial}>{
  const context=requireTenantContext(input.context);
  if(!customMcpExecutionEnabled(input.env))return{ok:false,reason:'CUSTOM_MCP_EXECUTION_OFF'};
  const pin=await input.store.get(context.userId,input.toolkit,input.toolSlug);
  if(!pin)return{ok:false,reason:'CUSTOM_MCP_NOT_PINNED'};
  if(pin.revokedAt)return{ok:false,reason:'CUSTOM_MCP_PIN_REVOKED'};
  if(pin.riskClass!=='read'||input.requireRisk!=='read')return{ok:false,reason:'CUSTOM_MCP_RISK_NOT_ALLOWED'};
  let live:CustomMcpDefinition;
  try{live=await input.fetchDefinition();}catch{return{ok:false,reason:'CUSTOM_MCP_DEFINITION_UNAVAILABLE'};}
  if(live.tool.slug!==input.toolSlug||customMcpDefinitionDigest(live)!==pin.definitionDigest){
    await input.store.revoke(context.userId,input.toolkit,input.toolSlug,'definition changed');
    return{ok:false,reason:'CUSTOM_MCP_DEFINITION_CHANGED'};
  }
  return{ok:true,pin};
}
