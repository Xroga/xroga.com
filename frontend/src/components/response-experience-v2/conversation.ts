import { isGenericPlaceholderActivity, type XrogaActivityPresentation } from '@/lib/terminal/activityPresentation';

/** Only recorded operations and exceptional states justify a task activity surface.
 * Legacy thinking strings and response prose are never execution evidence. */
export function conversationActivityV2(rows: readonly XrogaActivityPresentation[] = []) {
  return rows.filter(row => (!isGenericPlaceholderActivity(row.label) && !['understand', 'respond', 'summarize', 'complete'].includes(row.kind))
    || ['waiting', 'warning', 'error', 'cancelled', 'interrupted'].includes(row.status)
    || Boolean(row.evidenceRefs?.length || row.artifactRefs?.length));
}
