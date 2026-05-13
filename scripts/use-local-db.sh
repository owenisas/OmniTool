#!/bin/bash
# Switch to local Docker Postgres for development
# Usage: source scripts/use-local-db.sh

LOCAL_URL="postgresql://postgres:postgres@localhost:5432/omnitool?schema=public"

# Update packages/database/.env (Prisma reads from here)
cat > packages/database/.env << EOF
DATABASE_URL="${LOCAL_URL}"
DIRECT_URL="${LOCAL_URL}"
EOF

# Update apps/web/.env DATABASE_URL lines
sed -i '' 's|^DATABASE_URL=.*|DATABASE_URL="'"${LOCAL_URL}"'"|' apps/web/.env 2>/dev/null
sed -i '' 's|^DIRECT_URL=.*|DIRECT_URL="'"${LOCAL_URL}"'"|' apps/web/.env 2>/dev/null

echo "✓ Switched to LOCAL database (Docker Postgres on localhost:5432)"
echo "  Make sure Docker is running: docker compose up -d postgres"
