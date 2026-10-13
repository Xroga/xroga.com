/** Public errors never reveal whether another owner's resource exists. */
export class TenantAccessError extends Error {
  constructor(readonly status: 401 | 404 | 503, readonly code: 'TENANT_AUTH_REQUIRED' | 'RESOURCE_NOT_FOUND' | 'RESOURCE_ACCESS_UNAVAILABLE') {
    super(status === 401 ? 'Sign in again and retry.' : status === 404 ? 'Resource not found.' : 'Unable to check access right now. Retry shortly.');
    this.name = 'TenantAccessError';
  }
}

export function resourceNotFound(): never { throw new TenantAccessError(404, 'RESOURCE_NOT_FOUND'); }
