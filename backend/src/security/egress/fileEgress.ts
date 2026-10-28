import { isDeepStrictEqual } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ownedFile, readPrivateFile } from '../../services/storage/privateFileDelivery.js';
import { digestBytes } from '../../services/storage/fileDeliveryPolicy.js';
import { consumeAuthorityPermit } from '../authority/enforce.js';
import { enforceEgress } from './egressPolicy.js';
import { classifyOutboundData } from './dataClassification.js';
import type { EgressInput, SecurityDecision } from './types.js';
import { boundedPublicPost, type PublicPostTransport } from './urlPolicy.js';

/** Reuse the canonical owner/parent/byte-integrity reads, never a body-supplied
 * owner flag. Existing upload adapters still need explicit migration to this
 * boundary. A local test is not certification of those unmigrated callers. */
export async function executeOwnedFileEgress(input: Omit<EgressInput,'payload'|'fileOwners'|'actionClass'> & {projectId:string;fileId:string},
  persist:(receipt:Readonly<SecurityDecision>)=>Promise<void>,
  db?:SupabaseClient,io?:PublicPostTransport):Promise<{statusCode:number;bodyDigest:string}> {
  input={...input,binding:{...input.binding}};
  const original=await ownedFile(input.context,input.projectId,input.fileId,db);
  const file=await readPrivateFile(input.context,original);
  try {
    // Until a format-specific inspector is verified, binary/archive documents
    // cannot pass a UTF-8 credential scan by hiding content in an encoding.
    if(file.buffer.length>128_000||! /^(?:text\/[a-z0-9.+-]+|application\/json)$/i.test(file.contentType))throw Error('Unsupported external file inspection.');
    const content=file.buffer.toString('utf8');
    if(!Buffer.from(content,'utf8').equals(file.buffer))throw Error('Unsupported external file encoding.');
    const classification=classifyOutboundData({fileContent:content},input.declaredClass).classification;
    const payload={projectId:input.projectId,fileId:input.fileId,destination:input.destination,recipient:input.recipient,sha256:digestBytes(file.buffer)};
    await enforceEgress({...input,payload,fileOwners:[original.projects.user_id],actionClass:'EXTERNAL_UPLOAD',declaredClass:classification},persist);
    return await boundedPublicPost(input.destination,file.buffer,file.contentType,async()=>{
      const current=await ownedFile(input.context,input.projectId,input.fileId,db);
      if(!isDeepStrictEqual(current,original))throw Error('File changed before external upload.');
      await consumeAuthorityPermit(input.authorityPermit,input.binding);
      // Durable approval revalidation may itself wait on database locks. Do not
      // reuse the ownership snapshot taken before that asynchronous boundary.
      const final=await ownedFile(input.context,input.projectId,input.fileId,db);
      if(!isDeepStrictEqual(final,original))throw Error('File changed during authority revalidation.');
    },io);
  } finally {file.buffer.fill(0);}
}
