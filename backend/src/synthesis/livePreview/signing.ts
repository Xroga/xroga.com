import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

import type {
  LivePreviewGrant,
} from './types.js';

function baseDomain(
  env:
    NodeJS.ProcessEnv,
): string {
  return (
    env
      .XROGA_PREVIEW_BASE_DOMAIN
      ?.trim()
      .toLowerCase()
      .replace(
        /^\.+|\.+$/g,
        '',
      ) ||
    'preview.xroga.com'
  );
}

function signingSecret(
  env:
    NodeJS.ProcessEnv,
): string {
  const secret =
    env
      .XROGA_PREVIEW_SIGNING_SECRET
      ?.trim() ||
    env
      .USER_SECRETS_ENCRYPTION_KEY
      ?.trim() ||
    env
      .SUPABASE_SERVICE_ROLE_KEY
      ?.trim() ||
    '';

  if (
    secret
  ) {
    return secret;
  }

  if (
    env.NODE_ENV ===
    'production'
  ) {
    throw new Error(
      'XROGA_PREVIEW_SIGNING_SECRET is required for live Preview.',
    );
  }

  return 'xroga-development-preview-signing-key';
}

function uuidLabel(
  value:
    string,
): string {
  return value
    .replaceAll(
      '-',
      '',
    )
    .toLowerCase();
}

function uuidFromLabel(
  value:
    string,
): string | null {
  if (
    !/^[a-f0-9]{32}$/.test(
      value,
    )
  ) {
    return null;
  }

  return [
    value.slice(
      0,
      8,
    ),

    value.slice(
      8,
      12,
    ),

    value.slice(
      12,
      16,
    ),

    value.slice(
      16,
      20,
    ),

    value.slice(
      20,
    ),
  ].join(
    '-',
  );
}

function signatureFor(
  grant:
    Pick<
      LivePreviewGrant,
      'previewId'
      | 'expiresAt'
    >,

  env:
    NodeJS.ProcessEnv,
): string {
  return createHmac(
    'sha256',
    signingSecret(
      env,
    ),
  )
    .update(
      `${grant.previewId}:${grant.expiresAt}`,
      'utf8',
    )
   .digest(
  'hex',
)
.slice(
  0,
  24,
);
  
}

export function livePreviewUrl(
  grant:
    LivePreviewGrant,

  env:
    NodeJS.ProcessEnv =
    process.env,
): string {
  const protocol =
    env
      .XROGA_PREVIEW_SCHEME
      ?.trim() ||
    'https';

  return (
    `${protocol}://` +
    `${uuidLabel(
      grant.previewId,
    )}.` +
    `${signatureFor(
      grant,
      env,
    )}.` +
    `${baseDomain(
      env,
    )}/`
  );
}

export function parseLivePreviewHost(
  hostname:
    string,

  env:
    NodeJS.ProcessEnv =
    process.env,
):
  | {
      previewId:
        string;

      signature:
        string;
    }
  | null {
  const clean =
    hostname
      .trim()
      .toLowerCase()
      .replace(
        /:\d+$/,
        '',
      );

  const domain =
    baseDomain(
      env,
    );

  const suffix =
    `.${domain}`;

  if (
    !clean.endsWith(
      suffix,
    )
  ) {
    return null;
  }

  const labels =
    clean
      .slice(
        0,
        -suffix.length,
      )
      .split(
        '.',
      );

  if (
    labels.length !==
    2
  ) {
    return null;
  }

  const previewId =
    uuidFromLabel(
      labels[0]!,
    );

  const signature =
    labels[1]!;

  if (
    !previewId ||
    !/^[a-zA-Z0-9_-]{16,40}$/.test(
      signature,
    )
  ) {
    return null;
  }

  return {
    previewId,
    signature,
  };
}

export function verifyLivePreviewSignature(
  grant:
    LivePreviewGrant,

  signature:
    string,

  env:
    NodeJS.ProcessEnv =
    process.env,
): boolean {
  const expected =
    signatureFor(
      grant,
      env,
    );

  const left =
    Buffer.from(
      expected,
      'utf8',
    );

  const right =
    Buffer.from(
      signature,
      'utf8',
    );

  if (
    left.length !==
    right.length
  ) {
    return false;
  }

  return timingSafeEqual(
    left,
    right,
  );
}
