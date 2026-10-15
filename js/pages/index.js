/* v4 登入/註冊頁 */
import { supabase, getUser, signInWithGoogle } from "../core/supabase.js";
import { applyTimeBg, toast } from "../core/ui.js?v=fixed001";

applyTimeBg();

const fb = document.getElementById("login-fb");
const btnLogin = document.getElementById("btn-login");
const formLogin = document.getElementById("form-login");
const authSwitch = document.getElementById("auth-switch");
const authSwitchText = document.getElementById("auth-switch-text");
let mode = "login"; // login | signup

function setFb(msg, isErr) {
  fb.textContent = msg;
  fb.className = "fb" + (isErr ? " err" : "");
}

/* 切換登入/註冊 */
authSwitch.onclick = (e) => {
  e.preventDefault();
  if (mode === "login") {
    mode = "signup";
    btnLogin.textContent = "註冊";
    authSwitchText.textContent = "已有帳號？";
    authSwitch.textContent = "登入";
    document.getElementById("f-password").setAttribute("autocomplete", "new-password");
  } else {
    mode = "login";
    btnLogin.textContent = "登入";
    authSwitchText.textContent = "還沒有帳號？";
    authSwitch.textContent = "註冊";
    document.getElementById("f-password").setAttribute("autocomplete", "current-password");
  }
  setFb("", false);
};

/* 已登入直接跳學習頁 */
getUser().then(u => {
  if (u) window.location.href = "dashboard.html";
}).catch(() => {});

/* Google 登入 */
document.getElementById("btn-google").onclick = async () => {
  try {
    await signInWithGoogle();
  } catch (e) {
    setFb("Google 登入失敗：" + e.message, true);
  }
};

/* 帳密登入/註冊 */
document.getElementById("form-login").onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById("f-email").value.trim();
  const password = document.getElementById("f-password").value;
  if (!email || !password) { setFb("請輸入電子郵件和密碼", true); return; }
  if (mode === "signup" && password.length < 6) { setFb("密碼至少 6 個字元", true); return; }
  btnLogin.disabled = true;
  setFb("", false);
  try {
    let data, error;
    if (mode === "signup") {
      ({ data, error } = await supabase.auth.signUp({ email, password }));
      if (error) throw error;
      if (data.user && !data.session) {
        setFb("註冊成功！請檢查信箱驗證後再登入", false);
        btnLogin.disabled = false;
        return;
      }
    } else {
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
      if (error) throw error;
    }
    if (data.user) {
      /* 確保 profiles 存在 */
      let needOnboarding = false;
      try {
        const { data: p } = await supabase.from("profiles").select("id, onboarded").eq("id", data.user.id).single();
        if (!p) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            name: email.split("@")[0],
            email: email,
            points: 0,
            onboarded: false,
          });
          needOnboarding = true;
        } else {
          needOnboarding = !p.onboarded;
        }
      } catch (_) {
        needOnboarding = true;
      }
      /* 新用戶先走新手指引 */
      window.location.href = needOnboarding ? "onboarding.html" : "dashboard.html";
    }
  } catch (err) {
    let msg = "登入失敗，請稍後再試";
    if (/Invalid login credentials/i.test(err.message)) msg = "帳號或密碼錯誤";
    else if (/User already registered/i.test(err.message)) msg = "此信箱已註冊，請直接登入";
    else if (/Email not confirmed/i.test(err.message)) msg = "信箱尚未驗證，請檢查驗證信";
    setFb(mode === "signup" && msg === "登入失敗，請稍後再試" ? "註冊失敗：" + err.message : msg, true);
    btnLogin.disabled = false;
  }
};
