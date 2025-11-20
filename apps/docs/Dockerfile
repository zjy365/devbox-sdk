# Dockerfile for Next.js app in npm workspaces monorepo
# MUST be built from the monorepo root directory:
# docker build --platform linux/amd64 -f apps/docs/Dockerfile -t devbox-docs:latest .

FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY apps/docs/package.json ./apps/docs/

# Install all dependencies (respects workspaces)
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/docs/node_modules ./apps/docs/node_modules

# Copy only the docs app source
COPY apps/docs ./apps/docs
COPY package.json package-lock.json ./

# Build the docs app
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/docs
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/docs/public ./apps/docs/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# The server.js path in standalone output
CMD ["node", "apps/docs/server.js"]
