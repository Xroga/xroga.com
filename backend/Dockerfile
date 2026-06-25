# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app

ENV NODE_ENV="production"

FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Copy only package.json first (no lock file)
COPY package.json ./

# Install dependencies – this will generate a new lock file automatically
RUN npm install

# Copy the rest of the application
COPY . .

# Build the application (if you have a build script)
RUN npm run build

# Remove dev dependencies (clean up)
RUN npm prune --omit=dev

FROM base

COPY --from=build /app /app

# Expose the port your app listens on (Fly.io expects 8080)
EXPOSE 8080

CMD [ "npm", "run", "start" ]
