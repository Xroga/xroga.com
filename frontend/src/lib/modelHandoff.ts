import {enhanceAiResponse} from './xrogaResponseDocument';
export interface ModelHandoff {confirmationId:string;receiptId:string;text:string;completion:{status:string;reason?:string}}
interface Message {id:string;role:string;content:string;modelReceiptId?:string;featureOutput?:unknown}
const unavailable='\n\nThe saved approved model result is currently unavailable. No model request was repeated. Its accounting and approval receipt remain preserved.';
export function pendingModelConfirmation(message:Message):string|null {
 if(message.role!=='assistant'||message.modelReceiptId||!message.content.startsWith('This complex engineering response requires a separate capped spending approval.'))return null;
 const ids=[...message.content.matchAll(/\/dashboard\/actions\/confirm\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?![a-f0-9-])/gi)];
 return ids.length===1?ids[0][1]:null;
}
export function markModelUnavailable<T extends Message>(message:T,id:string):T{
 if(pendingModelConfirmation(message)!==id||message.content.endsWith(unavailable))return message;
 const content=message.content+unavailable;
 return {...message,content,featureOutput:{type:'chat',content}};
}
export function attachModelResult<T extends Message>(message:T,result:ModelHandoff):T {
 if(pendingModelConfirmation(message)!==result.confirmationId||result.receiptId!==result.confirmationId
  ||typeof result.text!=='string'||!result.text.trim()||result.text.length>180_000
  ||!['complete','partial'].includes(result.completion?.status))return message;
 const answer=enhanceAiResponse(result.text,message.id,result.completion);
 return {...message,content:answer.content,featureOutput:answer.output??{type:'chat',content:answer.content},modelReceiptId:result.receiptId};
}
