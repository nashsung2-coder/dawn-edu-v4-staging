/* 新手指引：心理測驗 → 選角色 → 選交通工具 → 選服裝 */
import { supabase } from "../core/supabase.js";
import { requireAuth, toast, esc, applyTimeBg } from "../core/ui.js?v=fixed002";

applyTimeBg();
const user = await requireAuth();

const body = document.getElementById("ob-body");
const title = document.getElementById("ob-title");
const sub = document.getElementById("ob-sub");
const steps = document.getElementById("ob-steps").children;
const btnNext = document.getElementById("ob-next");
const btnBack = document.getElementById("ob-back");

let step = 0;
const answers = { quiz: [], character: null, vehicle: null, outfit: null };

/* 心理測驗題目 */
const QUIZ = [
  {
    q: "你比較喜歡怎麼學新東西？",
    opts: ["先看完整體架構再深入細節", "直接動手做，邊做邊學", "聽別人講解再自己整理", "找一堆資料自己研究"],
    trait: ["架構型", "實作型", "聽覺型", "研究型"],
  },
  {
    q: "遇到不會的題目，你通常？",
    opts: ["跳過，先做會的", "硬想直到想出來", "問人或查答案", "換個方式重新理解題目"],
    trait: ["策略型", "毅力型", "社交型", "靈活型"],
  },
  {
    q: "你讀書時最受不了什麼？",
    opts: ["太吵的環境", "一直被打斷", "內容太無聊", "沒有目標感"],
    trait: ["專注型", "節奏型", "趣味型", "目標型"],
  },
];

const CHARACTERS = [
  { id: "scholar", img: "../assets/onboarding/char-scholar.webp", nm: "博學者", ds: "知識淵博，學習加成" },
  { id: "warrior", img: "../assets/onboarding/char-warrior.webp", nm: "勇者", ds: "對戰強悍，攻擊加成" },
  { id: "explorer", img: "../assets/onboarding/char-explorer.webp", nm: "探險家", ds: "好奇心強，探索加成" },
  { id: "artist", img: "../assets/onboarding/char-artist.webp", nm: "藝術家", ds: "創意無限，靈感加成" },
];

const VEHICLES = [
  { id: "book", img: "../assets/onboarding/veh-book.webp", nm: "飛行書", ds: "穩重可靠，均衡型" },
  { id: "rocket", img: "../assets/onboarding/veh-rocket.webp", nm: "火箭", ds: "速度飛快，衝刺型" },
  { id: "ship", img: "../assets/onboarding/veh-ship.webp", nm: "知識艦", ds: "載重超大，耐久型" },
  { id: "broom", img: "../assets/onboarding/veh-broom.webp", nm: "魔法掃帚", ds: "靈活閃避，技巧型" },
];

const OUTFITS = [
  { id: "robe", img: "../assets/onboarding/out-robe.webp", nm: "學者長袍", ds: "經典不敗" },
  { id: "armor", img: "../assets/onboarding/out-armor.webp", nm: "戰鬥鎧甲", ds: "威風凜凜" },
  { id: "cloak", img: "../assets/onboarding/out-cloak.webp", nm: "夜行斗篷", ds: "神秘低調" },
  { id: "crown", img: "../assets/onboarding/out-crown.webp", nm: "智慧王冠", ds: "尊貴華麗" },
];

function renderSteps() {
  [...steps].forEach((s, i) => s.classList.toggle("done", i <= step));
  btnBack.style.display = step > 0 ? "" : "none";
}

