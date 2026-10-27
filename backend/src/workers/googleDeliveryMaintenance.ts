import {GoogleDeliveryStore} from './googleDeliveryStore.js';
import {GoogleCanonicalDispatch,googleDispatchConfiguration} from './googleDispatch.js';
import {reconcileOrphanedRuns} from '../ai/runReconciler.js';

/** One bounded tick from the existing authenticated Cloud Scheduler route.
 * Repairs only delivery of already-persisted requests. Does not plan tasks,
 * issue actors, reopen failures or retry external consequential operations. */
export async function maintainGoogleDeliveries():Promise<void>{
  await reconcileOrphanedRuns();
  const c=googleDispatchConfiguration();const store=new GoogleDeliveryStore(c);const transport=new GoogleCanonicalDispatch(c);
  const ids=await store.pendingDeliveryIds();let unavailable=false;
  for(const id of ids){try{await transport.enqueue(id);}catch{unavailable=true;}}
  if(unavailable)throw new Error('Durable request dispatch is unavailable.');
}
