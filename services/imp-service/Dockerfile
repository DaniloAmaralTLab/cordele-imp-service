# syntax=docker/dockerfile:1.7
# imp-service — O Cordelê é uma plataforma SaaS B2B para transformar manuscritos, textos e arquivos Markdown em publicações digitais ePub válidas, sem necessidade de diagramação manual ou ferramentas técnicas especializadas.
# Build context: backend/ (pnpm workspace root).

ARG NODE_VERSION=22
ARG SERVICE=imp-service
ARG PNPM_VERSION=9.15.4

# ---------------------------------------------------------------------------
# Stage 1 — deps: resolve the whole workspace from the lockfile only.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
ARG SERVICE
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /workspace

# Manifests first: this layer is invalidated only when a dependency changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/${SERVICE}/package.json services/${SERVICE}/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "./services/${SERVICE}..."

# ---------------------------------------------------------------------------
# Stage 2 — builder: generate the Prisma client, then compile to dist/.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS builder
ARG SERVICE
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate \
    && apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/services/${SERVICE}/node_modules ./services/${SERVICE}/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY services/${SERVICE}/ services/${SERVICE}/

WORKDIR /workspace/services/${SERVICE}
# D-545: the client is generated at build time so the runtime stage never needs
# the Prisma CLI or network access.
RUN pnpm exec prisma generate
RUN pnpm run build

# `pnpm deploy` flattens the workspace symlink farm into a self-contained
# directory with production dependencies only. A plain COPY of node_modules
# would carry pnpm's symlinks into /app, where their targets no longer exist.
WORKDIR /workspace
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter "./services/${SERVICE}" deploy --prod /prod/app

# ---------------------------------------------------------------------------
# Stage 3 — runtime: slim, non-root, production dependencies only.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ARG SERVICE
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=UTC
# main.ts calls setGlobalPrefix('api'), so the probe path carries the prefix.
ENV HEALTH_PATH=/api/health

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# node:*-slim already ships an unprivileged `node` user (uid 1000).
# /prod/app is the `pnpm deploy` bundle: package.json, dist/, prisma/ and a
# flat, production-only node_modules.
COPY --from=builder --chown=node:node /prod/app ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+process.env.HEALTH_PATH).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# dumb-init reaps zombies and forwards SIGTERM so Nest can shut down gracefully.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
