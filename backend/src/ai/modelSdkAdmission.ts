import type {ModelId} from './models.js';
import type {ProviderUsageResult} from './providerBudget.js';

export type ModelWireGuard=(wireBody:string)=>Promise<void>;
export interface SdkCompletion extends ProviderUsageResult {modelId:ModelId}
interface Admission {
  modelId:ModelId;
  credentialOverride:string|undefined;
  used:boolean;
  completion?:{result:SdkCompletion;publish:()=>void;checkCancellation:()=>void};
}
const issued=new WeakMap<ModelWireGuard,Admission>();
export function modelAdmissionDenied():never {
  throw Object.assign(Error('Model dispatch requires a current admitted reservation.'),{code:'MODEL_DISPATCH_BINDING_DENIED',status:400});
}

/** Internal registration after the canonical issuer verifies actor/owner and
 * reservation. A callback supplied by a request, cloned object or plain user ID
 * is never an admission. This is one request lifetime, not another authority,
 * tenant context, vault, budget or ledger. Production issuers are source-tested. */
export function registerModelSdkAdmission(guard:ModelWireGuard,modelId:ModelId,credentialOverride:string|undefined){
  if(issued.has(guard))modelAdmissionDenied();
  const admission:Admission={modelId,credentialOverride,used:false};issued.set(guard,admission);
  return {
    revoke(){issued.delete(guard);},
    completion(){return admission.completion;},
  };
}

export function requireModelSdkAdmission(guard:ModelWireGuard|undefined,modelId:ModelId,credentialOverride:string|undefined){
  const admission=guard?issued.get(guard):undefined;
  if(!admission||admission.used||admission.modelId!==modelId||admission.credentialOverride!==credentialOverride)modelAdmissionDenied();
  admission.used=true;
  return {complete(result:SdkCompletion,publish:()=>void,checkCancellation:()=>void){
    if(!guard||issued.get(guard)!==admission||admission.completion||result.modelId!==modelId)modelAdmissionDenied();
    let published=false;
    admission.completion={result:{...result},checkCancellation,publish:()=>{
      if(published)modelAdmissionDenied();published=true;
      try{publish();}
      catch{throw Object.assign(Error('The model completed, but output delivery failed. Another provider attempt was not authorized.'),
        {code:'MODEL_PUBLICATION_FAILED',status:503,providerCompleted:true,retryable:false});}
    }};
  }};
}
