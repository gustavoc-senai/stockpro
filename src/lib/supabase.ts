import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local.",
  );
}

if (supabaseKey.startsWith("sb_secret_"))
  throw new Error("Use apenas a chave pública do Supabase no frontend.");
if (supabaseKey.startsWith("eyJ")) {
  let role: string | undefined;
  try {
    role = (
      JSON.parse(
        atob(
          supabaseKey.split(".")[1].replaceAll("-", "+").replaceAll("_", "/"),
        ),
      ) as { role?: string }
    ).role;
  } catch {
    /* Supabase reports malformed keys. */
  }
  if (role === "service_role")
    throw new Error("Chaves service_role não são permitidas no frontend.");
}
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
