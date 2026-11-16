# API Docker image with ffmpeg (infra/api-docker-ffmpeg)

Branch from `origin/main` `59016bc` (2026-11-15). Founder decision 2026-11-15: move the API from Render's native Node runtime to a Docker image, because the native runtime has no `ffmpeg`/`ffprobe` and every video upload fails closed (503) (runbook question F15).

Scope: `services/api/Dockerfile`, `services/api/docker-start.sh`, `.dockerignore`, `render.yaml` (both API services only), one build-only workflow, this report, one CLAUDE.md bullet. No application code, schema, static site, `preDeployCommand`, plan or region was changed. `docs/deployment.md` and the runbook were NOT edited (see "Docs changes R92 must make").

Open step 0: `origin/main` was `59016bc`. No open PR touched `render.yaml` at the time of the check in the earlier part of this session. Docker was available (Docker Desktop started during the session).

## 1. Dockerfile: stages and why

Build context is the REPOSITORY ROOT (`dockerContext: .`), because the repo is one npm-workspaces tree with one lockfile and `npm ci --workspace=services/api` validates the whole lockfile.

| Stage | Base | What it does | Why |
|---|---|---|---|
| `build` | `node:22.22.0-bookworm-slim` (`ARG NODE_VERSION`) | copies the lockfile and every workspace `package.json`, `npm ci --workspace=services/api`, copies `services/api`, runs `npm run prisma:generate` and `npm run build --workspace=services/api` | Node 22.22.0 satisfies root `engines` (`>=22.22.0`) and equals CI. openssl is installed so Prisma picks the `debian-openssl-3.0.x` engine. |
| `prod-deps` | same | `npm ci --workspace=services/api --omit=dev`, then copies `.prisma`, `prisma` and `@prisma` from `build` and links `.bin/prisma` | Prisma CLI is a devDependency but the UNCHANGED `preDeployCommand` runs `npx prisma migrate deploy`; without the copy `npx` would download the latest Prisma (v7), not the locked 5.22.0. |
| `runtime` | same | installs `ffmpeg openssl ca-certificates tini` from Debian, copies `node_modules`, `services/api/dist`, `services/api/prisma`, runs as the `node` user, `ENTRYPOINT tini`, `CMD services/api/docker-start.sh` | ffmpeg also provides ffprobe. tini is PID 1 so SIGTERM reaches node. Layout mirrors the repo and `WORKDIR` is `/app`, so the `preDeployCommand` paths (`--schema=services/api/prisma/schema.prisma`, `node services/api/dist/scripts/backfill-dob-encryption.js`) work unchanged. |

`.dockerignore` keeps the context small: it excludes `.git`, `node_modules`, `dist`, `docs`, `e2e`, `.github`, `.env*`, all `apps/**` and `packages/**` except their `package.json` files (needed so the lockfile validates), `services/api/test` and `geoip`, and `*.spec.ts`.

ffmpeg version in the image: **5.1.9-0+deb12u1** (Debian bookworm package; ffprobe the same).

## 2. GeoLite2 choice (DEFAULT, founder-veto-able)

Chosen: **fetch at container start**, not at build. `docker-start.sh` runs `node dist/scripts/fetch-geolite2.js &` in the background and then `exec node dist/main.js`.

Reason: build args are visible in image history and Render turns service env vars into build args, so MaxMind keys used at build would end up in layers. At start they are plain runtime variables. The script already exits 0 without keys (logs, writes nothing), so "no keys: logs, exits 0, lookups unresolved (the stronger control applies)" is preserved. `GeoIpService` already retries opening the file once a minute and reloads when the file changes, so the API serves from the first second and starts resolving as soon as the download lands. Cost: the database is downloaded on every container start, including every restart and every deploy.

Proof: `docker history --no-trunc` and `docker inspect` of the final image contain 0 matches for the test MaxMind keys; the container run with fake keys reported a failed download and kept running.

## 3. render.yaml: diff in words

For BOTH API services (`soccernity-api-staging`, `soccernity-api`): `runtime: node` became `runtime: docker`; added `dockerfilePath: ./services/api/Dockerfile` and `dockerContext: .`; removed `buildCommand` and `startCommand` (a Docker service cannot have a build command; the start command is the Dockerfile `CMD`); removed the "No rootDir" comment; replaced the two "ffmpeg NOT installed" comments; updated the MaxMind / `GEOLITE2_DB_PATH` comments and the header GEOLITE2 paragraph to say start-time fetch. Name, branch, region, plan, every env var, `healthCheckPath` and `preDeployCommand` are exactly as before. The four static sites are untouched. `render.yaml` parses (js-yaml) and `env-completeness.spec.ts` plus `render-static-sites.spec.ts` pass (66 tests).

