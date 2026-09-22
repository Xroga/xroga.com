import type {
  ProjectLifecycleStatus,
} from '../projectRunState.js';

import type {
  SoftwareProject,
} from '../softwareProject.js';

import {
  packageBuildZip,
} from '../../services/scaffolds/packageBuildZip.js';

export const PROJECT_DELIVERY_SCHEMA_VERSION =
  '1.0.0' as const;

export const MAX_PROJECT_ARCHIVE_BYTES =
  50 *
  1024 *
  1024;

export type DeliveryOverallStatus =
  | 'ready'
  | 'partial'
  | 'blocked';

export type DeliveryChannelStatus =
  | 'ready'
  | 'not_requested'
  | 'pending'
  | 'blocked'
  | 'failed';

export interface ProjectDeliveryState {
  readonly schemaVersion:
    typeof PROJECT_DELIVERY_SCHEMA_VERSION;

  readonly projectId:
    string;

  readonly runId:
    string;

  /**
   * ready:
   * verified project + every explicitly requested external delivery
   * channel succeeded.
   *
   * partial:
   * project remains saved/downloadable, but verification or an optional
   * requested external delivery channel is incomplete/blocked/failed.
   *
   * blocked:
   * no usable project workspace exists.
   */
  readonly status:
    DeliveryOverallStatus;

  readonly verification: {
    readonly status:
      DeliveryChannelStatus;

    readonly verified:
      boolean;

    readonly reason:
      string;
  };

  /**
   * Xroga persistence is the primary delivery baseline.
   *
   * GitHub must never be required merely for this to be ready.
   */
  readonly savedProject: {
    readonly status:
      'ready' |
      'blocked';

    readonly revision:
      number;

    readonly fileCount:
      number;
  };

  /**
   * Downloadable full current workspace.
   */
  readonly archive: {
    readonly status:
      'ready' |
      'blocked';

    readonly filename:
      string;

    readonly href:
      string;
  };

  readonly publication: {
    readonly requested:
      boolean;

    readonly status:
      DeliveryChannelStatus;

    readonly repository:
      string | null;

    readonly branch:
      string | null;

    readonly commitSha:
      string | null;

    readonly reason:
      string | null;
  };

  readonly deployment: {
    readonly requested:
      boolean;

    readonly status:
      DeliveryChannelStatus;

    /**
     * Populated by Step 6 Part 2 from provider evidence.
     */
    readonly provider:
      string | null;

    readonly deploymentId:
      string | null;

    readonly url:
      string | null;

    readonly reason:
      string | null;
  };

  readonly updatedAt:
    string;
}

function channelStatusFromLifecycle(
  status:
    ProjectLifecycleStatus,

  requested:
    boolean,
): DeliveryChannelStatus {
  if (
    !requested
  ) {
    return 'not_requested';
  }

  switch (
    status
  ) {
    case 'succeeded':
      return 'ready';

    case 'blocked':
      return 'blocked';

    case 'failed':
    case 'cancelled':
      return 'failed';

    case 'running':
    case 'not_started':
      return 'pending';

    case 'not_requested':
      return 'not_requested';

    default:
      return 'pending';
  }
}

function verificationStatus(
  project:
    SoftwareProject,
): DeliveryChannelStatus {
  if (
    project.verification
      .verified
  ) {
    return 'ready';
  }

  switch (
    project.lifecycle
      .verification
      .status
  ) {
    case 'failed':
    case 'cancelled':
      return 'failed';

    case 'blocked':
      return 'blocked';

    case 'running':
    case 'not_started':
    case 'not_requested':
      return 'pending';

    case 'succeeded':
      /*
       * A lifecycle state must not override the explicit verified bit.
       */
      return 'pending';

    default:
      return 'pending';
  }
}

function safeArchiveName(
  projectId:
    string,
): string {
  const safe =
    projectId
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        '-',
      )
      .replace(
        /^-+|-+$/g,
        '',
      )
      .slice(
        0,
        80,
      ) ||
    'project';

  return `${safe}.zip`;
}

export function projectArchiveDownloadPath(
  projectId:
    string,
): string {
  return (
    `/api/delivery/` +
    `${encodeURIComponent(projectId)}` +
    '/download.zip'
  );
}

