/* v4 核心：Supabase client（用本地 UMD，不依賴 CDN） */
const { createClient } = window.supabase;

const SUPABASE_URL = "https://bcdanvmuffxgtezopyib.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjZGFudm11ZmZ4Z3Rlem9weWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3OTEzNTMsImV4cCI6MjEwNzM2NzM1M30.EZtkULSRB_qwVyDl86MOhGf_ihKAAMy7q3fwuKYX0JI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/pages/learn.html" }
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}
