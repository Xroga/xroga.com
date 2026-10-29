/** Descriptions, readOnlyHint, approved flags and provider responses are data.
 * Only a reviewed server adapter can select SERVER_REGISTERED at dispatch. */
export function toolMetadataTrust(_metadata: unknown): 'UNTRUSTED_CAPABILITY_METADATA' {
  return 'UNTRUSTED_CAPABILITY_METADATA';
}
