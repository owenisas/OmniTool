# =============================================================================
# Multi-stage Dockerfile for OmniTool web app (Next.js standalone output)
# Optimized for small image size, fast builds, and security.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Dependencies — install all node_modules
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Required for Prisma and native modules (sharp, etc.)
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Install pnpm globally (matches packageManager field)
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# Copy lockfile and workspace config first for optimal layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy all package.json files to resolve workspace dependencies
COPY apps/web/package.json ./apps/web/
COPY apps/desktop/package.json ./apps/desktop/
COPY packages/database/package.json ./packages/database/
COPY packages/ui/package.json ./packages/ui/
COPY packages/ai/package.json ./packages/ai/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/coding-sessions/package.json ./packages/coding-sessions/
COPY packages/shared/package.json ./packages/shared/
COPY packages/sync/package.json ./packages/sync/

# Install all dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build — compile the application
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.27.0 --activate

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/desktop/node_modules ./apps/desktop/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/packages/ai/node_modules ./packages/ai/node_modules
COPY --from=deps /app/packages/integrations/node_modules ./packages/integrations/node_modules
COPY --from=deps /app/packages/coding-sessions/node_modules ./packages/coding-sessions/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/sync/node_modules ./packages/sync/node_modules

# Copy source code
COPY . .

# Generate Prisma client (needs the schema file and DATABASE_URL for validation)
# Using a dummy URL since we only need the generated types at build time
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/omnitool?schema=public"

RUN pnpm db:generate

# Build argument: inject version at build time (git SHA from CI)
ARG NEXT_PUBLIC_APP_VERSION=""
ENV NEXT_PUBLIC_APP_VERSION=${NEXT_PUBLIC_APP_VERSION}

# Enable standalone output mode — produces a minimal self-contained server
ENV NEXT_OUTPUT="standalone"

# Build the web app (turbo will build dependencies first)
RUN pnpm turbo run build --filter=@omnitool/web

# ---------------------------------------------------------------------------
# Stage 3: Production — minimal runtime image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone output (includes server.js and required node_modules)
COPY --from=builder /app/apps/web/.next/standalone ./

# Copy static assets (not included in standalone output)
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Copy public directory (favicon, PWA manifest icons, etc.)
COPY --from=builder /app/apps/web/public ./apps/web/public

# Set correct ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

# Next.js collects telemetry by default — disable in production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

# The standalone output places server.js at the app root or inside apps/web
# Adjust path based on your Next.js standalone output structure
CMD ["node", "apps/web/server.js"]
