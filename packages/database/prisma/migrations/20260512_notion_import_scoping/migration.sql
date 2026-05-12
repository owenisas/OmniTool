-- Scope Notion import de-duping to active notes inside a teamspace.
-- The original unique index made a Notion page globally importable only once,
-- including soft-deleted notes. Teamspaces should be able to import the same
-- source page independently, and deleting an import should allow re-import.

DROP INDEX IF EXISTS "notes_notionPageId_key";

CREATE INDEX IF NOT EXISTS "notes_teamId_notionPageId_idx"
  ON "notes"("teamId", "notionPageId");

CREATE UNIQUE INDEX IF NOT EXISTS "notes_teamId_notionPageId_active_key"
  ON "notes"("teamId", "notionPageId")
  WHERE "teamId" IS NOT NULL
    AND "notionPageId" IS NOT NULL
    AND "deletedAt" IS NULL;
