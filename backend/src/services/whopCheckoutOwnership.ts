/** Exact first-owner readback from the existing Whop checkout resource.
 * No credential persistence, new billing ledger or authority grant is issued.
 * Official SDK at ecd8343370e753b3767ae1f0e126296d8014257c documents GET
 * checkout_configurations/{id}; metadata requires checkout_configuration:basic:read.
 */
type CheckoutScope={checkoutId:string;accountId:string;planId:string};
type CheckoutOwner=CheckoutScope&{userId:string};
const unavailable=()=>new Error('checkout_owner_unavailable');
const record=(row:unknown):Record<string,unknown>|null=>row&&typeof row==='object'&&!Array.isArray(row)?row as Record<string,unknown>:null;

export function whopCheckoutOwnerFromResponse(value:unknown,{checkoutId,accountId,planId}:CheckoutScope):CheckoutOwner{
  if(!/^ch_[A-Za-z0-9_-]{1,180}$/.test(checkoutId)||!accountId||!planId)throw unavailable();
  const checkout=record(value),metadata=record(checkout?.metadata),plan=record(checkout?.plan);
  if(!checkout||checkout.id!==checkoutId||checkout.mode!=='payment'||plan?.id!==planId
    ||(checkout.account_id??checkout.company_id)!==accountId
    ||(checkout.account_id!==undefined&&checkout.account_id!==accountId)
    ||(checkout.company_id!==undefined&&checkout.company_id!==accountId)
    ||metadata?.source!=='xroga'||metadata.plan_tier!=='spark'
    ||typeof metadata.xroga_user_id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(metadata.xroga_user_id)
    ||typeof metadata.xroga_checkout_id!=='string'||!metadata.xroga_checkout_id||metadata.xroga_checkout_id.length>200)throw unavailable();
  return{userId:metadata.xroga_user_id,checkoutId,accountId,planId};
}

export async function readWhopCheckoutOwner(input:CheckoutScope&{apiKey:string;apiVersion:string}):Promise<CheckoutOwner>{
  const {checkoutId,accountId,planId,apiKey,apiVersion}={...input};
  if(!/^ch_[A-Za-z0-9_-]{1,180}$/.test(checkoutId)||!accountId||!planId||!apiKey.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(apiVersion))throw unavailable();
  let value:unknown;
  try{
    const response=await fetch(`https://api.whop.com/api/v1/checkout_configurations/${encodeURIComponent(checkoutId)}`,{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(10_000),headers:{Authorization:`Bearer ${apiKey}`,Accept:'application/json','Api-Version-Date':apiVersion},
    });
    if(!response.ok)throw unavailable();
    value=await response.json();
  }catch{throw unavailable();}
  return whopCheckoutOwnerFromResponse(value,{checkoutId,accountId,planId});
}
