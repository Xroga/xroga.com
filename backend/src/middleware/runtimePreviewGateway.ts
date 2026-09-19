import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';

import type {
  Duplex,
} from 'node:stream';

import type {
  NextFunction,
  Request,
  Response,
} from 'express';

import {
  WebSocket,
  WebSocketServer,
} from 'ws';

import {
  SupabaseProjectRuntimeStore,
} from '../synthesis/projectRuntime/index.js';

import {
  getLivePreviewGrant,
} from '../synthesis/livePreview/store.js';

import {
  parseLivePreviewHost,
  verifyLivePreviewSignature,
} from '../synthesis/livePreview/signing.js';

interface PreviewTarget {
  readonly host:
    string;

  readonly port:
    number;

  readonly publicHost:
    string;
}

function requestHostname(
  value:
    string | undefined,
): string {
  return (
    value ??
    ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /:\d+$/,
      '',
    );
}

async function resolveTarget(
  hostname:
    string,
): Promise<PreviewTarget | null> {
  const parsed =
    parseLivePreviewHost(
      hostname,
    );

  if (
    !parsed
  ) {
    return null;
  }

  const grant =
    await getLivePreviewGrant(
      parsed.previewId,
    );

  if (
    !grant ||
    grant.revokedAt ||
    Date.parse(
      grant.expiresAt,
    ) <=
      Date.now() ||
    !verifyLivePreviewSignature(
      grant,
      parsed.signature,
    ) ||
    !grant.port
  ) {
    return null;
  }

  const session =
    await new SupabaseProjectRuntimeStore()
      .loadSession(
        grant.userId,
        grant.sessionId,
      );

  if (
    !session ||
    session.status !==
      'running' ||
    session.runtimeClass !==
      'interactive'
  ) {
    return null;
  }

  const machineId =
    session
      .providerState
      .machineId;

  const app =
    session
      .providerState
      .app;

  if (
    typeof machineId !==
      'string' ||
    !machineId ||
    typeof app !==
      'string' ||
    !app
  ) {
    return null;
  }

  return {
    host:
      `${machineId}.vm.${app}.internal`,

    port:
      grant.port,

    publicHost:
      hostname,
  };
}

const HOP_BY_HOP =
  new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
  ]);

function upstreamHeaders(
  input:
    IncomingHttpHeaders,

  target:
    PreviewTarget,
): Record<
  string,
  string | string[]
> {
  const headers:
    Record<
      string,
      string | string[]
    > = {};

  for (
    const [
      key,
      value,
    ] of Object.entries(
      input,
    )
  ) {
    if (
      value ==
        null ||
      HOP_BY_HOP.has(
        key.toLowerCase(),
      )
    ) {
      continue;
    }

    headers[
      key
    ] =
      value;
  }

  headers.host =
    `${target.host}:${target.port}`;

  headers[
    'x-forwarded-host'
  ] =
    target.publicHost;

  headers[
    'x-forwarded-proto'
  ] =
    'https';

  return headers;
}

function rewriteLocation(
  value:
    string,

  target:
    PreviewTarget,
): string {
  try {
    const parsed =
      new URL(
        value,
      );

    if (
      parsed.hostname ===
      target.host
    ) {
      parsed.protocol =
        'https:';

      parsed.host =
        target.publicHost;

      return parsed.toString();
    }
  } catch {
    // Relative redirects are already correct.
  }

  return value;
}

function proxyHttp(
  req:
    Request,

  res:
    Response,

  target:
    PreviewTarget,
): void {
  const upstream =
    httpRequest(
      {
        hostname:
          target.host,

        port:
          target.port,

        method:
          req.method,

        path:
          req.originalUrl,

        headers:
          upstreamHeaders(
            req.headers,
            target,
          ),
      },

      (
        upstreamResponse,
      ) => {
        res.statusCode =
          upstreamResponse
            .statusCode ??
          502;

        for (
          const [
            key,
            value,
          ] of Object.entries(
            upstreamResponse
              .headers,
          )
        ) {
          if (
            value ==
              null ||
            HOP_BY_HOP.has(
              key.toLowerCase(),
            )
          ) {
            continue;
          }

          if (
            key.toLowerCase() ===
              'location' &&
            typeof value ===
              'string'
          ) {
            res.setHeader(
              key,
              rewriteLocation(
                value,
                target,
              ),
            );

            continue;
          }

          res.setHeader(
            key,
            value,
          );
        }

        res.setHeader(
          'x-xroga-preview',
          'runtime',
        );

        upstreamResponse
          .pipe(
            res,
          );
      },
    );

  upstream.setTimeout(
    30_000,

    () => {
      upstream.destroy(
        new Error(
          'Preview upstream timed out.',
        ),
      );
    },
  );

  upstream.on(
    'error',

    (
      error,
    ) => {
      if (
        res.headersSent
      ) {
        res.destroy(
          error,
        );

        return;
      }

      res
        .status(
          502,
        )
        .send(
          'Preview runtime is unavailable.',
        );
    },
  );

  req.pipe(
    upstream,
  );
}

