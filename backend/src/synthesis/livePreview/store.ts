import {
  randomUUID,
} from 'node:crypto';

import { getTenantSupabaseAdmin, getGlobalSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { createTenantContext } from '../../security/tenantContext.js';
import { TenantAccessError } from '../../security/tenantErrors.js';
import { SupabaseProjectRuntimeStore } from '../projectRuntime/store.js';
import { authorizedPreviewPermit } from './access.js';

import type {
  LivePreviewGrant,
  LivePreviewKind,
} from './types.js';

function mapGrant(
  row:
    Record<
      string,
      unknown
    >,
): LivePreviewGrant | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || !['preview_id','user_id','project_id','session_id','run_id'].every(key => typeof row[key] === 'string' && row[key].length > 0)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(row.preview_id))
    || typeof row.preview_kind !== 'string' || !['browser','api','terminal','logs','extension','mobile','desktop','mcp','ai'].includes(row.preview_kind)
    || (row.port !== null && (typeof row.port !== 'number' || !Number.isInteger(row.port) || row.port < 1 || row.port > 65535))
    || !['expires_at','created_at'].every(key => typeof row[key] === 'string' && Number.isFinite(Date.parse(row[key])))
    || (row.revoked_at !== null && (typeof row.revoked_at !== 'string' || !Number.isFinite(Date.parse(row.revoked_at))))) return null;
  return {
    previewId:
      String(
        row.preview_id,
      ),

    userId:
      String(
        row.user_id,
      ),

    projectId:
      String(
        row.project_id,
      ),

    sessionId:
      String(
        row.session_id,
      ),

    runId:
      String(
        row.run_id,
      ),

    kind:
      String(
        row.preview_kind,
      ) as
        Exclude<
          LivePreviewKind,
          'none'
        >,

    port:
      row.port ==
      null
        ? null
        : Number(
            row.port,
          ),

    expiresAt:
      String(
        row.expires_at,
      ),

    revokedAt:
      row.revoked_at
        ? String(
            row.revoked_at,
          )
        : null,

    createdAt:
      String(
        row.created_at,
      ),
  };
}

export async function createLivePreviewGrant(
  input: {
    userId:
      string;

    projectId:
      string;

    sessionId:
      string;

    runId:
      string;

    kind:
      Exclude<
        LivePreviewKind,
        'none'
      >;

    port:
      number | null;

    expiresAt:
      string;
  },
): Promise<LivePreviewGrant> {
  // Every field is scalar. Keep the original scope and capability stable while
  // the current session is loaded, instead of rereading mutable caller input.
  input = { ...input };
  const previewId =
    randomUUID();
  // Internal coordinator supplies the server owner; never create a capability
  // from an unchecked request/model owner or unrelated runtime session.
  const context = createTenantContext({ userId: input.userId, via: 'persisted_owner' });
  const now = new Date().toISOString();
  const candidate: LivePreviewGrant = { ...input, previewId, createdAt: now, revokedAt: null };
  const loaded = await new SupabaseProjectRuntimeStore().loadSession(context.userId, input.sessionId);
  const session = loaded ? JSON.parse(JSON.stringify(loaded)) : null;
  if (!authorizedPreviewPermit(candidate, session)) throw new TenantAccessError(404, 'RESOURCE_NOT_FOUND');

  const {
    data,
    error,
  } =
    await getTenantSupabaseAdmin(context)
      .rpc('create_project_preview_grant', { p_owner: context.userId, p_session: session, p_grant: {
        preview_id:
          previewId,

        user_id:
          input.userId,

        project_id:
          input.projectId,

        session_id:
          input.sessionId,

        run_id:
          input.runId,

        preview_kind:
          input.kind,

        port:
          input.port,

        expires_at:
          input.expiresAt,
      } });

  if (error && ['42501','40001','22023'].includes(error.code)) throw new TenantAccessError(404, 'RESOURCE_NOT_FOUND');

  if (
    error ||
    !Array.isArray(data) || data.length !== 1
  ) {
    throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE');
  }
  const saved = mapGrant(
    data[0] as
      Record<
        string,
        unknown
      >,
  );
  if (!saved || saved.previewId !== previewId || saved.userId !== input.userId || saved.projectId !== input.projectId
    || saved.sessionId !== input.sessionId || saved.runId !== input.runId || saved.kind !== input.kind || saved.port !== input.port
    || saved.revokedAt !== null || Date.parse(saved.expiresAt) !== Date.parse(input.expiresAt) || Date.parse(saved.expiresAt) <= Date.now()) {
    throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE');
  }
  return saved;
}

export async function getLivePreviewGrant(
  previewId:
    string,
): Promise<LivePreviewGrant | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(previewId)) return null;
  previewId = previewId.toLowerCase();
  const {
    data,
    error,
  } =
    await getGlobalSupabaseAdmin('signed_runtime_preview_resolution')
      .from(
        'project_preview_grants',
      )
      .select(
        '*',
      )
      .eq(
        'preview_id',
        previewId,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    return null;
  }

  const grant = mapGrant(
    data as
      Record<
        string,
        unknown
      >,
  );
  return grant?.previewId === previewId ? grant : null;
}

export async function getLatestLivePreviewGrant(
  input: {
    userId:
      string;

    projectId:
      string;

    sessionId?:
      string | null;
  },
): Promise<LivePreviewGrant | null> {
  input = { ...input };
  const context = createTenantContext({ userId: input.userId, via: 'persisted_owner' });
  let query =
    getTenantSupabaseAdmin(context)
      .from(
        'project_preview_grants',
      )
      .select(
        '*',
      )
      .eq(
        'user_id',
        input.userId,
      )
      .eq(
        'project_id',
        input.projectId,
      )
      .is(
        'revoked_at',
        null,
      )
      .gt(
        'expires_at',
        new Date()
          .toISOString(),
      );

  if (
    input.sessionId
  ) {
    query =
      query.eq(
        'session_id',
        input.sessionId,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        'created_at',
        {
          ascending:
            false,
        },
      )
      .limit(
        1,
      )
      .maybeSingle();

  if (
    error ||
    !data
  ) {
    return null;
  }

  const grant = mapGrant(
    data as
      Record<
        string,
        unknown
      >,
  );
  if (!grant || grant.userId !== input.userId || grant.projectId !== input.projectId
    || (input.sessionId && grant.sessionId !== input.sessionId) || grant.revokedAt || Date.parse(grant.expiresAt) <= Date.now()) return null;
  return grant;
}

export async function revokeLivePreviewGrants(
  input: {
    userId:
      string;

    projectId:
      string;

    sessionId?:
      string | null;
  },
): Promise<void> {
  const context = createTenantContext({ userId: input.userId, via: 'persisted_owner' });
  let query =
    getTenantSupabaseAdmin(context)
      .from(
        'project_preview_grants',
      )
      .update({
        revoked_at:
          new Date()
            .toISOString(),
      })
      .eq(
        'user_id',
        input.userId,
      )
      .eq(
        'project_id',
        input.projectId,
      )
      .is(
        'revoked_at',
        null,
      );

  if (
    input.sessionId
  ) {
    query =
      query.eq(
        'session_id',
        input.sessionId,
      );
  }

  const {
    error,
  } =
    await query;

  if (
    error
  ) {
    throw error;
  }
}
