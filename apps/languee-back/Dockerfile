# syntax=docker/dockerfile:1

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

# ─── Stage 4: production ─────────────────────────────────────────────────────
FROM node:22-alpine AS production

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
