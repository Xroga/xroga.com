import { ACTION_CLASSES, type ActionClass } from './types.js';

export const ACTION_POLICIES = Object.freeze(Object.fromEntries(ACTION_CLASSES.map(actionClass => [actionClass,
  Object.freeze({ actionClass, requiresGrant: actionClass !== 'READ',
    requiresSpendBinding: ['PURCHASE_OR_SPEND', 'TRANSFER_OR_FINANCIAL'].includes(actionClass),
    sensitive: ['DELETE', 'TRANSFER_OR_FINANCIAL', 'CREDENTIAL_OR_PERMISSION_CHANGE', 'SENSITIVE_DATA_EXPORT', 'ADMINISTRATIVE_HIGH_RISK'].includes(actionClass) }),
])) as Readonly<Record<ActionClass, { actionClass: ActionClass; requiresGrant: boolean; requiresSpendBinding: boolean; sensitive: boolean }>>);

/** Server-side floor, not a model/tool-description risk downgrade. Unknown
 * writes require the strongest policy until an exact adapter class is known. */
export function businessActionClass(operation: string): ActionClass {
  const name = operation.toUpperCase();
  if (/TRANSFER|PAYOUT|WITHDRAW|REFUND/.test(name)) return 'TRANSFER_OR_FINANCIAL';
  if (/PURCHASE|CHARGE|PAYMENT|BUY|CHECKOUT/.test(name)) return 'PURCHASE_OR_SPEND';
  if (/TOKEN|PASSWORD|PERMISSION|API_KEY|CREDENTIAL|GRANT_ACCESS/.test(name)) return 'CREDENTIAL_OR_PERMISSION_CHANGE';
  if (/DELETE|REMOVE|DESTROY|PURGE/.test(name)) return 'DELETE';
  if (/SEND|REPLY|POST_MESSAGE|INVITE/.test(name)) return 'SEND_COMMUNICATION';
  if (/PUBLISH|DEPLOY|RELEASE/.test(name)) return 'PUBLISH';
  if (/EXPORT|DOWNLOAD/.test(name)) return 'SENSITIVE_DATA_EXPORT';
  if (/UPLOAD|ATTACH/.test(name)) return 'EXTERNAL_UPLOAD';
  if (/CREATE|ADD|INSERT/.test(name)) return 'CREATE';
  if (/UPDATE|EDIT|PATCH|SET_|CANCEL/.test(name)) return 'UPDATE';
  return 'ADMINISTRATIVE_HIGH_RISK';
}
