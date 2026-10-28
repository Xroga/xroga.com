import type { TenantContext } from '../tenantContext.js';
import type { ActionClass, AuthorityDispatchBinding, AuthorityPermit } from '../authority/types.js';

export const POLICY_VERSION = 'xroga-egress-1';
export const DATA_CLASSES = ['PUBLIC','USER_PRIVATE','BUSINESS_CONFIDENTIAL','PERSONAL_DATA','HIGHLY_SENSITIVE','CREDENTIAL_SECRET'] as const;
export type DataClass = typeof DATA_CLASSES[number];
export type EgressDecision = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'REQUIRE_REDACTION' | 'REQUIRE_RESTRICTED_SANDBOX';
export type EgressReason = 'EXACT_AUTHORITY_REQUIRED' | 'SECRET_EGRESS_DENIED' | 'FOREIGN_FILE_OWNER' | 'UNSAFE_DESTINATION'
  | 'UNTRUSTED_TOOL_REQUIRES_SANDBOX' | 'INVALID_EGRESS_INPUT' | 'EXACT_BOUNDARY_ALLOWED';
/** Internal server API. Context/permit must be issued, never decoded from JSON.
 * File ownership must come from the existing owned file lookup, not request data.
 * Adapter credentials are deliberately absent from this input. */
export interface EgressInput {
  context: TenantContext;
  actionClass: ActionClass;
  binding: AuthorityDispatchBinding;
  authorityPermit?: AuthorityPermit;
  destination: string;
  recipient: string;
  purpose: string;
  payload: unknown;
  declaredClass?: DataClass;
  fileOwners?: readonly string[];
  toolTrust?: 'SERVER_REGISTERED' | 'UNTRUSTED_CAPABILITY_METADATA';
}
export interface SecurityDecision {
  id: string; version: typeof POLICY_VERSION; decision: EgressDecision; reason: EgressReason;
  classification: DataClass; userId: string; tenantId: string; correlationId: string;
  bindingDigest: string; destinationDigest: string; recipientDigest: string; payloadDigest: string; purposeDigest: string;
}
