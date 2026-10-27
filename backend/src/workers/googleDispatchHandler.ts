import type {Request,Response} from 'express';
import {verifyGoogleServiceToken} from '../lib/googleServiceToken.js';
import {GoogleCanonicalDispatch,type GoogleDispatchConfiguration} from './googleDispatch.js';
import {GoogleDeliveryStore} from './googleDeliveryStore.js';

/** Private transport endpoint. OIDC is verified on the existing API, independently of public user routes.
 * Task headers and a supplied owner ID never issue user or run authority. */
export function canonicalDispatchHandler(c:GoogleDispatchConfiguration,
  store:Pick<GoogleDeliveryStore,'reserve'|'recordLaunch'>=new GoogleDeliveryStore(c),
  transport:Pick<GoogleCanonicalDispatch,'launch'>=new GoogleCanonicalDispatch(c),
  verify=verifyGoogleServiceToken){
  return async(req:Request,res:Response)=>{
    if(!await verify(req.get('authorization'),{audience:new URL(c.dispatcherUrl).origin,serviceAccountEmail:c.dispatchAccount})){
      return res.status(401).json({error:'Unauthorized.'});
    }
    const input=req.body;
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).join(',')!=='deliveryId'
      ||typeof input.deliveryId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.deliveryId)){
      return res.status(400).json({error:'Invalid delivery.'});
    }
    try{
      const reserved=await store.reserve(input.deliveryId);
      if(reserved.state==='acknowledged'||reserved.state==='absent')return res.status(204).end();
      if(reserved.state==='busy')return res.status(429).json({error:'Execution capacity is reserved.'});
      if(reserved.state!=='reserved')throw new Error('Dispatch reservation is unavailable.');
      const receipt=await transport.launch(input.deliveryId);
      await store.recordLaunch(input.deliveryId,reserved.token,receipt.operationName);
      return res.status(204).end();
    }catch{
      // Keep the durable launch lease after an uncertain Google response. A
      // queue retry cannot immediately launch a second Job or change providers.
      return res.status(503).json({error:'Delivery is awaiting verified dispatch.'});
    }
  };
}