export function deliveryStateForProject(
  project:
    SoftwareProject,
): ProjectDeliveryState {
  const fileCount =
    project.workspace
      .files
      .length;

  const savedReady =
    fileCount >
    0;

  const publicationRequested =
    project.contract
      .delivery
      .publicationRequirement ===
    'REQUESTED';

  const deploymentRequested =
    project.contract
      .delivery
      .deploymentRequirement ===
    'REQUESTED';

  const publicationSucceeded =
    Boolean(
      project.repository
        ?.commitSha,
    ) ||
    project.lifecycle
      .publication
      .status ===
      'succeeded';

  const publicationStatus:
    DeliveryChannelStatus =
    publicationSucceeded
      ? 'ready'
      : channelStatusFromLifecycle(
          project.lifecycle
            .publication
            .status,

          publicationRequested,
        );

  const deploymentStatus =
    channelStatusFromLifecycle(
      project.lifecycle
        .deployment
        .status,

      deploymentRequested,
    );

  const verification =
    verificationStatus(
      project,
    );

  const requestedPublicationReady =
    !publicationRequested ||
    publicationStatus ===
      'ready';

  const requestedDeploymentReady =
    !deploymentRequested ||
    deploymentStatus ===
      'ready';

  const overallStatus:
    DeliveryOverallStatus =
    !savedReady
      ? 'blocked'
      : (
          verification ===
            'ready' &&
          requestedPublicationReady &&
          requestedDeploymentReady
        )
        ? 'ready'
        : 'partial';

  const repository =
    project.repository
      ? `${project.repository.owner}/${project.repository.repo}`
      : project.contract
          .repository
          ?.repo ??
        null;

  return {
    schemaVersion:
      PROJECT_DELIVERY_SCHEMA_VERSION,

    projectId:
      project.projectId,

    runId:
      project.runId,

    status:
      overallStatus,

    verification: {
      status:
        verification,

      verified:
        project.verification
          .verified,

      reason:
        project.verification
          .reason,
    },

    savedProject: {
      status:
        savedReady
          ? 'ready'
          : 'blocked',

      revision:
        project.workspace
          .revision,

      fileCount,
    },

    archive: {
      status:
        savedReady
          ? 'ready'
          : 'blocked',

      filename:
        safeArchiveName(
          project.projectId,
        ),

      href:
        projectArchiveDownloadPath(
          project.projectId,
        ),
    },

    publication: {
      requested:
        publicationRequested,

      status:
        publicationStatus,

      repository,

      branch:
        project.repository
          ?.branch ??
        project.contract
          .repository
          ?.branch ??
        null,

      commitSha:
        project.repository
          ?.commitSha ??
        null,

      reason:
        publicationStatus ===
          'ready' ||
        publicationStatus ===
          'not_requested'
          ? null
          : project.lifecycle
              .publication
              .detail,
    },

    deployment: {
      requested:
        deploymentRequested,

      status:
        deploymentStatus,

      provider:
        null,

      deploymentId:
        null,

      url:
        null,

      reason:
        deploymentStatus ===
          'ready' ||
        deploymentStatus ===
          'not_requested'
          ? null
          : project.lifecycle
              .deployment
              .detail,
    },

    updatedAt:
      project.updatedAt,
  };
}

function archivePathAllowed(
  path:
    string,
): boolean {
  const normalized =
    path
      .replace(
        /\\/g,
        '/',
      )
      .replace(
        /^\/+/,
        '',
      );

  const lower =
    normalized
      .toLowerCase();

  if (
    !normalized ||
    lower.startsWith(
      'node_modules/',
    ) ||
    lower.startsWith(
      '.git/',
    ) ||
    lower.startsWith(
      '.xroga/',
    )
  ) {
    return false;
  }

  const basename =
    lower
      .split(
        '/',
      )
      .pop() ??
    '';

  /*
   * Never export likely runtime credentials from the Xroga workspace.
   *
   * Documentation templates remain allowed.
   */
  if (
    basename ===
      '.env' ||
    (
      basename.startsWith(
        '.env.',
      ) &&
      ![
        '.env.example',
        '.env.sample',
        '.env.template',
      ].includes(
        basename,
      )
    ) ||
    basename ===
      '.npmrc' ||
    basename ===
      '.yarnrc' ||
    basename ===
      '.yarnrc.yml' ||
    basename ===
      'id_rsa' ||
    basename ===
      'id_ed25519' ||
    basename.endsWith(
      '.pem',
    ) ||
    basename.endsWith(
      '.p12',
    ) ||
    basename.endsWith(
      '.pfx',
    ) ||
    basename.endsWith(
      '.key',
    )
  ) {
    return false;
  }

  return true;
}

export interface ProjectArchive {
  readonly filename:
    string;

  readonly contentType:
    'application/zip';

  readonly buffer:
    Buffer;
}

export function buildProjectArchive(
  project:
    SoftwareProject,
): ProjectArchive {
  if (
    project.workspace
      .files
      .length ===
    0
  ) {
    throw new Error(
      'PROJECT_ARCHIVE_EMPTY',
    );
  }

  const files =
    project.workspace
      .files
      .map(
        (
          file,
        ) => ({
          path:
            file.path,

          content:
            file.content,
        }),
      );

  const buffer =
    packageBuildZip(
      files,

      {
        include:
          archivePathAllowed,
      },
    );

  if (
    buffer.length >
    MAX_PROJECT_ARCHIVE_BYTES
  ) {
    throw new Error(
      'PROJECT_ARCHIVE_TOO_LARGE',
    );
  }

  return {
    filename:
      safeArchiveName(
        project.projectId,
      ),

    contentType:
      'application/zip',

    buffer,
  };
}
