import { isGenericPlaceholderActivity, type XrogaActivityPresentation } from '@/lib/terminal/activityPresentation';

/** Only recorded operations and exceptional states justify a task activity surface.
 * Legacy thinking strings and response prose are never execution evidence. */
export function conversationActivityV2(rows: readonly XrogaActivityPresentation[] = []) {
  // A saved plan keeps the server's own record that the answer arrived, so its ticks survive a reload.
  const planned = rows.some(row => row.planStage);
  return rows.filter(row => (planned && /:preparing-answer$/.test(row.id)) || (!isGenericPlaceholderActivity(row.label) && !['understand', 'respond', 'summarize', 'complete'].includes(row.kind))
    || ['waiting', 'warning', 'error', 'cancelled', 'interrupted'].includes(row.status)
    // The written approach note and pages a step used stay with the answer after the run ends.
    || row.note || Boolean(row.sources?.length) || /:client-(?:read|thought)$/.test(row.id)
    || Boolean(row.evidenceRefs?.length || row.artifactRefs?.length));
}
