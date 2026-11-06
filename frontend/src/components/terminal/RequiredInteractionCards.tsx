'use client';

import { ShieldCheck } from 'lucide-react';
import { BusinessActionConfirmationInline } from '@/lib/formatAiMarkdown';
import type { RequiredInteraction } from '@/lib/terminal/requiredInteractions';

/**
 * Open approval requests for the assistant turn, shown inside the same conversation. Each card is the existing
 * server-backed confirmation review: it loads the redacted action from the server, shows target, operation,
 * side effects and spend limits, and only the server verifies scope, digest, expiry and one-time use. Declining
 * or leaving the page never performs the action.
 */
export function RequiredInteractionCards({ interactions }: { interactions: readonly RequiredInteraction[] }) {
  if (!interactions.length) return null;
  return (
    <section aria-label="Needs your decision" data-testid="required-interactions" style={{ display: 'grid', gap: 10, margin: '10px 0' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--muted, #4a5568)' }}>
        <ShieldCheck size={15} aria-hidden="true" />
        {interactions.length === 1 ? 'Needs your decision' : `${interactions.length} decisions needed`}
      </h3>
      {interactions.map(item => (
        <div key={item.confirmationId} data-confirmation-id={item.confirmationId}>
          <BusinessActionConfirmationInline confirmationId={item.confirmationId} />
        </div>
      ))}
    </section>
  );
}
