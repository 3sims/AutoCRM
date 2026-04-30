# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests
COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/events/package.json ./packages/events/
COPY packages/utils/package.json ./packages/utils/

# Install deps
RUN npm install --workspaces

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Build API
WORKDIR /app/apps/api
RUN npx nest build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/events/package.json ./packages/events/
COPY packages/utils/package.json ./packages/utils/

RUN npm install --workspaces --production

COPY --from=builder /app/apps/api/dist ./apps/api/dist

RUN mkdir -p /app/uploads/vehicles

EXPOSE 4000
CMD ["node", "apps/api/dist/main"]
