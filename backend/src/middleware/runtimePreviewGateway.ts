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
import { authorizedPreviewTarget } from '../synthesis/livePreview/access.js';

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

function isPreviewRequestPath(value: string | undefined): value is string {
  // Only origin-form paths may be appended to the fixed runtime authority.
  // In particular, @host, absolute URLs and network-path references must never
  // become URL authority/userinfo when constructing a WebSocket destination.
  return typeof value === 'string' && /^\/(?!\/)/.test(value) && !/[\\\u0000-\u0020#]/.test(value);
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

export async function resolveTarget(
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

  const target = authorizedPreviewTarget(grant, session);
  if (!target) return null;

  return {
    host: target.host,
    port: target.port,

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

// Preview targets are untrusted application code. Never forward API/SSO cookies,
// bearer credentials, proxy credentials or arbitrary user-supplied headers.
const PREVIEW_REQUEST_HEADERS = new Set([
  'accept', 'accept-encoding', 'accept-language', 'content-type', 'content-length',
  'range', 'if-range', 'if-none-match', 'if-modified-since', 'cache-control',
]);

async function targetStillCurrent(target: PreviewTarget): Promise<boolean> {
  const current = await resolveTarget(target.publicHost);
  return current?.host === target.host && current?.port === target.port;
}

/** Idle streams must not retain access indefinitely after revocation. Recheck
 * once per second, with one in-flight read and a bounded fail-closed deadline. */
function watchPreviewTarget(target: PreviewTarget, invalidate: () => void): () => void {
  let stopped = false;
  let checking = false;
  const timer = setInterval(() => {
    if (stopped || checking) return;
    checking = true;
    const deadline = setTimeout(() => { if (!stopped) invalidate(); }, 5_000);
    void targetStillCurrent(target).then(valid => { if (!valid && !stopped) invalidate(); })
      .catch(() => { if (!stopped) invalidate(); })
      .finally(() => { clearTimeout(deadline); checking = false; });
  }, 1_000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}

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
      !PREVIEW_REQUEST_HEADERS.has(
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
): string | null {
  try {
    const parsed =
      new URL(
        value,
      );

    if (
      (parsed.hostname === target.host && (!parsed.port || Number(parsed.port) === target.port)) ||
      parsed.host === target.publicHost
    ) {
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      parsed.protocol =
        'https:';

      parsed.host =
        target.publicHost;

      return parsed.toString();
    }
  } catch {
    // Network-path references and backslash-normalized authorities are not local.
    if (!/^[\u0000-\u0020]*[\\/]{2}/.test(value) && !value.includes('\\') && !/[\r\n]/.test(value)) return value;
  }

  return null;
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
            const location = rewriteLocation(value, target);
            if (location === null) {
              upstreamResponse.destroy();
              res.statusCode = 502;
              res.end('Preview redirect destination is not permitted.');
              return;
            }
            res.setHeader(
              key,
              location,
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

  const stopWatching = watchPreviewTarget(target, () => {
    upstream.destroy();
    res.destroy();
  });
  res.once('close', () => { stopWatching(); upstream.destroy(); });
  req.once('aborted', () => { stopWatching(); upstream.destroy(); });

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

  if (!isPreviewRequestPath(req.originalUrl)) {
    res.status(400).send('Invalid preview request path.');
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
    maxPayload: 1024 * 1024,
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
          if (!isPreviewRequestPath(req.url)) {
            rejectUpgrade(socket, 400, 'Invalid preview request path');
            return;
          }
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
                          maxPayload: 1024 * 1024,
                          handshakeTimeout: 10_000,

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
                          maxPayload: 1024 * 1024,
                          handshakeTimeout: 10_000,

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

                let queuedBytes = 0;
                let clientQueue = Promise.resolve();
                let upstreamQueue = Promise.resolve();

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

                    queuedBytes += buffer.byteLength;
                    if (queuedBytes > 1024 * 1024) { closeBoth(); return; }
                    clientQueue = clientQueue.then(async () => {
                      if (!await targetStillCurrent(target)) { closeBoth(); return; }
                      if (upstream.readyState === WebSocket.OPEN) {
                        queuedBytes -= buffer.byteLength;
                        if (upstream.bufferedAmount + buffer.byteLength > 1024 * 1024) { closeBoth(); return; }
                        upstream.send(buffer, { binary });
                      } else if (upstream.readyState === WebSocket.CONNECTING) pending.push({data: buffer, binary});
                    }).catch(closeBoth);
                  },
                );

                upstream.on(
                  'open',

                  () => { void clientQueue.then(async () => {
                    if (!await targetStillCurrent(target)) { closeBoth(); return; }
                    for (
                      const message of
                      pending.splice(
                        0,
                      )
                    ) {
                      queuedBytes -= message.data.byteLength;
                      if (upstream.bufferedAmount + message.data.byteLength > 1024 * 1024) { closeBoth(); return; }
                      upstream.send(
                        message.data,
                        {
                          binary:
                            message.binary,
                        },
                      );
                    }
                  }).catch(closeBoth);
                  },
                );

                upstream.on(
                  'message',

                  (
                    data,
                    binary,
                  ) => {
                    const length = Array.isArray(data) ? data.reduce((n, chunk) => n + chunk.length, 0) : data.byteLength;
                    queuedBytes += length;
                    if (queuedBytes > 1024 * 1024) { closeBoth(); return; }
                    upstreamQueue = upstreamQueue.then(async () => {
                      if (!await targetStillCurrent(target)) { closeBoth(); return; }
                      queuedBytes -= length;
                      if (client.readyState === WebSocket.OPEN) {
                        if (client.bufferedAmount + length > 1024 * 1024) { closeBoth(); return; }
                        client.send(data, { binary });
                      }
                    }).catch(closeBoth);
                  },
                );

                let stopWatching = () => {};
                const closeBoth =
                  () => {
                    stopWatching();
                    pending.length = 0;
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
                stopWatching = watchPreviewTarget(target, closeBoth);

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
