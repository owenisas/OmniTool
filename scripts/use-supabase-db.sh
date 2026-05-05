#!/bin/bash
# Switch to Supabase (production) database
# Usage: source scripts/use-supabase-db.sh

POOLER_URL="postgresql://postgres.irtrdplptcxvdbzabjri:Zvmaj24BUPSTSGNg@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.irtrdplptcxvdbzabjri:Zvmaj24BUPSTSGNg@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"

# Update packages/database/.env
cat > packages/database/.env << EOF
DATABASE_URL="${POOLER_URL}"
DIRECT_URL="${DIRECT_URL}"
EOF

# Update apps/web/.env DATABASE_URL lines
sed -i '' 's|^DATABASE_URL=.*|DATABASE_URL="'"${POOLER_URL}"'"|' apps/web/.env 2>/dev/null
sed -i '' 's|^DIRECT_URL=.*|DIRECT_URL="'"${DIRECT_URL}"'"|' apps/web/.env 2>/dev/null

echo "✓ Switched to SUPABASE database (production)"
echo "  ⚠️  You are now connected to PRODUCTION — be careful with destructive operations"
