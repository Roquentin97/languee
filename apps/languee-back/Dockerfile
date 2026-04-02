# syntax=docker/dockerfile:1

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies (leverage layer caching)
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source and build
COPY --chown=node:node . .
RUN yarn build

# ─── Stage 2: production ─────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copy compiled output from builder
COPY --chown=node:node --from=builder /app/dist ./dist

# Run as non-root node user
USER node

EXPOSE 3000

CMD ["node", "dist/main"]
