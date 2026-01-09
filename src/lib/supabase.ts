import { createClient } from "@supabase/supabase-js";

/**
 * Vite only exposes env vars prefixed with VITE_ at build time.
 * In some deployments, values may accidentally include quotes or trailing spaces/newlines
 * (e.g. when copying from .env files or dashboards). We sanitize them to avoid 401.
 */
function sanitizeEnv(v?: string): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  // remove wrapping single/double quotes if present
  return trimmed.replace(/^['"]|['"]$/g, "");
}

// Primary names (recommended)
const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Backward-compatible aliases (if someone used different names in the past)
const rawUrlAlt = (import.meta.env as any).VITE_SUPABASE_PROJECT_URL as string | undefined;
const rawKeyAlt = (import.meta.env as any).VITE_SUPABASE_KEY as string | undefined;

const supabaseUrl = sanitizeEnv(rawUrl ?? rawUrlAlt);
const supabaseAnonKey = sanitizeEnv(rawAnonKey ?? rawKeyAlt);

// Observação: se você abrir o app sem as env vars configuradas, ele roda, mas sem persistência.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const isSupabaseConfigured = Boolean(supabase);
