import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zwosvlldbhdhnbkqiaqa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3b3N2bGxkYmhkaG5ia3FpYXFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NDQ5MjIsImV4cCI6MjA4MTEyMDkyMn0.7V6_UQ1xsBJwvhRf-SFGs4s53FT13CziulKiDL9QgHc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
