import { parseXrogaBlock, type XrogaBlock } from './xrogaBlocks';
import { modelBlockCapabilitySet } from './xrogaCapabilityManifest';

const ALLOWED_A2UI_TYPES = new Set<string>(['narrative', ...modelBlockCapabilitySet]);

/** Safe A2UI boundary: data-only canonical blocks, no scripts, HTML, or arbitrary actions. */
export function adaptTrustedA2uiBlock(value: unknown): XrogaBlock | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !ALLOWED_A2UI_TYPES.has(candidate.type as XrogaBlock['type'])) return null;
  if ('html' in candidate || 'script' in candidate || 'onClick' in candidate || 'actionUrl' in candidate) return null;
  return parseXrogaBlock(value);
}
