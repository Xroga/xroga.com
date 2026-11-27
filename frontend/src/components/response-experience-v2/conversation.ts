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

/** Arabic-script and Devanagari text needs taller lines than Latin text. Decided by the letters that make up
 * most of the writing, so one quoted word in another script changes nothing. */
export function readingScript(text: string): 'arabic' | 'devanagari' | undefined {
  const sample = text.slice(0, 4000);
  const count = (pattern: RegExp) => sample.match(pattern)?.length ?? 0;
  const letters = count(/\p{L}/gu);
  if (!letters) return undefined;
  if (count(/\p{Script=Arabic}/gu) / letters > .4) return 'arabic';
  if (count(/\p{Script=Devanagari}/gu) / letters > .4) return 'devanagari';
  return undefined;
}
