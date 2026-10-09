/**
 * Server-side Supabase client. SERVER ONLY: it uses the secret (service role) key,
 * which bypasses RLS, so never import this from a client component.
 * Works with either the legacy service_role JWT or a new "sb_secret_..." key.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DbError } from "./errors";

let client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new DbError(
      "NOT_CONFIGURED",
      "Saving is not set up yet. Add the Supabase URL and secret key to .env.local.",
    );
  }
  // No user sessions on the server: we act as the app itself, not as a signed-in user.
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
