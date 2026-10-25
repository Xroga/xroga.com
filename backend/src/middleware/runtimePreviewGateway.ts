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
import { authorizedPreviewTarget,authorizedPreviewSession } from '../synthesis/livePreview/access.js';
import {watchPreviewAdmission} from '../synthesis/livePreview/admissionWatch.js';
import {googleProjectRuntimeSelected,googleExecutionConfiguration,verifyAttachedGoogleIdentity} from '../synthesis/projectRuntime/googleFactory.js';
import {GceMachineControl} from '../sandbox/google/gceMachineControl.js';
import {googlePreviewTarget} from '../synthesis/livePreview/googleTarget.js';

import {
  parseLivePreviewHost,
  verifyLivePreviewSignature,
} from '../synthesis/livePreview/signing.js';

interface PreviewTarget {
  readonly expiresAt:number;
  readonly revalidate:()=>Promise<boolean>;
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

  const store=new SupabaseProjectRuntimeStore();
  const session =
    await store
      .loadSession(
        grant.userId,
        grant.sessionId,
      );

  let target;
  if(googleProjectRuntimeSelected()) {
    const revision=await store.loadLatestRevision(grant.userId,grant.projectId);
    if(!revision||revision.userId!==grant.userId||revision.runId!==grant.runId)return null;
    const configuration=googleExecutionConfiguration();
    target=await googlePreviewTarget(grant,session,new GceMachineControl(configuration),()=>verifyAttachedGoogleIdentity(configuration.serviceAccount));
    // Admission may wait on the control plane. Recheck revocation and durable
    // handle after that wait, before either HTTP or WebSocket connection.
    const current=await getLivePreviewGrant(parsed.previewId);
    const currentSession=await store.loadSession(grant.userId,grant.sessionId);
    if(!current||JSON.stringify(current)!==JSON.stringify(grant)||!currentSession
      ||JSON.stringify(currentSession)!==JSON.stringify(session)||!authorizedPreviewSession(current,currentSession))return null;
  }else target=authorizedPreviewTarget(grant,session);
  if (!target||!session) return null;

  return {
    host: target.host,
    port: target.port,
    expiresAt:Math.min(Date.parse(grant.expiresAt),session.expiresAt?Date.parse(session.expiresAt):Infinity),
    revalidate:async()=>{
      const current=await getLivePreviewGrant(parsed.previewId);
      const active=await store.loadSession(grant.userId,grant.sessionId);
      if(!current||JSON.stringify(current)!==JSON.stringify(grant)||!authorizedPreviewSession(current,active)
        ||active.providerId!==session.providerId||active.image!==session.image
        ||JSON.stringify(active.providerState)!==JSON.stringify(session.providerState))return false;
      if(googleProjectRuntimeSelected()) {
        const revision=await store.loadLatestRevision(grant.userId,grant.projectId);
        if(!revision||revision.userId!==grant.userId||revision.runId!==grant.runId)return false;
      }
      return verifyLivePreviewSignature(current,parsed.signature);
    },

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
  const stopAdmissionWatch=watchPreviewAdmission(target.revalidate,()=>{
    upstream.destroy();res.destroy();
  },target.expiresAt);
  res.once('close',stopAdmissionWatch);
  upstream.once('close',stopAdmissionWatch);
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

                let stopAdmissionWatch:()=>void=()=>{};
                const closeBoth =
                  () => {
                    stopAdmissionWatch();
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

                stopAdmissionWatch=watchPreviewAdmission(target.revalidate,()=>{
                  // Terminate denied channels without a close-handshake delay.
                  client.terminate();upstream.terminate();
                },target.expiresAt);

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
