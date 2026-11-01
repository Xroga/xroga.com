export const UNTRUSTED_PROVENANCE = ['USER_TEXT','WEB_CONTENT','DOCUMENT_CONTENT','TOOL_OUTPUT','REPOSITORY_CONTENT','EMAIL_CONTENT','MCP_METADATA'] as const;
export type UntrustedProvenance = typeof UNTRUSTED_PROVENANCE[number];
/** A tagged data value has no conversion to an authority scope or permit. */
export function untrustedInput(provenance: UntrustedProvenance, text: string) {
  if (!UNTRUSTED_PROVENANCE.includes(provenance) || typeof text !== 'string' || Buffer.byteLength(text) > 128_000) throw new Error('Invalid untrusted input');
  return Object.freeze({provenance, text, trust: 'UNTRUSTED_DATA' as const});
}