Keys checked against Render's Blueprint specification and Docker documentation read on **2026-11-15**: `runtime: docker`, `dockerfilePath`, `dockerContext` are documented; "You can't set a build command for services that use Docker". Limit of that reading: the Blueprint-spec page returned truncated (39,953 of 55,062 characters), so the tail of the page was not read.

## 4. What was proven, and how

- Image builds: `soccernity-api` 1.42 GB (ffmpeg layer about 475 MB, `node_modules` about 352 MB).
- Runtime image: ffmpeg/ffprobe 5.1.9-0+deb12u1, `sharp` loads, runs as `node` (not root), tini PID 1.
- Real ffmpeg spec (`ffmpeg-media-processor.real.spec.ts` and its sibling): 2 suites, **18 tests passed**, run against the image's ffmpeg (inside the build-stage image with Debian ffmpeg 5.1.9; same package as runtime, not by exec in the runtime image).
- Prisma CLI in the image resolves to the locked 5.22.0 via `npx`, offline.
- The exact `preDeployCommand` ran successfully from `WORKDIR /app` against a throwaway Postgres (migrations plus DOB backfill).
- Container started with minimal env plus throwaway Postgres and Redis: `/health` returned 200 `{"status":"ok","database":"connected"}`.
- MaxMind fail-safe: with fake keys the fetch failed, exit 0, API kept running.
- CI job added (below), actionlint clean.

## 5. CI: build-only job (DEFAULT, founder-veto-able)

`.github/workflows/docker-build.yml`, separate workflow so no existing job changed. Triggers: push and pull_request on `main`/`staging`, only for `services/api/Dockerfile`, `services/api/docker-start.sh`, `.dockerignore`, `render.yaml` or the workflow itself. Permissions `contents: read`. Builds the image (no push, no deploy), checks `ffmpeg -version` and `ffprobe -version`, checks the user is not root. Not a required check.

## 6. What could NOT be proven

- A real Render deploy. No account configuration exists (Render is deliberately not configured); the Blueprint was not imported.
- Whether the **free plan** allows the Docker runtime. The documentation read did not say; staging is on `plan: free`. If Render refuses it, staging needs a paid plan or a different arrangement.
- `preDeployCommand` under Docker on Render: paid-only already, runs on a separate instance from the image; its working directory under Docker is not documented. It is unchanged; F2 (staging free plan) stays open.
- Render's `PORT` behaviour for Docker services: not on the pages fetched. The app reads `process.env.PORT ?? 3000`; the local test used `PORT=10000`.
- MaxMind rate limits for a download on every start: unverified.
- The CI job has not run on GitHub.

## 7. Docs changes R92 must make

Not edited here, as instructed. Every now-wrong sentence and its replacement fact:

1. Any sentence saying the API runs on Render's **native Node runtime** (`docs/deployment.md`, runbook Part 4): it now builds from `services/api/Dockerfile` (`runtime: docker`, `dockerContext: .`); there is no `buildCommand` or `startCommand`.
2. Any sentence saying **"ffmpeg/ffprobe not installed"**, or that video uploads fail with 503 because the host lacks them (`deployment.md`, runbook step 6.x and Part 10): they are installed in the image (5.1.9-0+deb12u1) and on PATH; the 503 can still occur if they were missing, and the real spec proves they work.
3. **Runbook F15** (ffmpeg on the host / video hosting): answered by the Docker image; what stays open is whether the free staging plan accepts the Docker runtime.
4. The **GeoLite2 description** ("downloaded at build"): it is fetched at container start; keys are runtime variables; downloaded on every start.
5. The runbook note that the **Node version** is not pinned: the image pins 22.22.0.
6. Add: how to read the Docker build log on Render, and that a first deploy builds the image (slower than the native build).

## 8. Defaults chosen (all founder-veto-able)

Base image `node:22.22.0-bookworm-slim`; Debian distro ffmpeg (not a static build); tini; non-root `node` user; GeoLite2 at container start; Prisma CLI copied from the build stage; separate workflow file for the build-only job and not a required check.
