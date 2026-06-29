# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app

ENV NODE_ENV="production"
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package.json package-lock.json ./

RUN npm ci --include=dev

COPY . .

RUN npm run build

RUN test -f dist/index.js || (echo "ERROR: dist/index.js missing — deploy from backend/ with: cd backend && fly deploy -a xroga-api" && exit 1)

RUN npm prune --omit=dev

FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y ffmpeg tesseract-ocr pandoc libimage-exiftool-perl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

EXPOSE 8080

CMD [ "node", "dist/index.js" ]
