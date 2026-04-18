# Aircade 设计指导

**版本**：V1.0（随 PRD v1.0 一同冻结）
**最后更新**：2026-04-18

本目录收录 Aircade 的视觉与交互规范，既是 PRD 第 8 节《视觉与交互原则》的落地细节，也是后续迭代的参照基线。任何改色、改字体、改间距的提案都应当先在这里更新，再动代码。

---

## 0. 目录

- `README.md`（本文）— 设计系统：色彩代币、字体、组件、动效
- `prototype/` — Claude Design 导出的原始高保真原型（只读快照）
  - `ORIGINAL-README.md` — 原始 handoff 说明
  - `chats/chat1.md` — 用户与设计助手的完整对话（需求意图来源）
  - `Aircade Prototype.html` — 单文件浏览版
  - `src/` — 原型源码（JSX/CSS），对照实现时作为像素级参考

> **实现映射**：原型只是参考，不是最终源代码。正式实现都在仓库根 `src/` 下。本文档给出实现与原型的对应关系。

---

## 1. 风格基调

关键词：**群友造的街机厅 · 暖调复古街机 · 圆角卡片 · 插画感**

参考坐标：即刻 App、Bento 卡片、Notion Calendar 插画风，但多加一层 "AI 做街机" 的做旧 / 扫描线味道。

整体 3 条审美底线：

1. **暖，不冷**。主色永远是橙/奶黄/深褐；蓝灰和纯黑不进主色池。
2. **圆，不锐**。卡片 20–22px、按钮 12px、pill 9999px，不允许 4px 以下直角。
3. **手工，不 AI slop**。封面留哈希渐变 + emoji 回落，宁愿留白也不用紫蓝渐变。

---

## 2. 色彩代币

所有色值都声明在 `src/app/globals.css` 的 `:root` 下，以 `--ac-*` 前缀统一命名，避免和 shadcn 的 `hsl(var(--*))` 系列混淆。

### 2.1 中性与背景

| Token | 值 | 用途 |
|---|---|---|
| `--ac-bg` | `#FFFBF5`（奶白） | 页面底色 |
| `--ac-bg-tint` | `#FFF4E3` | 大块填充、输入框里衬 |
| `--ac-surface` | `#FFFFFF` | 卡片默认表面 |
| `--ac-surface-soft` | `#FFF6E8` | 辅助表面、空态底 |
| `--ac-fg` | `#3D2E1F`（深棕） | 主文字 |
| `--ac-fg-soft` | `rgba(61,46,31,0.72)` | 正文副本 |
| `--ac-fg-faint` | `rgba(61,46,31,0.5)` | 元信息、占位文字 |
| `--ac-border` | `rgba(61,46,31,0.12)` | 默认描边 |
| `--ac-border-strong` | `rgba(61,46,31,0.2)` | 虚线描边、强调容器 |

### 2.2 品牌色

| Token | 值 | 用途 |
|---|---|---|
| `--ac-primary` | `#FF9F6B`（暖橙） | 主 CTA、Logo、高亮 micro |
| `--ac-primary-ink` | `#FFFBF5` | 主 CTA 上的文字 |
| `--ac-cream` | `#FFE9B8` | 奶黄强调、pill |
| `--ac-mint` | `#9FE3C9` | 成功/上线色 |
| `--ac-pink` | `#FFB7C5` | 游戏类彩标 |

### 2.3 类型 mood 色（Type chip）

| Token | 值 | 对应类型 |
|---|---|---|
| `--t-game` | `#FFB7C5` | 游戏 |
| `--t-tool` | `#9FE3C9` | 工具 |
| `--t-social` | `#FFE9B8` | 社交 |
| `--t-ai` | `#FF9F6B` | AI |
| `--t-other` | `#C9B8A0` | 其他 |

使用时用 `color-mix(in oklch, var(--t-*) 70%, var(--ac-surface))` 淡化进表面，保证和奶白背景不打架。

### 2.4 Hero 背景

```css
--ac-hero-grad:
  radial-gradient(circle at 18% 22%, rgba(255,159,107,.22), transparent 32%),
  radial-gradient(circle at 82% 78%, rgba(159,227,201,.28), transparent 34%),
  linear-gradient(180deg, #FFF8EF 0%, #FFFDF8 100%);
```

封装成 `.ac-hero-bg`，首页/auth 页共用。叠加 `.ac-dither`（4px 点阵）+ `.ac-scanlines`（1px 横条）两层 pointer-events: none 的纹理模拟街机 CRT。

---

## 3. 字体与排版

### 3.1 字族

在 `src/app/fonts.ts` 里声明，通过 CSS 变量挂载：

| 变量 | 字体 | 用途 |
|---|---|---|
| `--font-inter` | Inter（Google Fonts） | 西文正文 |
| `--font-harmony` | HarmonyOS Sans（本地，需自备） | 中文正文回落 |
| `--font-lxgw` | 霞鹜文楷（本地） | Display / 大标题 |
| `--font-mono` | JetBrains Mono | micro 标、代码、邀请码 |

