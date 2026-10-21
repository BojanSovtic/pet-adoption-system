# Build context: the repository root (see docker-compose.yml).

FROM node:22-bookworm-slim AS build
ENV NX_DAEMON=false \
    NX_NO_CLOUD=true
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /workspace

# Manifests first, so dependency installation is cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/web-e2e/package.json apps/web-e2e/
COPY packages/shared/models/package.json packages/shared/models/
RUN pnpm install --frozen-lockfile

COPY . .
# Baked into the bundle at build time. The browser calls the API, so this must
# be an address the browser can reach (not the Docker service name).
ARG VITE_API_URL=http://localhost:3333/api
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm nx build @pet-adoption/web

# --- Runtime: static files served by nginx ---
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist/apps/web /usr/share/nginx/html
EXPOSE 80
