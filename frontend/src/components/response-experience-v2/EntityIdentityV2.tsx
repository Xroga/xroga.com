'use client';
import { Layers3 } from 'lucide-react';
import { safeLinkV2 } from './document';
import { resourceIdentityV2 } from './entityRegistry';
import { SourceMarkV2 } from './SourceV2';
import styles from './response-v2.module.css';

/** Presentation-only identity, never a claim citation or permission. */
export function EntityIdentityV2({ label, url, entityId }: { label: string; url?: string; entityId?: string }) {
  const identity = resourceIdentityV2(label, url, entityId);
  const destination = safeLinkV2(url ?? identity?.url ?? '');
  const content = <>{identity ? <SourceMarkV2 url={identity.markUrl} /> : <Layers3 size={20} aria-hidden="true" />}<span>{label}</span></>;
  return destination
    ? <a className={styles.entityIdentity} href={destination} target="_blank" rel="noopener noreferrer" aria-label={label} data-entity-verified={!!identity}>{content}</a>
    : <span className={styles.entityIdentity}>{content}</span>;
}
