import {
  randomUUID,
} from 'node:crypto';

import {
  getSupabaseAdmin,
} from '../../config/supabase.js';

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
): LivePreviewGrant {
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
  const previewId =
    randomUUID();

  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        'project_preview_grants',
      )
      .insert({
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
      })
      .select(
        '*',
      )
      .single();

  if (
    error ||
    !data
  ) {
    throw (
      error ??
      new Error(
        'Preview grant was not persisted.',
      )
    );
  }

  return mapGrant(
    data as
      Record<
        string,
        unknown
      >,
  );
}

export async function getLivePreviewGrant(
  previewId:
    string,
): Promise<LivePreviewGrant | null> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
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

  return mapGrant(
    data as
      Record<
        string,
        unknown
      >,
  );
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
  let query =
    getSupabaseAdmin()
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

  return mapGrant(
    data as
      Record<
        string,
        unknown
      >,
  );
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
  let query =
    getSupabaseAdmin()
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