Tailwind 里：`font-sans` = Inter + Harmony，`font-display` = 霞鹜文楷，`font-mono` = JetBrains。

### 3.2 尺码阶梯

| 语境 | size / line-height | 备注 |
|---|---|---|
| Hero display | 72px / 1.05 | 仅首页主标题 |
| Page display | 40–52px / 1.1 | 详情页、账号页 |
| Section title | 26–30px / 1.15 | 模块标题 |
| Card title | 18–22px / 1.15 | WorkCard 标题 |
| Body | 14–16px / 1.75 | 说明性正文 |
| Micro | 11px / 1.4 · letter-spacing 0.22em · uppercase | 模块 kicker（`.ac-micro`） |

### 3.3 文字色使用规则

- 主标题永远 `var(--ac-fg)`
- 正文副本用 `var(--ac-fg-soft)`，不用半透明黑
- tagline / 高亮短句用 `var(--ac-primary)`
- micro 标在 Hero/CTA 段用 `var(--ac-primary)`，在模块内用 `var(--ac-fg-faint)`

---

## 4. 圆角、间距、阴影

- **圆角**：按钮 12px · 输入框 12px · 小卡 14px · 主卡 20–22px · pill 9999px
- **卡片内边距**：Hero/CTA 卡 40px · 常规卡 24–28px · 紧凑卡 16–20px
- **阴影**：
  - `--ac-card-shadow: 0 20px 60px rgba(61,46,31,.08)`
  - `--ac-card-shadow-hover: 0 28px 80px rgba(61,46,31,.14)`（配 `.ac-lift` 使用）
  - `--ac-primary-shadow: 0 18px 32px rgba(255,159,107,.32)`（仅主 CTA）
- **虚线**：`1px dashed var(--ac-border)` 用于卡内分段、`2px dashed var(--ac-border-strong)` 用于 Dropzone / QR 占位

---

## 5. 组件库（实现位置 → 原型位置）

| 组件 | 文件 | 原型对照 |
|---|---|---|
| Navbar（sticky + 角标） | `src/components/brand/navbar.tsx` | `docs/design/prototype/src/primitives.jsx` |
| Footer | `src/components/brand/footer.tsx` | 同上 |
| Logo（SVG 街机柜） | `src/components/brand/logo.tsx` | `primitives.jsx` |
| MarqueeTicker | `src/components/brand/marquee-ticker.tsx` | `pages/home.jsx` 底部 `.marquee` |
| TypeChip | `src/components/brand/type-chip.tsx` | `primitives.jsx` |
| TagChip | `src/components/brand/tag-chip.tsx` | 同上 |
| Avatar（hue-hash conic 渐变） | `src/components/brand/avatar.tsx` | 同上 |
| Cover（哈希渐变 + emoji 回落） | `src/components/brand/cover.tsx` | 同上 |
| HeartButton（弹跳 + sparkle） | `src/components/brand/heart-button.tsx` | 同上 |
| WorkCard（default / featured） | `src/features/works/components/work-card.tsx` | `primitives.jsx` 的 `WorkCard` |
| WorkGallery（主图 + 描边缩略图） | `src/features/works/components/work-gallery.tsx` | `pages/work.jsx` 的 shot 状态机 |
| WorkSubmitForm（表单 + Live Preview） | `src/features/works/components/work-submit-form.tsx` | `pages/submit.jsx` |
| AdminReviewForm（封面 + 两档按钮） | `src/features/works/components/admin-review-form.tsx` | `pages/admin.jsx` |
| AuthShell（左白卡 + 右深褐面板） | `src/features/auth/components/auth-shell.tsx` | `pages/other.jsx` 的 login/register |

### 5.1 CSS 工具类（在 `globals.css @layer components`）

| 类名 | 用途 |
|---|---|
| `.ac-hero-bg` | 暖调 Hero 背景（含 radial + linear） |
| `.ac-dither` / `.ac-scanlines` | CRT 纹理叠层 |
| `.ac-page-in` | 进场淡入 + 6px 上推 |
| `.ac-card` | 默认卡片（surface + border + 阴影） |
| `.ac-lift` | hover 上浮 4px + 阴影加深 |
| `.ac-pill` / `.ac-type-{game,tool,social,ai,other}` | 类型/状态 chip |
| `.ac-btn` / `.ac-btn-primary` / `.ac-btn-ghost` / `.ac-btn-lg` / `.ac-btn-sm` | 按钮阶梯 |
| `.ac-heart-btn` / `.ac-sparkle` | 点赞交互 |
| `.ac-cover-*` | 封面渐变 / 条纹 / emoji / mono 角标 |
| `.ac-marquee` / `.ac-marquee-inner` | 跑马灯 |
| `.ac-nav` | 顶部毛玻璃 nav |
| `.ac-micro` | micro 标排版（mono + 0.22em + uppercase） |

