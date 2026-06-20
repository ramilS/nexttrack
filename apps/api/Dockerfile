# =============================================================================
# Multi-stage Dockerfile for NestJS API (pnpm monorepo)
# Build context: monorepo root (not apps/api)
#
#   docker build -f apps/api/Dockerfile -t next-track-api .
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: base — Alpine + pnpm via corepack
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# ---------------------------------------------------------------------------
# Stage 2: deps — Install ALL dependencies (needed for build)
# ---------------------------------------------------------------------------
FROM base AS deps

# Copy only the files pnpm needs to resolve the workspace and install deps.
# This layer is cached until any of these files change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

# apps/api runs `prisma generate` in its postinstall hook, which fires during
# `pnpm install`, so the schema + Prisma config must already be on disk here.
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 3: build — Compile shared package, generate Prisma, build API
# ---------------------------------------------------------------------------
FROM deps AS build

# Copy shared package source and build it
COPY packages/shared/ packages/shared/
RUN pnpm --filter @repo/shared run build

# Copy Prisma schema and generate client
COPY apps/api/prisma/ apps/api/prisma/
RUN pnpm --filter api run prisma:generate

# Copy API source and config files (no tests, no .env)
COPY apps/api/src/ apps/api/src/
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/nest-cli.json apps/api/

# Build the API
RUN pnpm --filter api run build

# Prune dev dependencies to get production-only node_modules
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Stage 4: migrator — one-shot `prisma migrate deploy`.
# Runs from the full `deps` stage: the prisma CLI, prisma.config.ts (datasource
# url) and dotenv are devDependencies, absent from the pruned runtime image.
# Consumed by the compose `migrate` init service; the API container itself never
# migrates, so the runtime image stays lean.
# ---------------------------------------------------------------------------
FROM deps AS migrator

COPY apps/api/prisma/ apps/api/prisma/
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# Stage 5: production — Minimal runtime image
# ---------------------------------------------------------------------------
FROM node:22-alpine AS production

RUN apk add --no-cache curl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy production node_modules from build stage
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/apps/api/node_modules/ ./apps/api/node_modules/
COPY --from=build /app/packages/shared/dist/ ./packages/shared/dist/
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json

# Copy compiled API
COPY --from=build /app/apps/api/dist/ ./apps/api/dist/

# Copy the generated Prisma client (lives inside node_modules/.prisma)
COPY --from=build /app/node_modules/.prisma/ ./node_modules/.prisma/
COPY --from=build /app/node_modules/@prisma/ ./node_modules/@prisma/

# Copy workspace root package.json (Node may need it for module resolution)
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/package.json ./package.json

# Run as non-root
USER node

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

WORKDIR /app/apps/api

CMD ["node", "dist/main"]
