/* 曙光學習 v4 — 環境氛圍
 * 滑鼠跟隨的暖金柔光＋背景視差，讓畫面活起來。
 * 只有 transform / opacity，走 GPU；閒置時也會緩慢漂移；
 * 尊重 prefers-reduced-motion，觸控裝置不啟用滑鼠跟隨。
 */
export function initAmbient() {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (matchMedia("(pointer: coarse)").matches) return;
    if (document.getElementById("ambient-glow")) return;

    const glow = document.createElement("div");
    glow.id = "ambient-glow";
    glow.style.cssText =
      "position:fixed;left:0;top:0;width:560px;height:560px;margin:-280px 0 0 -280px;" +
      "border-radius:50%;pointer-events:none;z-index:0;" +
      "background:radial-gradient(circle, oklch(0.74 0.14 80 / 0.09) 0%, transparent 65%);" +
      "will-change:transform;";
    document.body.prepend(glow);

    const bg = document.querySelector(".time-bg");
    let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, t = Math.random() * 10;
    addEventListener("pointermove", e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      t += 0.008;
      /* 閒置漂移＋滑鼠跟隨（lerp 平滑） */
      const gx = tx + Math.sin(t) * 36, gy = ty + Math.cos(t * 0.8) * 36;
      x += (gx - x) * 0.07;
      y += (gy - y) * 0.07;
      glow.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      if (bg) {
        const px = (x / innerWidth - 0.5) * -16, py = (y / innerHeight - 0.5) * -16;
        bg.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) scale(1.04)`;
      }
      requestAnimationFrame(loop);
    })();
  } catch {}
}
