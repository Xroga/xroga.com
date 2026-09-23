'use client';

import {
  API_URL,
} from '@/lib/api';

import {
  createClient,
} from '@/lib/supabase/client';

export type DeliveryChannelStatus =
  | 'ready'
  | 'not_requested'
  | 'pending'
  | 'blocked'
  | 'failed';

export interface ProjectDeliveryState {
  schemaVersion:
    '1.0.0';

  projectId:
    string;

  runId:
    string;

  status:
    | 'ready'
    | 'partial'
    | 'blocked';

  verification: {
    status:
      DeliveryChannelStatus;

    verified:
      boolean;

    reason:
      string;
  };

  savedProject: {
    status:
      'ready' |
      'blocked';

    revision:
      number;

    fileCount:
      number;
  };

  archive: {
    status:
      'ready' |
      'blocked';

    filename:
      string;

    href:
      string;
  };

  publication: {
    requested:
      boolean;

    status:
      DeliveryChannelStatus;

    repository:
      string | null;

    branch:
      string | null;

    commitSha:
      string | null;

    reason:
      string | null;
  };

  deployment: {
    requested:
      boolean;

    status:
      DeliveryChannelStatus;

    provider:
      string | null;

    deploymentId:
      string | null;

    url:
      string | null;

    reason:
      string | null;
  };

  updatedAt:
    string;
}

export interface ProjectDeliveryEnvelope {
  delivery:
    ProjectDeliveryState;

  evidence: {
    publication: {
      status:
        'ready' |
        'failed';

      repository:
        string | null;

      repoUrl:
        string | null;

      branch:
        string | null;

      commitSha:
        string | null;

      pullRequestUrl:
        string | null;

      reason:
        string | null;

      updatedAt:
        string;
    } | null;

    deployment: {
      status:
        'ready' |
        'failed';

      provider:
        'vercel';

      deploymentId:
        string | null;

      url:
        string | null;

      verified:
        boolean;

      reason:
        string | null;

      updatedAt:
        string;
    } | null;
  };

  integrations: {
    github: {
      connected:
        boolean;
    };

    vercel: {
      connected:
        boolean;
    };
  };

  revision: {
    revisionId:
      string;

    revisionNumber:
      number;

    createdAt:
      string;
  };
}

async function accessToken():
  Promise<string> {
  const supabase =
    createClient();

  const {
    data,
  } =
    await supabase
      .auth
      .getSession();

  const value =
    data.session
      ?.access_token;

  if (
    !value
  ) {
    throw new Error(
      'Sign in required.',
    );
  }

  return value;
}

async function request<T>(
  path:
    string,

  init:
    RequestInit =
    {},
): Promise<T> {
  const token =
    await accessToken();

  const response =
    await fetch(
      `${API_URL}${path}`,

      {
        ...init,

        headers: {
          Authorization:
            `Bearer ${token}`,

          'Content-Type':
            'application/json',

          ...(
            init.headers ??
            {}
          ),
        },

        cache:
          'no-store',
      },
    );

  const body =
    await response
      .json()
      .catch(
        () => ({
          error:
            'Delivery request failed.',
        }),
      );

  if (
    !response.ok
  ) {
    throw new Error(
      typeof body?.error ===
        'string'
        ? body.error
        : 'Delivery request failed.',
    );
  }

  return body as
    T;
}

export const projectDeliveryApi = {
  async status(
    projectId:
      string,
  ): Promise<ProjectDeliveryEnvelope> {
    return request<ProjectDeliveryEnvelope>(
      `/api/delivery/${encodeURIComponent(
        projectId,
      )}`,
    );
  },

  async publish(
    projectId:
      string,

    input: {
      repository?:
        string;

      branch?:
        string;

      directWriteAuthorized?:
        boolean;

      visibility?:
        'private' |
        'public';
    } =
      {},
  ): Promise<ProjectDeliveryEnvelope> {
    return request<ProjectDeliveryEnvelope>(
      `/api/delivery/${encodeURIComponent(
        projectId,
      )}/publish`,

      {
        method:
          'POST',

        body:
          JSON.stringify(
            input,
          ),
      },
    );
  },

  async deploy(
    projectId:
      string,
  ): Promise<ProjectDeliveryEnvelope> {
    return request<ProjectDeliveryEnvelope>(
      `/api/delivery/${encodeURIComponent(
        projectId,
      )}/deploy`,

      {
        method:
          'POST',

        body:
          '{}',
      },
    );
  },

  async download(
    projectId:
      string,
  ): Promise<void> {
    const token =
      await accessToken();

    const response =
      await fetch(
        `${API_URL}/api/delivery/${encodeURIComponent(
          projectId,
        )}/download.zip`,

        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },

          cache:
            'no-store',
        },
      );

    if (
      !response.ok
    ) {
      const body =
        await response
          .json()
          .catch(
            () => ({
              error:
                'Project download failed.',
            }),
          );

      throw new Error(
        typeof body?.error ===
          'string'
          ? body.error
          : 'Project download failed.',
      );
    }

    const blob =
      await response
        .blob();

    const disposition =
      response.headers
        .get(
          'content-disposition',
        ) ??
      '';

    const match =
      disposition.match(
        /filename="([^"]+)"/i,
      );

    const filename =
      match?.[1] ??
      `${projectId}.zip`;

    const url =
      URL.createObjectURL(
        blob,
      );

    try {
      const anchor =
        document.createElement(
          'a',
        );

      anchor.href =
        url;

      anchor.download =
        filename;

      anchor.style.display =
        'none';

      document.body
        .appendChild(
          anchor,
        );

      anchor.click();

      anchor.remove();
    } finally {
      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            url,
          ),

        2_000,
      );
    }
  },
};
