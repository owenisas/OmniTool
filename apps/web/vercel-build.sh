#!/usr/bin/env bash
# ============================================================================
# vercel-build.sh — Vercel build entry point for apps/web
#
# This script is the build command for deploying to Vercel.
# It generates the Prisma client and then builds the Next.js app.
#
# Usage in vercel.json or Vercel dashboard:
#   Build Command: bash apps/web/vercel-build.sh
# ============================================================================

set -euo pipefail

echo "==> Generating Prisma client..."
pnpm db:generate

echo "==> Building Next.js app..."
pnpm --filter @omnitool/web build

echo "==> Build complete."
