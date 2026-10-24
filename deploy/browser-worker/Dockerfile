# syntax=docker/dockerfile:1.7
#
# Browser worker image (Batch 1.5 Phase 2 / INFRA-005). SEPARATE from the trusted API image (Dockerfile.api): the browser never shares
# a container with the API, its secrets or its database credentials.
#
# Phase 2 ships the sandbox probe as the entrypoint. The real worker (INFRA-007, Phase 3) replaces ENTRYPOINT only; everything else here,
# including the run flags in container-spec.json and seccomp-chromium.json, is the contract it must keep.
#
# The base image is pinned by digest. Browsers come from the base image's pinned Playwright release and the npm dependency is locked
# by package-lock.json, so Chromium and Playwright move only when this file and the lock change together.
FROM mcr.microsoft.com/playwright:v1.62.0-noble@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07

LABEL org.opencontainers.image.title="xroga-browser-worker" \
      org.opencontainers.image.description="Isolated Chromium worker. Sandbox ON. No network listener. Egress only through the job egress proxy."

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# A dedicated numeric, non-root identity. No home directory, no login shell.
RUN groupadd --gid 10001 browser \
 && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin browser

WORKDIR /opt/xroga-browser-worker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY sandboxProbe.mjs ./

USER 10001:10001
ENTRYPOINT ["node", "/opt/xroga-browser-worker/sandboxProbe.mjs"]