export async function runtimePreviewGateway(
  req:
    Request,

  res:
    Response,

  next:
    NextFunction,
): Promise<void> {
  const hostname =
    requestHostname(
      req.headers.host,
    );

  const parsed =
    parseLivePreviewHost(
      hostname,
    );

  if (
    !parsed
  ) {
    next();

    return;
  }

  const target =
    await resolveTarget(
      hostname,
    );

  if (
    !target
  ) {
    res
      .status(
        410,
      )
      .send(
        'This Xroga Preview has expired or is no longer available.',
      );

    return;
  }

  proxyHttp(
    req,
    res,
    target,
  );
}

const previewWebSocketServer =
  new WebSocketServer({
    noServer:
      true,

    perMessageDeflate:
      false,
  });

function rejectUpgrade(
  socket:
    Duplex,

  status:
    number,

  message:
    string,
): void {
  socket.write(
    [
      `HTTP/1.1 ${status} ${message}`,
      'Connection: close',
      'Content-Type: text/plain',
      '',
      message,
    ].join(
      '\r\n',
    ),
  );

  socket.destroy();
}

export function attachRuntimePreviewWebSocketGateway(
  server:
    Server,
): void {
  server.on(
    'upgrade',

    (
      req,
      socket,
      head,
    ) => {
      const hostname =
        requestHostname(
          req.headers.host,
        );

      if (
        !parseLivePreviewHost(
          hostname,
        )
      ) {
        return;
      }

      void (
        async () => {
          const target =
            await resolveTarget(
              hostname,
            );

          if (
            !target
          ) {
            rejectUpgrade(
              socket,
              410,
              'Preview expired',
            );

            return;
          }

          previewWebSocketServer
            .handleUpgrade(
              req,
              socket,
              head,

              (
                client,
              ) => {
                const protocols =
                  String(
                    req.headers[
                      'sec-websocket-protocol'
                    ] ??
                    '',
                  )
                    .split(
                      ',',
                    )
                    .map(
                      (
                        value,
                      ) =>
                        value.trim(),
                    )
                    .filter(
                      Boolean,
                    );

                const targetUrl =
                  `ws://${target.host}:${target.port}${req.url ?? '/'}`;

                const upstream =
                  protocols.length
                    ? new WebSocket(
                        targetUrl,
                        protocols,
                        {
                          perMessageDeflate:
                            false,

                          headers: {
                            host:
                              `${target.host}:${target.port}`,

                            origin:
                              `http://${target.host}:${target.port}`,

                            'x-forwarded-host':
                              target.publicHost,

                            'x-forwarded-proto':
                              'https',
                          },
                        },
                      )
                    : new WebSocket(
                        targetUrl,
                        {
                          perMessageDeflate:
                            false,

                          headers: {
                            host:
                              `${target.host}:${target.port}`,

                            origin:
                              `http://${target.host}:${target.port}`,

                            'x-forwarded-host':
                              target.publicHost,

                            'x-forwarded-proto':
                              'https',
                          },
                        },
                      );

                const pending:
                  Array<{
                    data:
                      Buffer;

                    binary:
                      boolean;
                  }> =
                  [];

                client.on(
                  'message',

                  (
                    data,
                    binary,
                  ) => {
                    const buffer =
                      Buffer.isBuffer(
                        data,
                      )
                        ? data
                        : Buffer.from(
                            data as
                              ArrayBuffer,
                          );

                    if (
                      upstream.readyState ===
                      WebSocket.OPEN
                    ) {
                      upstream.send(
                        buffer,
                        {
                          binary,
                        },
                      );
                    } else {
                      pending.push({
                        data:
                          buffer,

                        binary,
                      });
                    }
                  },
                );

                upstream.on(
                  'open',

                  () => {
                    for (
                      const message of
                      pending.splice(
                        0,
                      )
                    ) {
                      upstream.send(
                        message.data,
                        {
                          binary:
                            message.binary,
                        },
                      );
                    }
                  },
                );

                upstream.on(
                  'message',

                  (
                    data,
                    binary,
                  ) => {
                    if (
                      client.readyState ===
                      WebSocket.OPEN
                    ) {
                      client.send(
                        data,
                        {
                          binary,
                        },
                      );
                    }
                  },
                );

                const closeBoth =
                  () => {
                    if (
                      client.readyState ===
                        WebSocket.OPEN ||
                      client.readyState ===
                        WebSocket.CONNECTING
                    ) {
                      client.close();
                    }

                    if (
                      upstream.readyState ===
                        WebSocket.OPEN ||
                      upstream.readyState ===
                        WebSocket.CONNECTING
                    ) {
                      upstream.close();
                    }
                  };

                client.on(
                  'close',
                  closeBoth,
                );

                upstream.on(
                  'close',
                  closeBoth,
                );

                client.on(
                  'error',
                  closeBoth,
                );

                upstream.on(
                  'error',
                  closeBoth,
                );
              },
            );
        }
      )().catch(
        () => {
          rejectUpgrade(
            socket,
            502,
            'Preview unavailable',
          );
        },
      );
    },
  );
}
