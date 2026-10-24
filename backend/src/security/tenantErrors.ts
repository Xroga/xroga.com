/** Public errors never reveal whether another owner's resource exists. */
export class TenantAccessError extends Error {
  constructor(readonly status: 401 | 404 | 503, readonly code: 'TENANT_AUTH_REQUIRED' | 'RESOURCE_NOT_FOUND' | 'RESOURCE_ACCESS_UNAVAILABLE') {
    super(status === 401 ? 'Sign in again and retry.' : status === 404 ? 'Resource not found.' : 'Unable to check access right now. Retry shortly.');
    this.name = 'TenantAccessError';
  }
}

export function resourceNotFound(): never { throw new TenantAccessError(404, 'RESOURCE_NOT_FOUND'); }

/** Fixed public runtime failure surface; never stringify provider/database errors. */
export function runtimeAccessFailure(error: unknown): {status: number; error: string; code: string} {
  if (error instanceof TenantAccessError) return {status:error.status,error:error.message,code:error.code};
  return {status:503,error:'Project runtime is temporarily unavailable. Retry shortly.',code:'PROJECT_RUNTIME_UNAVAILABLE'};
}
