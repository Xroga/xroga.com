export const ACTION_CLASSES = Object.freeze(['READ', 'CREATE', 'UPDATE', 'DELETE', 'SEND_COMMUNICATION', 'PUBLISH',
  'PURCHASE_OR_SPEND', 'TRANSFER_OR_FINANCIAL', 'CREDENTIAL_OR_PERMISSION_CHANGE', 'SENSITIVE_DATA_EXPORT',
  'EXTERNAL_UPLOAD', 'ADMINISTRATIVE_HIGH_RISK'] as const);
export type ActionClass = typeof ACTION_CLASSES[number];

export interface PreparedAuthorityScope {
  version: '1';
  userId: string;
  tenantId: string;
  provider: string;
  connectedAccountId: string;
  operation: string;
  targetDigest: string;
  planDigest: string;
  actionClass: ActionClass;
  risk: string;
  projectId: string | null;
  runId: string | null;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  maxSpendMicroUsd: string | null;
  currency: string | null;
}

export interface AuthorityDispatchBinding {
  userId: string;
  provider: string;
  connectedAccountId: string;
  operation: string;
  targetDigest: string;
  planDigest: string;
}

/** A compatibility adapter returns evidence from its existing durable claim,
 * never a boolean copied from the request, model or plugin preference. */
export interface DurableAuthorityClaim {
  id: string;
  userId: string;
  scopeDigest: string;
  expiresAt: string;
  claimedAt: string;
}

export interface AuthorityPermit { readonly grantId: string }
