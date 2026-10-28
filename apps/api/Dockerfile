# Build context: the repository root (see docker-compose.yml).

FROM node:22-bookworm-slim AS base
ENV NX_DAEMON=false \
    NX_NO_CLOUD=true
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /workspace

# --- Build: install the workspace, then bundle and prune the API with Nx ---
FROM base AS build

# Manifests first, so dependency installation is cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/web-e2e/package.json apps/web-e2e/
COPY packages/shared/models/package.json packages/shared/models/
RUN pnpm install --frozen-lockfile

COPY . .
# Production bundle plus a pruned package.json/lockfile with only the API's
# runtime dependencies (apps/api/dist).
RUN pnpm nx run @pet-adoption/api:prune

# --- Runtime: the bundle and production dependencies only ---
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /workspace/apps/api/dist ./
# The pruned pnpm-workspace.yaml carries the root's build settings (e.g.
# argon2 uses its prebuilt binaries instead of an install script).
RUN pnpm install --prod --frozen-lockfile \
    && mkdir -p /app/uploads \
    && chown node:node /app/uploads

USER node
EXPOSE 3333
CMD ["node", "main.js"]
