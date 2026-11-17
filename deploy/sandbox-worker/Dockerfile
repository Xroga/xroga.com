# Xroga sandbox worker image. Python and Node runtimes for pinned repository workloads, util-linux for unshare and prlimit.
# No Xroga secret is baked in: the token arrives as WORKER_TOKEN at deploy time. The worker runs as a non-root user.
FROM node:22.11.0-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 util-linux ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 10001 --create-home --shell /usr/sbin/nologin worker
WORKDIR /app
COPY server.mjs /app/server.mjs
USER 10001:10001
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
