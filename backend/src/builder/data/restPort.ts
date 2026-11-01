import {isBuilderSecurityDenial} from '../providerAuthority.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import {EgressDenied} from '../../security/egress/egressPolicy.js';
import { SUPABASE_REF, SupabasePortError, type SupabaseCatalog, type SupabasePort, type SupabaseProjectSummary, type SupabasePublicConfig } from './port.js';

/** (token, path, init) => Response against the Supabase Management API. Injected in tests. */
export type SupabaseTransport = (token: string, path: string, init?: RequestInit) => Promise<Response>;

export const supabaseManagementFetch: SupabaseTransport = async () => { throw new AuthorityError('BUILDER_SUPABASE_ACTOR_REQUIRED'); };

export const CATALOG_TABLES_SQL="select c.relname as name, c.relrowsecurity as rls, obj_description(c.oid, 'pg_class') as comment from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by c.relname";
export const CATALOG_GRANTS_SQL="select distinct table_name from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'PUBLIC')";

function failure(response: Response, action: string, ambiguousOnServerError: boolean): SupabasePortError {
  const status = response.status;
  if (status === 401) return new SupabasePortError('unauthorized', 'Supabase rejected the connection. Reconnect your Supabase account in Xroga.');
  if (status === 403) return new SupabasePortError('forbidden', `Supabase denied this action (${action}). The connection may lack permission for this project.`);
  if (status === 404) return new SupabasePortError('not_found', `Supabase could not find the project (${action}).`);
  if (status === 429) return new SupabasePortError('rate_limited', 'Supabase is rate limiting requests. Try again shortly.');
  if (status === 400) return new SupabasePortError('invalid_sql', `Supabase rejected the request (${action}). Nothing was applied.`);
  return new SupabasePortError('unavailable', 'Supabase is temporarily unavailable.', ambiguousOnServerError);
}

const ref = (value: string): string => {
  if (!SUPABASE_REF.test(value)) throw new SupabasePortError('not_found', 'That is not a valid Supabase project reference.');
  return value;
};

async function rows<T>(response: Response): Promise<T[]> {
  const body = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(body) ? (body as T[]) : [];
}

export function createRestSupabasePort(transport: SupabaseTransport = supabaseManagementFetch): SupabasePort {
  const call = async (token: string, path: string, init: RequestInit | undefined, ambiguous = false): Promise<Response> => {
    try {
      return await transport(token, path, init);
    } catch (error) {
      if(isBuilderSecurityDenial(error))throw error;
      throw new SupabasePortError('unavailable', 'Supabase could not be reached.', ambiguous);
    }
  };
  const query = (sql: string): RequestInit => ({ method: 'POST', body: JSON.stringify({ query: sql }) });

  return {
    async listProjects(token): Promise<SupabaseProjectSummary[]> {
      const response = await call(token, '/projects', undefined);
      if (!response.ok) throw failure(response, 'list projects', false);
      return (await rows<Record<string, unknown>>(response))
        .map((project) => ({
          ref: String(project.id ?? project.ref ?? ''),
          name: String(project.name ?? project.id ?? 'project'),
          organizationId: project.organization_id ? String(project.organization_id) : null,
          region: project.region ? String(project.region) : null,
        }))
        .filter((project) => SUPABASE_REF.test(project.ref));
    },

    async getPublicConfig(token, projectRef): Promise<SupabasePublicConfig> {
      // reveal=false: secret values are never requested, so a service-role key cannot reach Xroga.
      const response = await call(token, `/projects/${ref(projectRef)}/api-keys?reveal=false`, undefined);
      if (!response.ok) throw failure(response, 'read public configuration', false);
      const keys = await rows<{ name?: string; type?: string; api_key?: string }>(response);
      const publishable = keys.find((key) => key.type === 'publishable' && key.api_key)?.api_key ?? keys.find((key) => (key.name === 'anon' || key.type === 'legacyAnonKey' || key.type === 'anon') && key.api_key)?.api_key;
      if (!publishable || /service_role|sb_secret_/.test(publishable)) {
        throw new SupabasePortError('forbidden', 'Supabase did not return a publishable key for this project.');
      }
      return { url: `https://${projectRef}.supabase.co`, publishableKey: publishable };
    },

    async applySql(token, projectRef, sql): Promise<void> {
      // One statement batch, one transaction: either all of the schema is applied or none of it.
      const response = await call(token, `/projects/${ref(projectRef)}/database/query`, query(`begin;\n${sql}\ncommit;`), true);
      if (!response.ok) throw failure(response, 'apply migration', true);
    },

    async inspect(token, projectRef): Promise<SupabaseCatalog> {
      const tables = await call(
        token,
        `/projects/${ref(projectRef)}/database/query`,
        query(CATALOG_TABLES_SQL),
      );
      if (!tables.ok) throw failure(tables, 'inspect schema', false);
      const grants = await call(
        token,
        `/projects/${ref(projectRef)}/database/query`,
        query(CATALOG_GRANTS_SQL),
      );
      if (!grants.ok) throw failure(grants, 'inspect grants', false);
      return {
        tables: (await rows<{ name: string; rls: boolean; comment: string | null }>(tables)).map((row) => ({ name: row.name, rls: row.rls === true, comment: row.comment ?? null })),
        anonGrants: (await rows<{ table_name: string }>(grants)).map((row) => row.table_name),
      };
    },
  };
}
