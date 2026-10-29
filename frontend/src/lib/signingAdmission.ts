export interface SigningConfirmation {id:string;summary:string;status:string;toolkit:string;toolSlug?:string;expiresAt:string}
export function requireSigningConfirmation(value:unknown):SigningConfirmation{
 const row=value as SigningConfirmation|null;
 if(!row||typeof row!=='object'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.id)||row.status!=='pending'||row.toolkit!=='xroga-native-signing'||row.toolSlug!=='XROGA_SET_SIGNING_MATERIAL'
  ||typeof row.summary!=='string'||!row.summary||row.summary.length>1000||!Number.isFinite(Date.parse(row.expiresAt))||Date.parse(row.expiresAt)<=Date.now())throw new Error('Prepare a current signing-material approval first.');
 return {...row};
}
export function requireSigningConfirmations(value:unknown):SigningConfirmation[]{
 if(!Array.isArray(value)||value.length<1||value.length>5)throw new Error('Signing approvals are unavailable.');
 const rows=value.map(requireSigningConfirmation);if(new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('Signing approvals are unavailable.');return rows;
}