---

## 6. 页面范式

每个主页在 `src/app/<route>/page.tsx`，结构都与原型 `docs/design/prototype/src/pages/` 一一对应。

### 6.1 首页 `/`

Hero（`HeroStack` 三张旋转叠卡）→ Marquee → Featured 4 列 → By Type 5 格 → Latest 3 列 → Join CTA。

实现：`src/app/page.tsx`。

### 6.2 作品详情 `/works/[workId]`

左：类型/状态 chip → 标题 + tagline → `WorkGallery` → About 正文 → 同作者更多作品
右：吸顶 action rail，包含作者卡 / QR-Web 卡 / Stats + Heart/收藏/分享卡

实现：`src/app/works/[workId]/page.tsx`。

### 6.3 投稿 `/submit`

3-Step Flow chip → 双栏（左表单分 4 段：基本信息 / 图片 / 怎么玩 / 协议 + 提交；右 Live Preview + 小贴士）。

实现：`src/app/submit/page.tsx` + `src/features/works/components/work-submit-form.tsx`（客户端组件，携带实时字数与类型预览）。

### 6.4 审核后台 `/admin/works`

顶部四色 Stats Bar → 待审核队列 → 最近驳回。每条 review 卡包含封面 + 作者 + 两档按钮（通过上线 / 驳回，带键盘提示）。

实现：`src/app/admin/works/page.tsx` + `src/features/works/components/admin-review-form.tsx`。

### 6.5 登录 / 注册 `/login`、`/register`

共用 `AuthShell`：左白卡 + 右深褐面板 + 径向光晕 + marquee。注册表单多一层 3-step dot 指示器 + mono 邀请码输入。

实现：`src/app/login/page.tsx`、`src/app/register/page.tsx` + `src/features/auth/components/{login,register}-form.tsx`。

### 6.6 账号中心 `/account`

左侧头像 / 角色 pill / 侧栏导航 / 登出
右侧问候 → MiniStat 三列（上线/待审/驳回）→ WorkCard 网格 → 账号信息卡

实现：`src/app/account/page.tsx`。

---

## 7. 动效

所有动效遵循 "高光时刻 ≤ 1 个、其余静默" 的克制原则。

| 动效 | 触发 | 时长 / 缓动 | 实现 |
|---|---|---|---|
| Page in | 路由进入 | 0.35s / `--ease-out` | `.ac-page-in` |
| Card lift | hover | 0.22s / `--ease-out` | `.ac-lift` |
| Heart pop | 点赞 | 0.5s / `--ease-spring` | `@keyframes heartPop` |
| Sparkle | 点赞 | 0.6s / `--ease-out` | `@keyframes sparkle` |
| Marquee | 持续 | 40s linear infinite | `@keyframes marquee` |

全局缓动代币：

```css
--ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## 8. 响应式

- **断点**：`sm=640` · `md=768` · `lg=1024`（沿用 Tailwind 默认）
- **核心栅格**：最大宽度 `max-w-6xl`（1152px），两侧 24–32px 内边距
- **Hero**：lg 以上左右 1.15 : 0.85 双栏；小屏堆叠，`HeroStack` 隐藏
- **WorkCard**：手机 1 列 / md 2 列 / lg 3 列；featured 变体 lg 起 4 列
- **账号页**：lg 起 `260px_1fr` 双栏；小屏侧栏压上方

---

## 9. 可访问性

- 所有交互元素最小触达 40×40（移动端 44×44）
- 可 focus 元素必须有可见 ring，统一用 `var(--ac-primary)`
- `Avatar` / `Cover` 传 `aria-label` 或由外层文本兜底
- 状态不能只靠颜色表达；`TypeChip` / 状态 pill 都带可读文字
- 动效响应 `prefers-reduced-motion`（后续补：marquee 与 heart-pop 需要在该设置下静止）

---

## 10. 与 PRD 的对应关系

| PRD 小节 | 本文档对应 |
|---|---|
| 8.1 色系 | §2 色彩代币 |
| 8.2 字体 | §3 字体与排版 |
| 8.3 圆角 | §4 圆角、间距、阴影 |
| 8.4 微动效 | §7 动效 |
| 8.5 移动端优先 | §8 响应式 |
| 8.6 空态插画 | §5 Cover / §6 各页空态块 |

---

## 11. 变更流程

1. 任何代币改动（色、字体、圆角）先在本文档 §2–§4 提 diff，再改 `globals.css`
2. 新增组件：先在本文档 §5 登记 "实现位置 → 原型位置"，再加代码
3. 页面范式变化：同步更新 §6 与 PRD 第 4 节《信息架构》

原型快照放 `prototype/` 作为只读基线。**不要**修改原型文件去"对齐"实现——原型是意图来源，实现可以演进，但演进需要经过本文档。
