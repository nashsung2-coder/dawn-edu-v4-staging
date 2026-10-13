# 曙光教育 v4 — Design Tokens
# 方向：「深夜圖書館」— dark academia × 戰情室資訊密度
# 參考：NYT 排版嚴謹度 / Bloomberg Terminal 資料密度 / Persona 5 UI 的不妥協感
# 2026-10-12

## 色彩（oklch）

--ink-950: oklch(0.16 0.03 260)    /* 墨藍黑：主背景 */
--ink-900: oklch(0.20 0.04 260)    /* 卡片背景 */
--ink-800: oklch(0.26 0.05 260)    /* 懸停/邊框 */
--ink-700: oklch(0.34 0.05 260)    /* 次要邊框 */

--paper-50: oklch(0.96 0.02 90)     /* 暖紙白：主文字 */
--paper-200: oklch(0.88 0.03 90)    /* 次要文字 */
--paper-400: oklch(0.72 0.03 90)    /*  muted 文字 */
--paper-600: oklch(0.55 0.03 90)    /* 極淡文字 */

--brass-300: oklch(0.82 0.12 85)    /* 黃銅亮：高光/數字 */
--brass-400: oklch(0.74 0.14 80)    /* 黃銅：主強調色（檯燈色） */
--brass-600: oklch(0.60 0.12 80)    /* 黃銅暗：邊框/裝飾線 */

--teal-400: oklch(0.68 0.10 200)    /* 深青：次要強調（墨水色） */
--teal-600: oklch(0.52 0.09 200)

--signal-red: oklch(0.62 0.18 25)   /* 警示/錯誤 */
--signal-green: oklch(0.72 0.14 150) /* 成功/答對 */

## 字體

--font-display: "Noto Serif TC", serif  /* 標題：襯線，學術感 */
--font-body: "Noto Sans TC", sans-serif /* 內文 */
--font-mono: "JetBrains Mono", monospace /* 數字/代碼/數據 */

## 字階

--text-hero: 40px / 1.2 / 900 (display)
--text-h1: 28px / 1.3 / 700 (display)
--text-h2: 22px / 1.4 / 700 (display)
--text-h3: 18px / 1.4 / 700 (body)
--text-body: 15px / 1.7 / 400 (body)
--text-small: 13px / 1.6 / 400 (body)
--text-caption: 12px / 1.5 / 400 (mono, letterspacing 0.08em, uppercase for EN)

## 間距

--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-6: 24px
--space-8: 32px
--space-12: 48px
--space-16: 64px

## 圓角

--radius-sm: 2px   /* 幾乎直角：戰情室感 */
--radius-md: 4px
--radius-lg: 8px
--radius-full: 999px /* 僅用於徽章/藥丸 */

## 陰影

--shadow-card: 0 1px 0 oklch(1 0 0 / 0.04) inset, 0 8px 24px oklch(0 0 0 / 0.4)
--shadow-lift: 0 12px 32px oklch(0 0 0 / 0.5)

## 動效

--ease-out: cubic-bezier(0.16, 1, 0.3, 1)
--duration-fast: 120ms
--duration-med: 240ms

## Signature moves（識別性設計決策）

1. **雙層標題系統**：每頁頂部有英文小字 caption（mono, brass, letterspaced）+ 中文襯線大標題
2. **黃銅細線**：卡片不用陰影，用 1px 黃銅暗線 + 頂部 2px 黃銅亮線做「檯燈光」
3. **數據用等寬字**：所有數字、百分比、分數都用 JetBrains Mono，右對齊
4. **直角為主**：卡片 radius 2-4px，拒絕 AI 風大圓角
5. **紙質紋理**：背景用極淡的噪點（SVG noise），不是純色
6. **印章式徽章**：成就徽章做成圓形印章樣式，brass 描邊
