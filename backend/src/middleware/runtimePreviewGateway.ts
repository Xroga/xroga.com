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

export interface PreviewTarget {
  readonly expiresAt:number;
  readonly revalidate:()=>Promise<boolean>;
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

// Preview targets are untrusted application code. Never forward API/SSO cookies,
// bearer credentials, proxy credentials or arbitrary user-supplied headers.
const PREVIEW_REQUEST_HEADERS = new Set([
  'accept', 'accept-encoding', 'accept-language', 'content-type', 'content-length',
  'range', 'if-range', 'if-none-match', 'if-modified-since', 'cache-control',
]);

async function targetStillCurrent(target: PreviewTarget): Promise<boolean> {
  // The admitted target owns its revalidation callback. Ongoing frames stay on
  // the same socket and never change destination or reconnect after denial.
  // A fresh connection still performs full native handle/address admission.
  return target.expiresAt > Date.now() && await target.revalidate();
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

      // URL.host without an explicit port retains an existing non-default
      // worker port. Public Preview traffic always returns through HTTPS.
      parsed.port = '';

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

          // An untrusted project response cannot control parent-site cookies or
          // clear Xroga's account cookies. Ordinary Preview cookies stay scoped
          // to their own signed host, with their other attributes preserved.
          if (key.toLowerCase() === 'clear-site-data') continue;
          if (key.toLowerCase() === 'set-cookie') {
            const cookies = (Array.isArray(value) ? value : [String(value)]).map(cookie =>
              cookie.split(';').filter((part,index) => index === 0 ||
                part.trim().split('=',1)[0]?.trim().toLowerCase() !== 'domain').join(';'));
            res.setHeader(key,cookies);
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

  const stopWatching = watchPreviewAdmission(target.revalidate, () => {
    upstream.destroy();
    res.destroy();
  }, target.expiresAt, {intervalMs:1000});
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
  upstream.once('close', stopWatching);
}

type TargetResolver=(hostname:string)=>Promise<PreviewTarget|null>;

/** Recheck after asynchronous admission and immediately before opening a
 * connection. A stalled store or a grant expiring during admission must not
 * reach the worker. This does not issue an execution or tenant capability. */
async function admitConnection(hostname:string,resolver:TargetResolver):Promise<PreviewTarget|null>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([(async()=>{
    const target=await resolver(hostname);
    if(!target||!Number.isFinite(target.expiresAt)||target.expiresAt<=Date.now())return null;
    if(!await target.revalidate()||target.expiresAt<=Date.now())return null;
    return target;
  })(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),15e3);})]);}
  catch{return null;}finally{if(timer)clearTimeout(timer);}
}

export function createRuntimePreviewGateway(resolver:TargetResolver=resolveTarget){
return async function runtimePreviewGateway(
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
    await admitConnection(hostname,resolver);

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
}

export const runtimePreviewGateway=createRuntimePreviewGateway();

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
  resolver:TargetResolver=resolveTarget,
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
            await admitConnection(hostname,resolver);

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
                stopWatching = watchPreviewAdmission(target.revalidate,()=>{
                  pending.length = 0;
                  client.terminate();upstream.terminate();
                },target.expiresAt,{intervalMs:1000});

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
