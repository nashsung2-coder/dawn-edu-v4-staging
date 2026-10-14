/* v4 核心：Supabase client（用本地 UMD，不依賴 CDN） */
const { createClient } = window.supabase;

const SUPABASE_URL = "https://bcdanvmuffxgtezopyib.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjZGFudm11ZmZ4Z3Rlem9weWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3OTEzNTMsImV4cCI6MjEwNzM2NzM1M30.EZtkULSRB_qwVyDl86MOhGf_ihKAAMy7q3fwuKYX0JI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* 處理 OAuth callback：如果 URL 有 access_token，手動 setSession */
(function handleOAuthCallback() {
  try {
    if (window.location.hash && window.location.hash.includes("access_token=")) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token }).then(() => {
          /* 清除 URL fragment */
          window.history.replaceState(null, "", window.location.pathname);
        }).catch(() => {});
      }
    }
  } catch (e) {}
})();

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
