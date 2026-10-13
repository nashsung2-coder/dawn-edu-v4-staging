/* 靈獸頁：讀取/互動/孵化 */
import { supabase, getUser } from "../core/supabase.js";
import { renderTopbar, requireAuth, toast, esc, ensureProfile} from "../core/ui.js";

await renderTopbar("pet.html");
const user = await requireAuth();
await ensureProfile(supabase, user);

const view = document.getElementById("pet-view");

const SPECIES_IMG = {
  "貓": "pet-cat.webp", "狐": "pet-fox.webp", "龍": "pet-dragon.webp", "鳥": "pet-bird.webp",
  "鹿": "pet-deer.webp", "龜": "pet-turtle.webp", "兔": "pet-rabbit.webp", "default": "nav-pet.webp",
};
const petImg = (species, cls = "pet-img") =>
  `<img class="${cls}" src="../assets/icons/${SPECIES_IMG[species] || SPECIES_IMG.default}" alt="${species || ""}" loading="lazy">`;
const SPECIES_POOL = ["貓", "狐", "龍", "鳥", "鹿", "龜", "兔"];

function expNeeded(level) { return level * 100; }

function moodText(m) {
  if (m >= 80) return "心花怒放";
  if (m >= 60) return "心情不錯";
  if (m >= 40) return "有點想你";
  return "快來陪我";
}

async function load() {
  view.innerHTML = `<div class="state-loading"><div class="skeleton" style="height:200px"></div></div>`;
  try {
    const { data: pet, error } = await supabase.from("pets")
      .select("*").eq("owner_id", user.id).limit(1).maybeSingle();
    if (error) throw error;
    if (!pet) return renderEmpty();
    renderPet(pet);
  } catch (e) {
    view.innerHTML = `<div class="state-error">
      <p>讀取失敗：${esc(e.message)}</p>
      <button class="btn btn-primary" id="p-retry">重試</button></div>`;
    document.getElementById("p-retry").onclick = load;
  }
}

function renderEmpty() {
  view.innerHTML = `<div class="card"><div class="state-empty">
    <img class="pet-img" src="../assets/icons/pet-egg.webp" alt="靈獸蛋" style="width:96px;height:96px;" loading="lazy">
    <p style="margin:16px 0;">還沒有靈獸夥伴</p>
    <button class="btn btn-primary" id="p-hatch">孵化</button></div></div>`;
  document.getElementById("p-hatch").onclick = hatch;
}

async function hatch() {
  const btn = document.getElementById("p-hatch");
  btn.disabled = true; btn.textContent = "孵化中…";
  try {
    const species = SPECIES_POOL[Math.floor(Math.random() * SPECIES_POOL.length)];
    const { data, error } = await supabase.from("pets").insert({
      owner_id: user.id,
      name: "無名",
      species,
      level: 1, exp: 0, hunger: 100, mood: 80,
    }).select().single();
    if (error) throw error;
    toast(`孵化成功！一隻${species}誕生了`);
    renderPet(data);
  } catch (e) {
    toast(`孵化失敗：${e.message}`);
    btn.disabled = false; btn.textContent = "孵化";
  }
}

function renderPet(pet) {
  const need = expNeeded(pet.level);
  const expPct = Math.min(100, Math.round((pet.exp / need) * 100));
  const moodPct = Math.min(100, Math.max(0, pet.mood));

  view.innerHTML = `<div class="grid">
    <div class="card span6">
      <div class="pet-stage" style="text-align:center;">
        ${petImg(pet.species)}
        <div class="pet-name">${esc(pet.name || "無名")}</div>
        <div class="pet-species">${esc(pet.species || "")} · Lv.${pet.level}</div>
      </div>
      <div class="stat-row">
        <span class="label">經驗</span>
        <div class="bar"><div style="width:${expPct}%"></div></div>
        <span class="val">${pet.exp}/${need}</span>
      </div>
      <div class="stat-row">
        <span class="label">心情</span>
        <div class="bar"><div style="width:${moodPct}%"></div></div>
        <span class="val">${moodText(pet.mood)}</span>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="p-feed">餵食</button>
        <button class="btn btn-ghost" id="p-play">陪玩</button>
      </div>
    </div>
    <div class="card span6">
      <h2>改名</h2>
      <div class="field">
        <label>名字</label>
        <input class="input" id="p-name" value="${esc(pet.name || "")}" maxlength="12">
      </div>
      <button class="btn btn-ghost" id="p-rename">儲存</button>
      <div style="margin-top:16px;padding:12px;background:oklch(1 0 0 / 0.04);border-radius:3px;">
        <div class="label" style="margin-bottom:4px;">夥伴加成</div>
        <div style="font-size:13px;color:var(--paper-300);">
          Lv.${pet.level} 靈獸為你帶來 <b style="color:var(--brass-300);">+${pet.level}%</b> 星砂獲得加成
        </div>
      </div>
    </div>
  </div>`;

  document.getElementById("p-feed").onclick = () => interact(pet, { exp: 10, mood: 5 }, "餵食");
  document.getElementById("p-play").onclick = () => interact(pet, { exp: 5, mood: 10 }, "陪玩");
  document.getElementById("p-rename").onclick = async () => {
    const name = document.getElementById("p-name").value.trim();
    if (!name) { toast("請輸入名字"); return; }
    try {
      const { error } = await supabase.from("pets").update({ name }).eq("id", pet.id);
      if (error) throw error;
      toast("改名成功");
      load();
    } catch (e) { toast(`改名失敗：${e.message}`); }
  };
}

async function interact(pet, delta, label) {
  /* 每日互動限制：用 localStorage 記錄 */
  const today = new Date().toISOString().slice(0, 10);
  const key = `dawn:v4:pet:${pet.id}:${today}`;
  const count = Number(localStorage.getItem(key) || 0);
  if (count >= 5) {
    toast("今日互動次數已用完，明天再來吧！");
    return;
  }
  try {
    let { exp, level, mood } = pet;
    exp += delta.exp;
    mood = Math.min(100, mood + delta.mood);
    // 升級
    while (exp >= expNeeded(level)) {
      exp -= expNeeded(level);
      level++;
    }
    const leveledUp = level > pet.level;
    const { error } = await supabase.from("pets")
      .update({ exp, level, mood }).eq("id", pet.id);
    if (error) throw error;
    localStorage.setItem(key, String(count + 1));
    const left = 5 - count - 1;
    toast(leveledUp ? `${label}完成！升級到 Lv.${level}` : `${label}完成（今日剩餘 ${left} 次）`);
    load();
  } catch (e) {
    toast(`${label}失敗：${e.message}`);
  }
}

load();
