/* 曙光學習 v4 — 環境氛圍
 * 深夜圖書館的燈光：三團大而淡的暖霧，沿各自的慢速軌道漂移；
 * 滑鼠只給輕微視差（不是跟隨），讀作「氛圍」而非「一顆球在追你」。
 * 只有 transform / opacity，走 GPU；尊重 prefers-reduced-motion；觸控裝置降級為純漂移。
 * 調色跟著時段走（dawn:slot 事件）：拂曉粉金、正午明亮、黃昏紫霞、深夜暖金＋冷青。
 */
import { SLOTS } from "./theme.js?v=theme001";

const HUES_BY_SLOT = Object.fromEntries(SLOTS.map(s => [s.id, s.hues]));
function slotHues() {
  const id = document.documentElement.dataset.slot || "night";
  return HUES_BY_SLOT[id] || HUES_BY_SLOT.night;
}

export function initAmbient() {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (document.getElementById("ambient-wrap")) return;
    const coarse = matchMedia("(pointer: coarse)").matches;

    const wrap = document.createElement("div");
    wrap.id = "ambient-wrap";
    wrap.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;";
    /* 光霧：大尺寸、極淡、邊緣全透明 */
    /* 光霧：大尺寸、極淡、邊緣全透明；色相取自當前時段 */
    const hues = slotHues();
    const blobs = [
      { size: 900, x: 0.22, y: 0.28, amp: 70,  sp: 0.0035, ph: 0.0, op: 0.055 },   // 左上
      { size: 1000, x: 0.80, y: 0.70, amp: 90, sp: 0.0028, ph: 2.1, op: 0.040 },   // 右下
      { size: 700, x: 0.60, y: 0.15, amp: 50,  sp: 0.0042, ph: 4.2, op: 0.035 },   // 右上
    ].map((b, i) => {
      const el = document.createElement("div");
      el.style.cssText =
        `position:absolute;left:0;top:0;width:${b.size}px;height:${b.size}px;` +
        `margin:${-b.size / 2}px 0 0 ${-b.size / 2}px;border-radius:50%;` +
        `background:radial-gradient(circle, oklch(${hues[i % hues.length]} / ${b.op}) 0%, transparent 70%);` +
        "will-change:transform;";
      wrap.appendChild(el);
      return { ...b, el };
    });
    document.body.prepend(wrap);
    /* 時段切換時重新調色（不重建元素） */
    addEventListener("dawn:slot", e => {
      const hs = (e.detail && e.detail.hues) || slotHues();
      blobs.forEach((b, i) => {
        b.el.style.background =
          `radial-gradient(circle, oklch(${hs[i % hs.length]} / ${b.op}) 0%, transparent 70%)`;
      });
    });

    const bg = document.querySelector(".time-bg");
    let mx = 0.5, my = 0.5, t = Math.random() * 100;
    if (!coarse) {
      addEventListener("pointermove", e => {
        mx = e.clientX / innerWidth; my = e.clientY / innerHeight;
      }, { passive: true });
    }
    (function loop() {
      t += 1;
      const w = innerWidth, h = innerHeight;
      for (const b of blobs) {
        /* 各自慢速漂移＋滑鼠輕微視差（係數小到只覺得「有生命」） */
        const dx = Math.sin(t * b.sp + b.ph) * b.amp + (coarse ? 0 : (mx - 0.5) * 36);
        const dy = Math.cos(t * b.sp * 0.8 + b.ph) * b.amp + (coarse ? 0 : (my - 0.5) * 36);
        b.el.style.transform =
          `translate(${(b.x * w + dx).toFixed(1)}px,${(b.y * h + dy).toFixed(1)}px)`;
      }
      if (bg && !coarse) {
        const px = (mx - 0.5) * -14, py = (my - 0.5) * -14;
        bg.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) scale(1.04)`;
      }
      requestAnimationFrame(loop);
    })();
  } catch {}
}
