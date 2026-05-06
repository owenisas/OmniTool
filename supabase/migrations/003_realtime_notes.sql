-- Enable Postgres logical replication for the notes-collaboration tables so
-- the Supabase Realtime listeners (`apps/web/lib/notes/use-realtime.ts`) get
-- INSERT / UPDATE / DELETE events. Idempotent: each ADD TABLE is wrapped in
-- a DO block that swallows the "already in publication" error.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.note_comments;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.note_mentions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
