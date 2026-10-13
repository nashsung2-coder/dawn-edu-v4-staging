/* v4 設定頁 */
import { supabase, getProfile, signOut } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js";

await renderTopbar("settings.html");
const user = await requireAuth();
await ensureProfile(supabase, user);
const view = document.getElementById("settings-view");

function fb(id, msg, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "var(--signal-green)" : "var(--signal-red)";
  el.style.fontSize = "13px";
  el.style.marginTop = "8px";
}

try {
  const profile = await getProfile(user.id);

  view.innerHTML = `<div class="grid">
    <div class="card span6">
      <h2>個人資料</h2>
      <div class="field">
        <label>電子郵件</label>
        <div style="font-family:var(--font-mono);font-size:14px;">${esc(profile.email || user.email || "")}</div>
      </div>
      <div class="field">
        <label>星砂</label>
        <div class="num-sm">${(profile.points ?? 0).toLocaleString()}</div>
      </div>
      <div class="field">
        <label for="s-name">暱稱</label>
        <input class="input" id="s-name" value="${esc(profile.name || "")}" maxlength="32">
      </div>
      <button class="btn btn-primary" id="s-save-name">儲存暱稱</button>
      <div id="s-name-fb"></div>
    </div>

    <div class="card span6">
      <h2>修改密碼</h2>
      <div class="field">
        <label for="s-pw">新密碼</label>
        <input class="input" id="s-pw" type="password" autocomplete="new-password" placeholder="至少 6 個字元">
      </div>
      <div class="field">
        <label for="s-pw2">確認新密碼</label>
        <input class="input" id="s-pw2" type="password" autocomplete="new-password">
      </div>
      <button class="btn btn-primary" id="s-save-pw">修改密碼</button>
      <div id="s-pw-fb"></div>
    </div>

    <div class="card span6">
      <h2>匯出</h2>
      <p class="label" style="margin-bottom:12px;">下載你的學習歷程（JSON）</p>
      <button class="btn btn-ghost" id="s-export">匯出學習歷程</button>
      <div id="s-export-fb"></div>
    </div>

    <div class="card span6">
      <h2>帳號</h2>
      <button class="btn btn-ghost" id="s-logout" style="border-color:var(--signal-red);color:var(--signal-red);">登出</button>
    </div>
  </div>`;

  /* 改名 */
  document.getElementById("s-save-name").onclick = async () => {
    const name = document.getElementById("s-name").value.trim();
    if (!name) { fb("s-name-fb", "請輸入暱稱", false); return; }
    try {
      const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
      if (error) throw error;
      fb("s-name-fb", "已儲存", true);
      toast("暱稱已更新");
    } catch (e) {
      fb("s-name-fb", "儲存失敗：" + e.message, false);
    }
  };

  /* 改密碼 */
  document.getElementById("s-save-pw").onclick = async () => {
    const pw = document.getElementById("s-pw").value;
    const pw2 = document.getElementById("s-pw2").value;
    if (pw.length < 6) { fb("s-pw-fb", "密碼至少 6 個字元", false); return; }
    if (pw !== pw2) { fb("s-pw-fb", "兩次輸入不一致", false); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      document.getElementById("s-pw").value = "";
      document.getElementById("s-pw2").value = "";
      fb("s-pw-fb", "密碼已修改", true);
    } catch (e) {
      fb("s-pw-fb", "修改失敗：" + e.message, false);
    }
  };

  /* 匯出 */
  document.getElementById("s-export").onclick = async () => {
    fb("s-export-fb", "匯出中…", true);
    try {
      const [battles, textbooks, cards] = await Promise.all([
        supabase.from("battle_records").select("*").eq("user_id", user.id),
        supabase.from("textbook_entries").select("*").eq("user_id", user.id),
        supabase.from("review_cards").select("*").eq("user_id", user.id),
      ]);
      const data = {
        exported_at: new Date().toISOString(),
        profile: { name: profile.name, email: profile.email, points: profile.points },
        battle_records: battles.data || [],
        textbook_entries: textbooks.data || [],
        review_cards: cards.data || [],
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dawn-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      fb("s-export-fb", "匯出完成", true);
    } catch (e) {
      fb("s-export-fb", "匯出失敗：" + e.message, false);
    }
  };

  /* 登出 */
  document.getElementById("s-logout").onclick = signOut;

} catch (e) {
  console.error(e);
  view.innerHTML = `<div class="state-empty">
    <p>載入失敗，請重試</p>
    <button class="btn btn-primary" onclick="location.reload()">重試</button></div>`;
}
