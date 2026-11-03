# syntax=docker/dockerfile:1

ARG APP_VERSION=0.1.0-dev
ARG GIT_SHA=unknown
ARG BUILD_ID=unknown

# ─── Stage 1: dependencies ───────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Install dependencies (leverage layer caching)
COPY --chown=node:node package.json yarn.lock ./
RUN chown node:node /app
USER node
RUN yarn install --frozen-lockfile

# ─── Stage 2: development ────────────────────────────────────────────────────
FROM deps AS development

WORKDIR /app

ENV CHOKIDAR_USEPOLLING=true \
    WATCHPACK_POLLING=true

EXPOSE 3000

CMD ["yarn", "start:dev"]

# ─── Stage 3: builder ────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Copy source and build
COPY --chown=node:node . .
RUN yarn prisma generate && yarn build

# ─── Stage 3b: migrator ──────────────────────────────────────────────────────
# Deploy-time migration runner: full node_modules (prisma CLI) plus the schema
# and migrations, without app source. Prisma 7 reads the datasource URL from
# prisma.config.ts (DATABASE_URL at run time), so the image must carry it.
# Published alongside the production image.
FROM deps AS migrator

ARG APP_VERSION
ARG GIT_SHA
ARG BUILD_ID
ENV APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA} \
    BUILD_ID=${BUILD_ID}
LABEL org.opencontainers.image.version=${APP_VERSION} \
      org.opencontainers.image.revision=${GIT_SHA} \
      org.opencontainers.image.build-id=${BUILD_ID}

WORKDIR /app

COPY --chown=node:node prisma.config.ts ./prisma.config.ts
COPY --chown=node:node prisma ./prisma

CMD ["yarn", "prisma", "migrate", "deploy"]

# ─── Stage 4: production ─────────────────────────────────────────────────────
FROM node:22-alpine AS production

ARG APP_VERSION
ARG GIT_SHA
ARG BUILD_ID
ENV APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA} \
    BUILD_ID=${BUILD_ID}
LABEL org.opencontainers.image.version=${APP_VERSION} \
      org.opencontainers.image.revision=${GIT_SHA} \
      org.opencontainers.image.build-id=${BUILD_ID}

WORKDIR /app

# Install only production dependencies
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copy compiled output from builder
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Run as non-root node user
USER node

EXPOSE 3000

CMD ["node", "dist/src/main"]
