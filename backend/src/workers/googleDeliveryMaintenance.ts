import {GoogleDeliveryStore} from './googleDeliveryStore.js';
import {GoogleCanonicalDispatch,googleDispatchConfiguration} from './googleDispatch.js';
import {reconcileOrphanedRuns} from '../ai/runReconciler.js';
import {sweepStaleEngineeringReservations} from '../ai/resourceMeter.js';
import {purgeExpiredEngineeringReservations} from '../ai/engineeringOperator.js';
import {sweepUnrecordedGceAllocations} from '../sandbox/google/orphanReconciler.js';

/** One bounded tick from the existing authenticated Cloud Scheduler route.
 * Repairs only delivery of already-persisted requests. Does not plan tasks,
 * issue actors, reopen failures or retry external consequential operations. */
export async function maintainGoogleDeliveries():Promise<void>{
  await reconcileOrphanedRuns();
  // Charge holds a dead worker never settled. Best effort: a ledger problem must not stop delivery maintenance.
  await sweepStaleEngineeringReservations().catch(()=>undefined);
  // Remove ledger rows past the configured retention (a no-op unless metering is on and a period is set).
  await purgeExpiredEngineeringReservations().catch(()=>undefined);
  // Reclaim Google execution machines that were allocated but never durably recorded (off unless XROGA_GCE_ORPHAN_SWEEP=1).
  await sweepUnrecordedGceAllocations().catch(()=>undefined);
  const c=googleDispatchConfiguration();const store=new GoogleDeliveryStore(c);const transport=new GoogleCanonicalDispatch(c);
  const ids=await store.pendingDeliveryIds();let unavailable=false;
  for(const id of ids){try{await transport.enqueue(id);}catch{unavailable=true;}}
  if(unavailable)throw new Error('Durable request dispatch is unavailable.');
}
