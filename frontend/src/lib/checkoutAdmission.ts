export interface CheckoutConfirmation {id:string;summary:string;toolkit:string;toolSlug?:string;expiresAt:string}
export function requireCheckoutConfirmation(value:CheckoutConfirmation):CheckoutConfirmation{
 if(!value||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(value.id)
  ||value.toolkit!=='xroga-native-billing'||value.toolSlug!=='XROGA_CREATE_CHECKOUT'
  ||typeof value.summary!=='string'||!value.summary||value.summary.length>1000
  ||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now())throw new Error('Checkout approval is unavailable or expired.');
 return Object.freeze({...value});
}
export function requireCheckoutDestination(value:unknown):string{
 if(typeof value!=='string'||value.length>8192)throw new Error('Checkout destination was invalid.');
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash
  ||url.hostname!=='whop.com'&&!url.hostname.endsWith('.whop.com'))throw new Error('Checkout destination was invalid.');
 return url.href;
}