function render() {
  renderSteps();
  btnNext.disabled = true;
  if (step === 0) {
    /* 心理測驗 */
    const qi = answers.quiz.length;
    if (qi >= QUIZ.length) { step = 1; render(); return; }
    const q = QUIZ[qi];
    title.textContent = `問題 ${qi + 1} / ${QUIZ.length}`;
    sub.textContent = "認識你自己";
    body.innerHTML = `<h2 style="margin-bottom:16px;">${esc(q.q)}</h2>` +
      q.opts.map((o, i) => `<button class="q-opt" data-i="${i}">${esc(o)}</button>`).join("");
    body.querySelectorAll(".q-opt").forEach(b => {
      b.onclick = () => {
        body.querySelectorAll(".q-opt").forEach(x => x.classList.remove("sel"));
        b.classList.add("sel");
        b._trait = q.trait[Number(b.dataset.i)];
        btnNext.disabled = false;
        btnNext.onclick = () => {
          answers.quiz.push(b._trait);
          render();
        };
      };
    });
    btnNext.textContent = qi === QUIZ.length - 1 ? "看結果" : "下一步";
  } else if (step === 1) {
    /* 選角色 */
    const traits = answers.quiz.join("・");
    title.textContent = "選擇你的角色";
    sub.textContent = `你的特質：${traits}`;
    body.innerHTML = `<div class="opt-grid">` + CHARACTERS.map(c => `
      <div class="opt-card" data-id="${c.id}">
        <img src="${c.img}" alt="${c.nm}" style="width:100%;height:120px;object-fit:cover;border-radius:2px;margin-bottom:8px;">
        <div class="nm">${c.nm}</div>
        <div class="ds">${c.ds}</div>
      </div>`).join("") + `</div>`;
    bindCards("character");
    btnNext.textContent = "下一步";
  } else if (step === 2) {
    /* 選交通工具 */
    title.textContent = "選擇交通工具";
    sub.textContent = "在知識宇宙中移動的方式";
    body.innerHTML = `<div class="opt-grid">` + VEHICLES.map(c => `
      <div class="opt-card" data-id="${c.id}">
        <img src="${c.img}" alt="${c.nm}" style="width:100%;height:120px;object-fit:cover;border-radius:2px;margin-bottom:8px;">
        <div class="nm">${c.nm}</div>
        <div class="ds">${c.ds}</div>
      </div>`).join("") + `</div>`;
    bindCards("vehicle");
    btnNext.textContent = "下一步";
  } else if (step === 3) {
    /* 選服裝 */
    title.textContent = "選擇服裝";
    sub.textContent = "最後一步，打扮一下吧！";
    body.innerHTML = `<div class="opt-grid">` + OUTFITS.map(c => `
      <div class="opt-card" data-id="${c.id}">
        <img src="${c.img}" alt="${c.nm}" style="width:100%;height:120px;object-fit:cover;border-radius:2px;margin-bottom:8px;">
        <div class="nm">${c.nm}</div>
        <div class="ds">${c.ds}</div>
      </div>`).join("") + `</div>`;
    bindCards("outfit");
    btnNext.textContent = "開始冒險！";
  }
}

function bindCards(key) {
  body.querySelectorAll(".opt-card").forEach(card => {
    card.onclick = () => {
      body.querySelectorAll(".opt-card").forEach(x => x.classList.remove("sel"));
      card.classList.add("sel");
      answers[key] = card.dataset.id;
      btnNext.disabled = false;
      btnNext.onclick = async () => {
        if (step < 3) { step++; render(); }
        else await finish();
      };
    };
  });
}

btnBack.onclick = () => {
  if (step === 0 && answers.quiz.length > 0) {
    answers.quiz.pop();
    render();
  } else if (step > 0) {
    step--;
    if (step === 0) answers.quiz = [];
    render();
  }
};

async function finish() {
  btnNext.disabled = true;
  btnNext.textContent = "儲存中…";
  try {
    const profile = {
      character: answers.character,
      vehicle: answers.vehicle,
      outfit: answers.outfit,
      traits: answers.quiz,
      onboarded: true,
    };
    const { error } = await supabase.from("profiles")
      .update(profile).eq("id", user.id);
    if (error) throw error;
    localStorage.setItem("dawn:v4:onboarded", "1");
    window.location.href = "learn.html";
  } catch (e) {
    toast("儲存失敗：" + e.message);
    btnNext.disabled = false;
    btnNext.textContent = "開始冒險！";
  }
}

/* 跳過引導 */
document.getElementById("ob-skip").onclick = () => {
  if (confirm("確定跳過新手引導嗎？之後可以在設定中重新開始。")) {
    localStorage.setItem("dawn:v4:onboarded", "skipped");
    window.location.href = "learn.html";
  }
};

/* 已完成過就跳過 */
if (localStorage.getItem("dawn:v4:onboarded")) {
  window.location.href = "learn.html";
} else {
  render();
}
