import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase admin client with service role key.
 * Use for user management operations (creating users, etc.).
 * NEVER expose this client to the browser.
 */
export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
