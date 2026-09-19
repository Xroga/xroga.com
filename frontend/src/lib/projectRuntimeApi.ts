'use client';

import {
  createClient,
} from '@/lib/supabase/client';

import {
  API_URL,
} from '@/lib/api';

import type {
  RuntimePreviewState,
} from '@/store/useLiveBuildStore';

async function token():
  Promise<string> {
  const supabase =
    createClient();

  const {
    data,
  } =
    await supabase
      .auth
      .getSession();

  const accessToken =
    data.session
      ?.access_token;

  if (
    !accessToken
  ) {
    throw new Error(
      'Sign in required.',
    );
  }

  return accessToken;
}

async function request<T>(
  path:
    string,

  init:
    RequestInit =
    {},
): Promise<T> {
  const accessToken =
    await token();

  const response =
    await fetch(
      `${API_URL}${path}`,

      {
        ...init,

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          'Content-Type':
            'application/json',

          ...(
            init.headers ??
            {}
          ),
        },
      },
    );

  const body =
    await response
      .json()
      .catch(
        () => ({
          error:
            'Runtime request failed.',
        }),
      );

  if (
    !response.ok
  ) {
    throw new Error(
      typeof body?.error ===
        'string'
        ? body.error
        : 'Runtime request failed.',
    );
  }

  return body as
    T;
}

export const projectRuntimeApi = {
  async status(
    projectId:
      string,
  ): Promise<RuntimePreviewState | null> {
    const result =
      await request<{
        preview?:
          RuntimePreviewState;
      }>(
        `/api/project-runtime/${encodeURIComponent(
          projectId,
        )}`,
      );

    return (
      result.preview ??
      null
    );
  },

  async restart(
    projectId:
      string,
  ): Promise<RuntimePreviewState | null> {
    const result =
      await request<{
        preview?:
          RuntimePreviewState;
      }>(
        `/api/project-runtime/${encodeURIComponent(
          projectId,
        )}/restart`,

        {
          method:
            'POST',

          body:
            '{}',
        },
      );

    return (
      result.preview ??
      null
    );
  },

  async stop(
    projectId:
      string,
  ): Promise<boolean> {
    const result =
      await request<{
        stopped?:
          boolean;
      }>(
        `/api/project-runtime/${encodeURIComponent(
          projectId,
        )}/stop`,

        {
          method:
            'POST',

          body:
            '{}',
        },
      );

    return Boolean(
      result.stopped,
    );
  },

  async logs(
    projectId:
      string,
  ): Promise<string> {
    const result =
      await request<{
        logs?:
          string;
      }>(
        `/api/project-runtime/${encodeURIComponent(
          projectId,
        )}/logs`,
      );

    return (
      result.logs ??
      ''
    );
  },
};
