# syntax=docker/dockerfile:1
#
# Soccernity API image (infra/api-docker-ffmpeg). Render's native Node runtime has no
# ffmpeg/ffprobe, so video uploads fail closed (503); this image adds them.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT (npm workspaces, one lockfile):
#   docker build -f services/api/Dockerfile .
#
# Layout inside the image mirrors the repo, so the existing render.yaml preDeployCommand
# runs unchanged from WORKDIR /app:
#   npx prisma migrate deploy --schema=services/api/prisma/schema.prisma
#   node services/api/dist/scripts/backfill-dob-encryption.js
#
# Node 22.22.0 satisfies the root package.json engines (>=22.22.0) and matches CI.
ARG NODE_VERSION=22.22.0

# ---------- build: full install, prisma generate, nest build ----------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
# openssl: Prisma detects libssl to pick its engine binary.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Lockfile + every workspace manifest first, so this layer caches until dependencies change.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/api/package.json services/api/package.json
# Only services/api's dependency tree (dev dependencies included: nest cli, typescript, prisma).
RUN npm ci --workspace=services/api

COPY services/api services/api
RUN npm run prisma:generate && npm run build --workspace=services/api

# ---------- prod-deps: production dependencies of services/api only ----------
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci --workspace=services/api --omit=dev
# The generated Prisma client (query engine included) comes from the build stage.
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
# The Prisma CLI is a devDependency, but the pre-deploy command runs `npx prisma migrate deploy`.
# Copy exactly the locked version (and its engines) instead of letting npx download "latest".
COPY --from=build /app/node_modules/prisma node_modules/prisma
COPY --from=build /app/node_modules/@prisma node_modules/@prisma
RUN ln -sf ../prisma/build/index.js node_modules/.bin/prisma

# ---------- runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# ffmpeg also provides ffprobe. tini is PID 1 so SIGTERM reaches node.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps --chown=node:node /app/node_modules node_modules
COPY --from=prod-deps --chown=node:node /app/package.json package.json
COPY --from=build --chown=node:node /app/services/api/package.json services/api/package.json
COPY --from=build --chown=node:node /app/services/api/dist services/api/dist
COPY --from=build --chown=node:node /app/services/api/prisma services/api/prisma
COPY --chown=node:node services/api/docker-start.sh services/api/docker-start.sh
# Where fetch-geolite2.js writes the MaxMind database at container start (never at build).
RUN mkdir -p services/api/geoip && chown node:node services/api/geoip && chmod +x services/api/docker-start.sh

USER node
# Render sets PORT at runtime; the app reads process.env.PORT (default 3000).
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["services/api/docker-start.sh"]
