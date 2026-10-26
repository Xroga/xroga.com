/**
 * The narrow Supabase Management surface the builder needs for a CUSTOMER's project.
 *
 * Deliberately absent: reading the project's secret / service-role key. Xroga needs the public URL
 * and publishable key to configure a generated app, and SQL execution through the customer's own
 * authorized connection. It never needs, and never fetches, the key that bypasses row-level security.
 */

export interface SupabaseProjectSummary {
  readonly ref: string;
  readonly name: string;
  readonly organizationId: string | null;
  readonly region: string | null;
}

export interface SupabasePublicConfig {
  readonly url: string;
  /** The publishable (or legacy anon) key. Designed to be public; safe in a browser bundle. */
  readonly publishableKey: string;
}

export interface SupabaseCatalog {
  readonly tables: ReadonlyArray<{ readonly name: string; readonly rls: boolean; readonly comment: string | null }>;
  /** public tables the signed-out role can read or write. */
  readonly anonGrants: readonly string[];
}

export type SupabaseFailure = 'unauthorized' | 'forbidden' | 'not_found' | 'rate_limited' | 'invalid_sql' | 'unavailable';

export class SupabasePortError extends Error {
  constructor(
    readonly code: SupabaseFailure,
    message: string,
    /** True when the request may have been applied even though the call failed. */
    readonly ambiguous = false,
  ) {
    super(message);
    this.name = 'SupabasePortError';
  }
}

export interface SupabasePort {
  listProjects(token: string): Promise<SupabaseProjectSummary[]>;
  getPublicConfig(token: string, ref: string): Promise<SupabasePublicConfig>;
  /** Runs SQL as ONE transaction in the customer's project. */
  applySql(token: string, ref: string, sql: string): Promise<void>;
  /** Read-only inspection of the public schema. */
  inspect(token: string, ref: string): Promise<SupabaseCatalog>;
}

export const SUPABASE_REF = /^[a-z0-9]{10,40}$/;
