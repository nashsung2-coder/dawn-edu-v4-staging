/* 平台導引彈窗：首次打開的完整介紹（必須讀完確認才能關閉），
   之後可從「家」的快捷入口重新打開 */

const GUIDE_PAGES = [
  {
    title: "歡迎來到曙光學習",
    body: `
      <p>嗨，我是<b>小曙</b>，你的學習陪伴者！</p>
      <p>這裡跟其他學習 App 不一樣：我不會直接丟答案給你，而是陪你走完一整個學習循環——從好奇，到想通，到真正記住。</p>
      <p style="color:var(--paper-400);font-size:13px;">花一分鐘，我帶你認識這個地方。請把五頁都讀完，才能開始使用喔。</p>`,
  },
  {
    title: "認識四個地方",
    body: `
      <p><b>曙光寶庫</b>——你的知識老家。課本的、文化的、好玩的，什麼都可以收藏。以後的學習都從這裡出發。</p>
      <p><b>情境式學習</b>——化身成某個角色，親身經歷一個概念。比如當唐朝農民學租庸調，用身體記住知識。</p>
      <p><b>知識對戰＋複習</b>——AI 出題考你，答錯會告訴你卡在哪個迷思；再用間隔重複，在你快忘記時提醒複習。</p>
      <p><b>街機</b>——學累了就去打電動，射擊答題，玩著玩著就複習了。</p>`,
  },
  {
    title: "主控台就是我家",
    body: `
      <p>我住在<b>主控台</b>。你隨時可以直接跟我說話：問我問題、讓我推薦今天學什麼、幫你安排這週的學習計畫。我還會主動提醒你該複習的東西。</p>
      <p>對了，每一頁的最下面都有<b>學習歷程</b>——點開可以看到當時的完整紀錄、回到當時的進度。同一個主題的各種學習會自動整理在一起。</p>`,
  },
  {
    title: "選用功能",
    body: `
      <p>有些功能不是每個人都需要，預設是關的，你隨時可以在<b>設定</b>裡開關：</p>
      <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;background:var(--wash-04);border:1px solid var(--wash-10);border-radius:12px;padding:12px;margin-top:8px;">
        <input type="checkbox" id="guide-classroom" style="width:18px;height:18px;accent-color:var(--brass-400);margin-top:2px;flex:none;">
        <span><b>Google Classroom 整合</b><br>
        <span style="font-size:13px;color:var(--paper-400);">在主控台顯示待交作業、同步到學習排程。啟用後到主控台按「連結 Classroom」授權（唯讀，不會動到你的課程資料）。</span></span>
      </label>`,
  },
  {
    title: "準備好了",
    body: `
      <p>導引讀完了！從主控台跟我說話，或直接去逛逛：</p>
      <p style="color:var(--paper-400);font-size:13px;">按「我了解了」之後，小曙會在主控台等你，隨時給你下一步的建議。</p>`,
  },
];

/**
 * 顯示平台導引彈窗。必須按下一步讀完四頁，最後按「我了解了」才會關閉。
 * @param {object} opts.onDone - 確認讀完後的回呼
 */
export function showPlatformGuide(opts = {}) {
  if (document.getElementById("guide-overlay")) return;
  let step = 0;
  const total = GUIDE_PAGES.length;

  const overlay = document.createElement("div");
  overlay.id = "guide-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:oklch(0 0 0 / 0.72);backdrop-filter:blur(4px);padding:16px;";
  overlay.innerHTML = `
    <div id="guide-card" style="width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:var(--ink-800);border:1px solid oklch(1 0 0 / 0.12);border-radius:16px;padding:28px 24px;box-shadow:0 24px 64px oklch(0 0 0 / 0.5);">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <img src="../assets/icons/xiaoshu-avatar.webp" alt="小曙" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">
        <div>
          <div style="font-size:11px;letter-spacing:.15em;color:var(--brass-400);">小曙的平台導引</div>
          <h2 id="guide-title" style="margin:2px 0 0;font-size:20px;"></h2>
        </div>
      </div>
      <div id="guide-dots" style="display:flex;gap:6px;margin-bottom:16px;"></div>
      <div id="guide-body" style="font-size:14px;line-height:1.9;color:var(--paper-200);"></div>
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:24px;">
        <button id="guide-prev" class="btn btn-ghost">上一步</button>
        <button id="guide-next" class="btn btn-primary">下一步</button>
      </div>
      <div id="guide-hint" style="text-align:center;font-size:11px;color:var(--paper-400);margin-top:12px;">第 1 頁，共 4 頁</div>
    </div>`;
  document.body.appendChild(overlay);

  const render = () => {
    const p = GUIDE_PAGES[step];
    document.getElementById("guide-title").textContent = p.title;
    document.getElementById("guide-body").innerHTML = p.body;
    document.getElementById("guide-dots").innerHTML = GUIDE_PAGES.map((_, i) =>
      `<span style="flex:1;height:4px;border-radius:2px;background:${i <= step ? "var(--brass-300)" : "oklch(1 0 0 / 0.12)"};"></span>`).join("");
    document.getElementById("guide-prev").style.visibility = step === 0 ? "hidden" : "visible";
    const nextBtn = document.getElementById("guide-next");
    nextBtn.textContent = step === total - 1 ? "我了解了，開始探索" : "下一步";
    document.getElementById("guide-hint").textContent =
      step === total - 1 ? "讀完請按「我了解了」" : `第 ${step + 1} 頁，共 ${total} 頁`;
    document.getElementById("guide-card").scrollTop = 0;
    /* 選用功能頁的 checkbox 連動 localStorage */
    const crBox = document.getElementById("guide-classroom");
    if (crBox) {
      try { crBox.checked = localStorage.getItem("dawn_feat_classroom") === "1"; } catch {}
      crBox.onchange = () => {
        try { localStorage.setItem("dawn_feat_classroom", crBox.checked ? "1" : "0"); } catch {}
      };
    }
  };

  document.getElementById("guide-prev").onclick = () => {
    if (step > 0) { step--; render(); }
  };
  document.getElementById("guide-next").onclick = () => {
    if (step < total - 1) { step++; render(); }
    else {
      overlay.remove();
      try { opts.onDone && opts.onDone(); } catch {}
    }
  };
  /* 點背景不關閉：必須讀完確認才能放行 */
  overlay.addEventListener("click", e => {
    if (e.target === overlay) {
      const card = document.getElementById("guide-card");
      card.style.transform = "translateX(0)";
      card.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
        { duration: 220 }
      );
    }
  });

  render();
}
