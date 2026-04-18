// O app não fala mais com Postgres. Toda persistência passa pela Edge Function
// `sheets-sync` (vê src/lib/sheetsClient.ts), que escreve no Google Sheets.
// Mantemos esta flag por compat: indica se o Lovable Cloud está disponível
// para hospedar a Edge Function.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);

// Não há mais cliente Postgres. Mantemos `null` para evitar imports quebrados.
export const supabase = null as unknown as null;
