# 地牢扫雷 · DUNGEON SWEEPER — 设计文档

> 目录：`games/dungeon-sweeper/` · 开发端口 5101 · 本地存储前缀 `aircade.dungeon-sweeper.`
> 本文描述**当前实现**（最终状态）。数值以 `src/config.ts` 为准，正文写规则、设计意图和关键数字；改动历史见 §21。
> 坐标 `(x, y)`：`x ∈ 0..8` 从左到右，`y ∈ 0..11` 从上到下；格子下标 `i = y * 9 + x`。

---

## 目录

1. 概述与体验目标 · 2. 工程与技术约束 · 3. 完整规则 · 4. 数值 · 5. 地图生成 · 6. 选盘求解器 · 7. 核心逻辑 `Game` · 8. 难度、龙怒与祝福 · 9. 计分、记录、成就、每日挑战、存档 · 10. 引导与情境提示 · 11. 运行时架构 · 12. 渲染与美术 · 13. 动效 · 14. 音频 · 15. 界面与流程 · 16. 调试接口 · 17. 性能 · 18. 平衡模拟与检查 · 19. 示例数据 · 20. 风险与对策 · 21. 修改记录

---

## 1. 概述与体验目标

**一句话**：举着烛火走进漆黑的地牢——每个数字都是周围怪物的**等级之和**。靠推理决定先打谁、何时喝药，一路升级，最后屠掉盘踞在中央的巨龙（标准难度 13 级）。

这是「扫雷 × 地牢 RPG」的融合：扫雷提供信息推理，RPG 提供资源与成长。踩到怪物不是直接失败，而是**战斗**：扣血 = 怪物等级，经验 = 怪物等级；升级回满血。只有血不够时才会死。

| 项目 | 目标 |
|---|---|
| 一局时长 | 胜局 4–6 分钟（约 55 次翻格 + 10–15 次标记）；败局约 3 分钟 |
| 上手 | 30 秒引导局在操作中教会：数字 = 等级和、战斗扣血得经验、数字归零自动展开、上限推理、标记、目标 |
| 核心情绪 | 黑暗中的谨慎 → 推理成立的爽快 → 压线升级回满血的惊险 → 屠龙的释放 |
| 平台 | 网页，竖屏手机优先（390×844 基准），桌面与横屏手机适配 |

**情绪曲线（一局）**

- 0:00–0:30 好奇/上手：入口火把亮起，光从底部流出；外圈是 1–2 级小怪，30 秒内第一次升级。
- 0:30–2:30 推理节奏：沿边缘扩张，捡血瓶、宝箱，等级 3–6，暖光一块块覆盖地图。
- 2:30–4:00 紧张期：逼近中央龙巢，大怪变多，生命预算吃紧（死亡集中在玩家 7–9 级）。
- 4:00–5:00 高潮：生命上限够挑战，巨龙睁眼。玩家决定立刻挑战，还是继续清图拿「龙怒」双倍分。
- 屠龙：约 3.6 秒演出，整座地牢被点亮，进入结算。

**玩家能自己发现的三个核心技巧**（规则里不写）：

1. **上限推理**：数字 N 说明它周围任何一只怪都 ≤ N 级。只要 N < 当前生命，点它的任意邻格都不会死。
2. **压线升级**：先扣血、后算经验，溢出经验带入下一级，升级回满血。快升级时去打大怪 = 用旧血条付账。
3. **资源囤积**：宝箱和血瓶翻出后不自动拾取，留到快升级又残血时再用。

---

## 2. 工程与技术约束

### 2.1 硬约束

- TypeScript strict + Vite 8，**不用游戏引擎**。渲染用 Canvas 2D，UI 覆盖层用 DOM + CSS。
- 包管理 pnpm。
- **运行时不请求任何外部资源**：美术、音效、音乐全部用代码程序化生成；字体打包进本地（`@fontsource/*` 加一个子集化的中文标题字体）。
- 玩法数值全部集中在 `src/config.ts`。
- localStorage key 前缀 `aircade.dungeon-sweeper.`。
- `?debug=1` 打开 FPS 浮层和 `window.__game`；`?seed=<数字>` 固定种子。
- 竖屏优先（390×844），同时适配桌面和横屏。
- `pnpm build` 零错误零警告（含类型检查）；`pnpm sim` 全部检查通过；浏览器里控制台零报错。
- 界面原则：**不写标语、辅助说明、次要标签**。如果某个界面要靠说明文字才能看懂，改布局而不是加字。

### 2.2 工程文件

| 文件 | 要点 |
|---|---|
| `package.json` | 依赖只有两个字体包：`@fontsource-variable/cinzel`、`@fontsource/cinzel-decorative`（固定 5.3.0）。dev：`vite ~8.3.4`、`typescript ~6.0.3`、`@types/node`。scripts：`dev` / `build`（`tsc --noEmit && tsc -p tsconfig.node.json && vite build`）/ `preview` / `sim`（`node scripts/sim.ts`） |
| `tsconfig.json` | 只含 `src`；strict、`noUnusedLocals/Parameters`、`verbatimModuleSyntax`、`allowImportingTsExtensions`；types 只有 `vite/client` |
| `tsconfig.node.json` | 检查 `vite.config.ts` 和 `scripts/`；types `node`、`erasableSyntaxOnly`。Node 全局类型不混进游戏代码 |
| `vite.config.ts` | `base: './'`；端口 5101、`strictPort`、`host: true`；开发专用插件 `asset-sink`：`POST /__asset?name=x.png` 把 body 写进 `public/`（`__game.exportAssets()` 用） |
| `index.html` | viewport `maximum-scale=1,user-scalable=no,viewport-fit=cover`；favicon / og / twitter meta；骨架只有 `#safe-probe`、`canvas#bg`、`canvas#game`、`#ui` |

- `pnpm sim` 用 Node 原生类型剥离直接运行 `.ts`，所以 `src/game/` 下的纯逻辑模块之间**必须**用带 `.ts` 后缀的相对导入。
- 全局 CSS：`html, body { position: fixed; overflow: hidden; overscroll-behavior: none; touch-action: none; user-select: none; -webkit-touch-callout: none; }`。`#safe-probe` 的 padding 写成 `env(safe-area-inset-*)`，JS 读计算值得到安全区。
- **不做 PWA**：没有 manifest、Service Worker、主屏图标。`main.ts` 启动时注销所有已注册的 Service Worker，并删除以 `aircade.dungeon-sweeper.` 开头的 Cache Storage（兼容早期版本）。

### 2.6 目录结构

```
games/dungeon-sweeper/
├─ index.html
├─ package.json / pnpm-lock.yaml / tsconfig.json / tsconfig.node.json / vite.config.ts
├─ scripts/sim.ts            # pnpm sim：难度 × 机器人画像的胜率、贪心曲线、目标检查
├─ public/                   # favicon.png（192，自带圆角）、og.png（1200×630），都由代码生成
├─ art-ref/                  # 巨龙参照图（只供人看，不进产物）
└─ src/
   ├─ main.ts                # 读 URL 参数、加载字体（带超时）、创建 App、debug 时挂 __game
   ├─ config.ts              # ★ 全部数值
   ├─ app.ts                 # 顶层状态机，串联所有子系统，实现 Stage 与 InputHandler
   ├─ assets/fonts/          # ma-shan-zheng-title.woff2（只含「地牢扫雷」4 字）+ OFL 许可证
   ├─ core/
   │  ├─ rng.ts              # mulberry32、hash32、randomSeed
   │  ├─ loop.ts             # RAF 主循环（可停可启）
   │  ├─ clock.ts            # 世界时间 / 真实时间、hitstop、慢动作
   │  ├─ tween.ts            # 池化 tween（上限 256），驱动 Channel.v
   │  ├─ ease.ts             # 缓动函数
   │  ├─ noise.ts            # 1D 值噪声、flicker()
   │  ├─ input.ts            # 指针：tap / 长按 / 拖动 / 右键 / 悬停 / 滚轮
   │  ├─ storage.ts          # localStorage 包装（前缀、try/catch、JSON）
   │  └─ haptics.ts          # navigator.vibrate 包装，最短间隔 40ms
   ├─ game/                  # 纯逻辑：不依赖 DOM / Canvas，可在 Node 中运行
   │  ├─ types.ts            # Kind、Mark、GameEvent、ScoreBreakdown
   │  ├─ board.ts            # 邻接表、距离表、生成、开局模拟、引导固定布局
   │  ├─ rules.ts            # Game 类、RunSave、pickBoard
   │  ├─ solver.ts           # 只看可见信息的求解机器人（选盘 + 模拟）
   │  ├─ boardWorker.ts      # Web Worker：后台 pickBoard 预取下一局
   │  ├─ difficulty.ts       # 难度档参数
   │  ├─ blessings.ts        # 祝福定义、候选、数值修正
   │  ├─ achievements.ts     # 成就
   │  ├─ score.ts            # 记录、结算行、格式化
   │  ├─ daily.ts            # 每日挑战
   │  └─ tutorial.ts         # 引导步骤与状态机
   ├─ view/
   │  ├─ layout.ts           # 栏宽、cell、HUD 矩形、横屏布局
   │  ├─ director.ts         # GameEvent[] → 带时序的演出
   │  ├─ renderer.ts         # 每帧分层合成 + Overlay（全屏效果状态）
   │  ├─ textures.ts         # 程序化贴图（墙、砖、地面、外框、暗角、光斑）
   │  ├─ glyphs.ts           # 数字 / 粉笔字形图集，字体常量
   │  ├─ shapes.ts           # 怪物与道具的 Path2D 数据
   │  ├─ silhouettes.ts      # 剪影烘焙：本体、白版、碎片
   │  ├─ dragonArt.ts        # 巨龙几何（样条管道）
   │  ├─ dragonView.ts       # 巨龙待机、显露、惊扰、屠龙序列
   │  ├─ lighting.ts         # 低分辨率光照图
   │  ├─ boardView.ts        # 格子视图状态（SoA）、翻牌、数字滚轮、标记、复盘
   │  ├─ fx.ts               # 粒子 / 碎片 / 刀光 / 跳字 / 光环
   │  ├─ camera.ts           # trauma 震屏
   │  ├─ hud.ts              # 盾徽、血条、经验、分数、计时、消息、图鉴、祝福印章
   │  ├─ radial.ts           # 标记轮盘
   │  ├─ bg.ts               # 桌面两侧背景画布
   │  ├─ gfx.ts              # makeCanvas、radialBlob 等工具
   │  └─ palette.ts          # 色板
   ├─ ui/
   │  ├─ screens.ts          # 所有 DOM 面板
   │  ├─ share.ts            # 分享卡、emoji 地图、favicon / OG 图绘制
   │  └─ styles.css
   ├─ audio/
   │  ├─ audio.ts            # AudioContext、总线、tone() / noiseBurst()、节流
   │  ├─ sfx.ts              # 音效配方
   │  ├─ music.ts            # 程序化氛围音乐
   │  └─ reverb.ts           # 程序化脉冲响应
   └─ debug/debug.ts         # ?debug=1：FPS 浮层、window.__game
```

### 2.7 字体

| 用途 | 字体 | 来源 |
|---|---|---|
| 数字、HUD 数值 | Cinzel 可变字重（400–900），只用 `cinzel-latin-wght-normal.woff2`（约 25KB） | `@fontsource-variable/cinzel` |
| 英文副标、LEVEL UP | Cinzel Decorative 700，只用 latin（约 15KB） | `@fontsource/cinzel-decorative` |
| 中文 Logo「地牢扫雷」 | 马善政毛笔楷书（Ma Shan Zheng，OFL），**子集化到这 4 个字**（woff2 约 2.4KB） | 本地 `src/assets/fonts/`，附许可证 |
| 其余中文 | 系统字体栈 | — |

字体用 `?url` 导入具体 woff2 文件，再用 `FontFace` API 加载（`main.ts`）。**最多等 300ms**（`FONT_WAIT_MS`，首屏预算），超时先用回退字体烘焙字形图集，字体到了再回调 `app.rebakeGlyphs()` 重烘。

---

---

## 3. 完整规则

### 3.1 地图

- 网格 **9 列 × 12 行**。
- **龙巢** `x 3–5, y 4–6`（3×3），巨龙中心 `(4,5)`。龙巢开局即可见（`revealed = 1`），不计入数字，不能标记，不会被连锁展开。
- **入口** `x 3–5, y 10–11`（3×2），保证为空地。开局自动翻开起点 `(4,11)`（楼梯），它的邻格全在入口内，数字必为 0，必然连锁。
- 可玩格：108 − 9 = **99 格** = 38 怪物 + 4 宝箱 + 3 血瓶（学徒 4 瓶）+ 其余空地。
- **环带**：以到龙巢矩形的切比雪夫距离 `d` 划分。`d=1` 内环（16 格）、`d=2` 中环（24 格）、`d=3` 外环（32 格）、`d=4–5` 边缘（27 格，含入口）。越靠近巨龙越危险。

```
     x: 0 1 2 3 4 5 6 7 8
 y 0    4 4 4 4 4 4 4 4 4
 y 1    3 3 3 3 3 3 3 3 3
 y 2    3 2 2 2 2 2 2 2 3
 y 3    3 2 1 1 1 1 1 2 3
 y 4    3 2 1 ■ ■ ■ 1 2 3
 y 5    3 2 1 ■ 龍 ■ 1 2 3     ■ = 龙巢
 y 6    3 2 1 ■ ■ ■ 1 2 3
 y 7    3 2 1 1 1 1 1 2 3
 y 8    3 2 2 2 2 2 2 2 3
 y 9    3 3 3 3 3 3 3 3 3
 y10    4 4 4 入 入 入 4 4 4   入 = 入口
 y11    5 5 5 入 梯 入 5 5 5   梯 = 起点 (4,11)
```

### 3.2 规则条文（无歧义版）

**R1 格子内容**：每个可玩格是空地、怪物（1–9 级）、宝箱、血瓶之一。

**R2 数字**：每个已翻开的非怪物格（空地、道具格、已击败怪物的格子、入口）显示 **N = 周围 8 格中「仍未翻开且存活」的怪物等级之和**。
- 巨龙和龙巢永不计入。标记不影响 N。
- 怪物被击败后，周围数字**实时减少**（滚轮动画）。所以数字永远表示「周围还剩多少未知危险」。
- 道具格在右下角用小字显示 N，拾取后数字移到中央。N = 0 时不显示数字（只留一个淡淡的符文点）。
- 实现上对**所有格**维护 `number[i]`（含未翻开格），显示时只看已翻开的。

**R3 翻开**：点击未翻开格。空地或道具：翻开（**道具不自动拾取**）。怪物：立即战斗（R5）。

**R4 连锁**：任何已翻开的信息格只要 N = 0，就自动翻开周围所有未翻开格（被标记的也翻，标记擦除），递归进行。连锁永远不会翻出怪物。开局、普通翻开、击败怪物导致 N 归零、快开，**统一适用**。

**R5 战斗结算顺序**（严格按此顺序）：
1. `hp -= damageOf(level)`（无祝福时伤害 = 等级）
2. 若 `hp <= 0`：
   - 有「不屈」祝福且未用过：`hp = 1`，标记已用，继续第 3 步；
   - 否则**死亡**（恰好归零也算），不给经验，不会因这一击的升级复活。
3. 翻开该格（若有标记，先给出标记结果）。若战后 `hp == 1`，记 `closeCall`（成就用）。
4. 击杀计数；击杀等级和 `killXp += level`；巨龙已醒则 `awakeKillXp += level`；有「赏金」则 `bountyXp += level`。
5. 「噬血」回血（见 §8.3）。
6. `xp += killXpOf(level)`（无祝福 = 等级）；`while (xp >= xpToNext(level)) { xp -= xpToNext(level); level++ }`，可连升多级。
7. 若升级：`maxHp = maxHpForLevel(level) + bonusHp`，`hp = maxHp`（回满）；检查巨龙苏醒；检查祝福等级。
8. 怪物移除，周围数字 `-= level` → 对自身和归零的邻格触发 R4。
9. 若全图怪物都已被击败 → **肃清**：`hp = maxHp`，得肃清分。

**R6 宝箱**：随时点击打开，得金币（计分）和经验（可能升级回满）。**宝箱没有风险**。按离巨龙远近分三档外观（木 / 铁 / 金），长按显示确切数值。

**R7 血瓶**：随时点击饮用，`hp = min(maxHp, hp + heal)`。**满血时点击无效**（瓶子摇晃，提示「生命已满，留着以后用」），不消耗。

**R8 标记**：长按（桌面右键）未翻开格弹出标记轮盘：`1–9`、`?`、`○`（安全）、`✕`（清除）。标记只是笔记。
- 标记值编码：`0` 无，`1–9` 数字，`-1` = `?`，`-2` = `○`。
- 点击被标记的格子：若是数字标记且 **`damageOf(标记) >= 当前生命`**（致命标记），第一次点击只让格子红光抖动并提示「致命！再点一次硬闯」，**2 秒内再点一次**才翻开；其他标记直接翻开。
- 格子翻开时标记擦除。数字标记等于真实等级，或 `○` 下面确实没有怪，算「猜中」（`correctMarks++`，粉笔星光；「洞察」祝福写上去的标记不算）。

**R9 巨龙**：点击龙巢任意一格（以下为冒险者难度，其他见 §8.1）。
- `hp >= 14`：若场上还有存活怪物，先弹确认框「现在挑战巨龙？剩余怪物的分数将无法获得」【挑战】【再等等】；全图已肃清则直接开战。战斗中 `hp -= 13`（必然存活），**胜利**。
- `hp < 14`：不开战。巨龙睁一只眼喷鼻烟，提示「巨龙之威：需要至少 14 点生命」。
- **巨龙苏醒**的判定是**生命上限** `maxHp >= 14`（不是当前生命）。苏醒后击杀分 ×2（龙怒）。

**R10 计分**：见 §9.1。

**R11 计时**：引导结束（或开局入口点亮）后，玩家第一次操作开始计时。暂停、对话框、祝福三选一、页面失焦时停止。

**R12 输入锁**：一次战斗演出期间（420ms）忽略新的点击，不缓冲。连锁翻牌期间，已落定的格子照常可点，正在翻转的格子不响应。

**R13 快开**（设置里默认开启）：点击 N > 0 的数字格时，若周围未翻开格中数字标记之和**恰好等于 N**、没有 `?` 标记、且还有未标记或 `○` 的格子，就一次翻开这些格子。标记错了照常遇怪战斗；中途死亡则剩余翻开取消。按住数字时预览将被翻开的格子（淡金描边），在格子外松手取消。条件不满足时只闪一下 3×3 邻域框。

### 3.3 边界情况

| 情况 | 处理 |
|---|---|
| HP 恰好为 0 | 死亡（除非不屈） |
| 一次经验连升多级 | 逐级结算，回满到最终上限，演出「LEVEL UP ×2」 |
| 宝箱经验触发升级 | 同 R5 第 6–7 步 |
| 满血点血瓶 | 无效，提示，保留 |
| 生命不够点龙巢 | 只有惊扰演出 |
| 全图清空但生命不够 | 不可能：肃清回满，怪物经验 137 足够升到 13 级（上限 17） |
| 连锁翻到被标记的格子 | 翻开并擦除标记（它一定安全） |
| 长按已翻开格 / 道具 / 龙巢 | 已翻开格：3×3 邻域框；道具：数值浮窗；龙巢：「巨龙 Lv13 · 需生命 14」 |
| 多指触控 | 只追踪第一个指针 |
| 动画期间暂停 | 世界时间冻结，恢复后继续 |
| 页面隐藏 | 自动暂停、存档、挂起 AudioContext、停 RAF |
| 等级超出表 | `maxHp = 末项 + 超出级数`，`xpToNext = 末项 + 超出级数` |
| 有待选祝福时点格子 | `Game.tap` 什么都不做 |

### 3.4 开局保障

1. 入口 6 格保证为空地，开局至少翻开 6 格。
2. **入口护卫**：与入口矩形切比雪夫距离 ≤ 2 的格子只能放 ≤ 2 级怪。开局生命 5，入口附近不可能一击致死。
3. **重抽**：生成后模拟开局连锁，翻开格数必须在 `[9, 28]`。不满足用 `seed + k` 重新生成（k 递增，最多 50 次，之后接受最后一张）。
4. **选盘**（§6）：在满足上一条的候选里，取第一个「只看可见信息的专家机器人能赢且无需致命猜测」的盘面，最多试 16 个。

---

## 4. 数值（`src/config.ts`）

全部玩法数值和时序常量都在 `CONFIG` 里，调平衡只改这里。区块索引：

| 区块 | 内容 |
|---|---|
| `board` | 9×12、龙巢 / 入口矩形、起点、开局翻开范围 `[9, 28]`、最多重抽 50 次、烛台概率 0.18 |
| `player` | `maxHpByLevel`（5→19）、`xpToNext`（3→20）；超出表时 `maxHpForLevel` / `xpToNextLevel` 按末项线性外推 |
| `monsters` | 各级数量（共 38）、经验 = 等级、环带 `bands`、`bandFalloff 0.55`、入口护卫、名字 |
| `items` | 宝箱 4 个（金币 40/60/80/120、经验 1/2/2/3，按离龙远→近分配）、血瓶回复 5、两者按距离的权重 |
| `solver` | 选盘：回溯节点上限 3000、最多 16 个候选、预算 2500ms（Worker）/ 主线程兜底 60ms |
| `review` | 死亡复盘时序 |
| `daily` | 日期种子的盐、保留 60 天 |
| `difficulty` | 三档（§8.1）：巨龙等级、挑战血量、血瓶数、祝福等级、怪物数量增减 |
| `blessings` | 三选一数量、十张卡的数值字段（§8.3） |
| `achievements` | 成就门槛 |
| `dragon` / `score` / `rules` | 屠龙确认、7 级睁眼；计分常量（§9.1）；致死归零、战斗锁 420ms、致命确认 2000ms、快开、肃清回满 |
| `tutorial` | 引导局怪物配额扣减 |
| `input` | 长按 380ms、蓄力提示 120ms、点击容差 10px、轮盘几何 |
| `timing` / `juice` / `fx` / `quality` | 演出时序、打击感、对象上限、自适应质量 |
| `lowHpAbs` / `lowHpFrac` | 低血阈值 2 / 20% |

`validateConfig()` 对每档检查「经验池够升到挑战血量」「挑战血量大于巨龙等级」，`pnpm sim` 和 `?debug=1` 都会跑。

### 4.1 数值的设计意图

**玩家成长**

| 等级 | 上限 | 升级所需 | 累计经验 | 本级预算（上限 − 1 与所需经验之差） |
|---|---|---|---|---|
| 1 | 5 | 3 | 0 | 宽松 +1 |
| 2 | 6 | 4 | 3 | 宽松 +1 |
| 3 | 7 | 6 | 7 | 刚好 0 |
| 4 | 8 | 7 | 13 | 刚好 0 |
| 5 | 9 | 9 | 20 | 缺 1（需要压线、宝箱或血瓶） |
| 6 | 10 | 10 | 29 | 缺 1 |
| 7 | 11 | 12 | 39 | 缺 2 |
| 8 | 12 | 13 | 51 | 缺 2 |
| 9 | 13 | 14 | 64 | 缺 2 |
| **10** | **14** | 15 | **78** | ← 冒险者可挑战 |
| 11–14 | 15–18 | 16–19 | 93 / 109 / 126 / 144 | 144 = 全清理论上限 |

前 4 级宽松建立信心；5 级起每级都要靠技巧弥补，生命预算越到后期越紧，与逼近龙巢的空间难度叠加。

**怪物**

| 等级 | 名称 | 数量 | 经验合计 | 环带 [min, max, pref] | 意图 |
|---|---|---|---|---|---|
| 1 | 史莱姆 | 8 | 8 | [2,5,5] | 边缘经验糖果 |
| 2 | 蝙蝠 | 7 | 14 | [2,5,4] | |
| 3 | 哥布林 | 6 | 18 | [2,5,3] | |
| 4 | 骷髅兵 | 5 | 20 | [1,4,3] | 外环主力 |
| 5 | 宝箱怪 | 4 | 20 | [1,4,3] | 只是外观，规则同普通怪 |
| 6 | 石像鬼 | 3 | 18 | [1,3,2] | 中环威胁 |
| 7 | 亡灵骑士 | 2 | 14 | [1,3,2] | |
| 8 | 蛇发女妖 | 2 | 16 | [1,2,1] | 龙卫 |
| 9 | 巫妖 | 1 | 9 | [1,1,1] | 必在内环 |
| 合计 | | **38** | **137** | | 加宝箱经验 8 = 总池 145 |

翻开格上的初始数字：中位数约 7，p90 约 18，最大约 45（两位数很常见）。

---

## 5. 地图生成（`game/board.ts`）

### 5.1 预计算表

模块加载时算好：`NEIGHBORS`（每格 8 个邻居，越界 -1；顺序为 dy −1..1 外层、dx −1..1 内层）、`LAIR_DIST`（到龙巢矩形的切比雪夫距离 d）、`ENT_DIST`（到入口矩形的距离）、`START_CELL = idx(4, 11)`。

### 5.2 BoardData

```ts
export interface BoardData {
  seed: number;
  regen: number;        // 第几次重抽得到的（存档用于确定性重建）
  tutorial: boolean;
  diff: DiffId;
  kind: Uint8Array;     // Kind: Empty 0, Monster 1, Chest 2, Potion 3, Lair 4
  level: Uint8Array;    // 怪物等级 1–9
  gold: Uint16Array;    // 宝箱金币
  itemXp: Uint8Array;   // 宝箱经验
  heal: Uint8Array;     // 血瓶回复
  candle: Uint8Array;   // 视觉：烛台格
  variant: Uint8Array;  // 视觉：贴图变体 0–11
  counts: number[];     // 各等级怪物数量（下标 1–9）
}
```

### 5.3 单次生成 `generateOnce(seed, tutorial, attempt, diff)`

1. `rng = new Rng(seed * 7919 + attempt * 104729 + 17)`（**必须**用这个公式，存档靠它重建）。
2. 龙巢格 `kind = Lair` 并锁定；入口格锁定（保持空地）。
3. 配额：怪物数量来自难度档；宝箱 4；血瓶按难度。
4. 引导局：先扣 `CONFIG.tutorial.countsDelta`，再按 §10.1 的固定布局放入底部 6 行，并从配额里扣掉。
5. **按等级从高到低（9 → 1）放怪物**。每只在所有「未锁定、空地」格中加权抽取：
   - `d = LAIR_DIST[c]` 不在 `[band.min, band.max]` → 权重 0；
   - `ENT_DIST[c] <= 2` 且等级 > 2 → 权重 0；
   - 否则 `w = 0.55 ^ |d − band.pref|`。
   - 全为 0 时兜底：放宽环带，只遵守入口护卫，权重 1。
6. 放宝箱：`w = chest.weightByDist[d] ?? 0.2`。放血瓶：`w = potion.weightByDist[d] ?? 0.5`。
7. 宝箱奖励：按 `LAIR_DIST` 从远到近排序（同距按下标），依次分配 `gold[r]`、`xp[r]`，最近的最丰厚。血瓶 `heal = 5`。
8. 视觉随机（稳定派生，不消耗 rng）：`variant[i] = floor(hash01(seed, i*3+1) * 12)`；空地且不在入口、`hash01(seed, i*3+2) < 0.18` → 烛台格。
9. `regen = attempt`。

加权抽取每次都先按下标 0..N−1 算出全部权重再抽一个随机数，结果依赖遍历顺序，不要改成别的顺序。

### 5.4 重抽 `generateBoard(seed, tutorial, startK = 0, diff)`

从 `k = startK` 起依次 `generateOnce(seed, tutorial, k, diff)`，模拟开局连锁（`simulateStartReveal`），翻开格数落在 `[9, 28]` 就返回；最多 50 次后接受最后一张。引导局直接返回第一张，且难度固定 normal。

### 5.5 随机数（`core/rng.ts`）

- `Rng`：mulberry32，`next() / int(n) / range(a, b) / chance(p) / pick(arr)`。
- `hash32(a, b)` / `hash01(a, b)`：整数哈希，用于从种子派生稳定的视觉随机（不消耗 rng 序列）。
- `randomSeed()`：`crypto.getRandomValues` 取 0..999999。

> 种子、生成公式、遍历顺序三者一致，才能让同一种子永远同一盘面、每日挑战人人相同、存档可重建。

---

## 6. 选盘：「无致命猜测」求解器（`game/solver.ts`）

### 6.1 为什么

纯随机生成的盘面，强机器人约 15% 的局会遇到「被迫猜且可能致死」。选盘后降到约 4%（只在超时预算下），机器人胜率从 89% 提到约 98%+。代价是选盘耗时（平均约 86ms），所以随机局在 **Web Worker 里预取下一局**。

不追求完全无猜测：完全无猜测的生成太慢，而且会削弱「等级和」带来的风险取舍。

### 6.2 pickBoard（`rules.ts`）

1. `first = generateBoard(seed, tutorial, 0, diff)`；引导局或 `solver.enabled = false` 直接返回。
2. 循环最多 16 次：用候选盘面建一局 `Game`，**关掉祝福**（`blessEnabled = false`，保证的是「不靠祝福也能推理通关」），跑 `solveGame`（专家、够血即屠龙）。赢且 `deadly === 0` 就返回该盘面。
3. 超时（`budgetMs`）就停；否则下一个候选 `generateBoard(seed, false, b.regen + 1, diff)`。
4. 都不行返回 `first`。

- 固定种子局（`?seed=`）在主线程同步选（预算 2.5s）；随机局由 `game/boardWorker.ts` 在 Web Worker 里预取下一局（`{seed, diff}` → `{seed, board}`），换难度后作废重取；预取未就绪时主线程兜底预算 60ms。

### 6.3 分析算法 `analyze(g)`

只看可见信息：

1. **约束**：每个已翻开的信息格 i，若它有未翻开邻格，形成约束「这些邻格的等级和 = number[i]」。
2. **前沿**：出现在约束里的未翻开格。每格上限 `bound = min(所在约束的 sum)`，初值 9。
3. **连通块**：用并查集把共享约束的前沿格连起来，**每块单独回溯**（搜索量从乘积变成求和）。
4. **回溯**：块内按 `bound` 从小到大排序，逐格枚举 `v ∈ [0, bound]`：
   - `v > 0` 时该等级的已用数量不能超过全局存活数 `alive[v]`；
   - 若 `known[cell]`（洞察给出）则只允许该值；
   - 每赋一个值，检查该格所在的每个约束：已赋值之和 ≤ sum，且「已赋值和 + 未赋值格上限之和 ≥ sum」，全赋值时必须相等。
   - 到达叶子：把每格当前值记进 `possMask[cell] |= 1 << v`。
   - 节点数超过 `maxNodes`：该块放弃精确推理，`possMask = 0..bound` 全集。
5. 产出每个前沿格的可能等级集合 `possMask`（第 0 位 = 可能为空）。

所有缓冲区都是预分配的 TypedArray（主线程频繁调用，避免分配）。

### 6.4 机器人决策 `playBot(g, opts)`

每步按优先级挑一个动作（最多 400 步）：

| 序 | 条件 | 动作 |
|---|---|---|
| — | 有待选祝福 | 按 `blessPref` 里第一个在候选中的选；无偏好则随机 |
| — | `hp >= minHp` 且 `hp >= stopHp` | 屠龙 |
| 0 | `slip > 0` 且掷中 | 随手点一个「最小可能伤害 < hp」的前沿格（模拟误读） |
| 1 | `possMask == 1`（必为空） | 翻开 |
| 2 | 未满血，且某个已翻开未拾取宝箱的经验 ≥ 距升级所差 | 开宝箱 |
| 3 | 前沿格等级已唯一确定，`damageOf(v) < hp` 且 `killXpOf(v) >= 所差` | 打它（取等级最大的） |
| 4 | 前沿格 `damageOf(max(possMask)) < hp` | 必活探索：分数 `max*2 + (可能为空 ? 0 : 1)` 最小者 |
| 5 | 未满血且有可用血瓶 | 喝；否则有宝箱就开 |
| — | 够血 | 屠龙 |
| 6 | 被迫猜测 | 分数 `max + (可能为空 ? 0 : 5)` 最小的前沿格；都 ≥ 9 时点一个非前沿的未翻开格。若 `damageOf(min(分数,9)) >= hp`，**记一次致命猜测** |

`solveGame(g, maxNodes, minHp)` = 专家画像（`slip 0`、够血即走）。

`BotOpts`：`maxNodes`（推理深度）、`slip`（失手率）、`msPerAction`（每步计时）、`minHp`、`stopHp`（≥ 该血量才屠龙，模拟贪心）、`rand`、`blessPref`。`BLESS_PREF`（熟练：先保命）和 `BLESS_PREF_EXPERT`（专家：先拿赏金、洞察）是两份选卡顺序。

伤害、经验、血瓶、宝箱一律经过 §8.3 的祝福修正函数，规则与机器人共用同一套。

---

## 7. 核心逻辑 `Game`（`game/rules.ts`）

### 7.1 设计原则

- **逻辑和演出分离**：`Game` 同步结算，立即更新真相，返回 `GameEvent[]`。`Director` 按时序播放事件；HUD 显示的是 Director 推进的「显示值」（生命在出击那一刻掉，经验在光点到达时涨）。
- **先存档，后演出**：每次操作结算完立刻写存档，刷新页面不能撤销一次致命的翻格。

### 7.2 字段

```ts
class Game {
  readonly b: BoardData; readonly seed: number; readonly isTutorial: boolean; readonly diff: DiffParams;
  readonly revealed = new Uint8Array(N);   // 龙巢格初始为 1
  readonly collected = new Uint8Array(N);  // 道具已拾取
  readonly mark = new Int8Array(N);        // 0 / 1–9 / -1 ? / -2 ○
  readonly number = new Uint8Array(N);     // 周围未翻开存活怪物等级和（所有格都维护）
  readonly alive = new Array<number>(10).fill(0);  // 各等级存活数
  totalAlive = 0;
  player: { level: number; hp: number; maxHp: number; xp: number };  // 初始 1 / 5 / 5 / 0
  phase: 'playing' | 'won' | 'lost' = 'playing';
  gold = 0; kills = 0; killXp = 0; awakeKillXp = 0;
  closeCall = false; correctMarks = 0; fullCleared = false; dragonAwake = false;
  timeMs = 0; breakdown: ScoreBreakdown | null = null; deathCell = -1; marksPlaced = 0;
  daily: string | null = null;             // 每日局的日期键
  chordEnabled = true;                     // 设置项「数字快开」
  // 祝福
  blessEnabled: boolean;                   // = !tutorial；选盘校验时置 false
  blessings: BlessId[] = []; offersDue = 0; offer: BlessId[] | null = null; picks = 0;
  undyingUsed = false; bountyXp = 0;
  readonly known = new Int8Array(N);       // 洞察得知的等级
}
```

### 7.3 公开方法

| 方法 | 说明 |
|---|---|
| `new Game(seed, tutorial?, board?)` | 不给 board 时调用 `pickBoard` |
| `start()` | 翻开起点（触发开局连锁），返回事件 |
| `tap(i, confirmedDragon?)` | 点击：龙巢 → 巨龙；未翻开 → 翻开/战斗；宝箱 → 打开；血瓶 → 饮用；数字格 → 快开或邻域提示。有待选祝福或已结束时返回 `[]` |
| `setMark(i, m)` | 只对未翻开格；与原值相同返回 `[]`；非 0 时 `marksPlaced++` |
| `chooseBlessing(id)` | 从当前候选选一张；不在候选里返回 `[]` |
| `chordTargets(i)` | 快开目标或 null |
| `isLethalMark(i)` | `mark > 0 && damageOf(mark) >= hp` |
| `boundAt(i)` | 周围已翻开数字的最小值（轮盘上的「此格周边上限」），无则 -1 |
| `canChallengeDragon()` | `hp >= diff.minHp` |
| `score`（getter） | 当前分（HUD 用） |
| `computeBreakdown(won)` | 结算明细 |
| `toSave()` / `Game.fromSave(s)` | 存档 |
| `debug*` | 调试用：加经验、设血、设级、翻开安全格、全杀、直接结束 |

### 7.4 事件类型（`game/types.ts`）

```ts
export type GameEvent =
  | { t: 'reveal'; origin: number; cells: number[] }           // 一组翻开（连锁），origin 是波纹源
  | { t: 'fight'; cell: number; level: number; hpBefore: number; hpAfter: number;
      lethal: boolean; score: number /* 本次击杀分（含龙怒）*/; rage: boolean; undying: boolean }
  | { t: 'heal'; cell: number; amount: number }                // 噬血
  | { t: 'blessOffer'; offer: BlessId[] }
  | { t: 'bless'; id: BlessId; cells: number[] /* 洞察标出的格 */ }
  | { t: 'xp'; amount: number; from: number; source: 'monster' | 'chest' }
  | { t: 'levelUp'; from: number; to: number; maxHp: number }
  | { t: 'numbers'; cells: number[]; before: number[]; after: number[] }  // 只含已翻开格
  | { t: 'collect'; cell: number; item: 'chest' | 'potion'; gold: number; xp: number; heal: number }
  | { t: 'potionRefused'; cell: number; void: boolean /* 坚韧让血瓶失效 */ }
  | { t: 'dragonBlocked' }
  | { t: 'dragonConfirm' }                                     // 需要弹确认框，逻辑未变
  | { t: 'dragonAwake' }
  | { t: 'dragonFight'; hpBefore: number; hpAfter: number }
  | { t: 'fullClear'; bonus: number }
  | { t: 'mark'; cell: number; mark: Mark; prev: Mark }
  | { t: 'markResult'; cell: number; correct: boolean; mark: Mark }
  | { t: 'neighborhood'; cell: number }                        // 闪 3×3 框
  | { t: 'chordPreview'; cell: number; cells: number[] }
  | { t: 'victory'; breakdown: ScoreBreakdown }
  | { t: 'defeat'; breakdown: ScoreBreakdown; cell: number; level: number };
```

**战斗事件的固定顺序**：`markResult?` → `fight` → (`defeat` 并结束) | (`heal?` → `xp` → `levelUp?` → `dragonAwake?` → `blessOffer?` → `numbers?` → `reveal?` → `fullClear?`)。

### 7.5 关键实现

- `revealCell(i, origin)`：怪物 → `fight`；否则 `markReveal` + `cascade`（BFS，数字为 0 的已翻开信息格翻开全部未翻开邻格），推一条 `reveal`。
- `markReveal`：置翻开、清 `known`；有标记时判定猜中（数字 = 真实等级，或 `○` 下无怪；洞察标记不计），推 `markResult` 并擦除标记。
- `gainXp`：推 `xp`，逐级升级；升级时 `maxHp = maxHpForLevel + bonusHp` 并回满，推 `levelUp`，检查苏醒（`maxHp >= diff.minHp`），统计跨过的祝福等级，必要时推 `blessOffer`。
- `tapDragon`：生命不够 → `dragonBlocked`；还有存活怪且未确认 → `dragonConfirm`（逻辑不变）；否则 `hp -= dragonLevel`，`dragonFight` + `victory`。
- `fight` 按 R5；击杀分 `L × 10 × (dragonAwake ? 2 : 1)`。

---

## 8. 难度、龙怒与祝福

### 8.1 难度档

标题页三段选择【学徒 / 冒险者 / 英雄】，存在 `difficulty` key，默认冒险者。只影响新开的普通局；引导局和每日挑战固定冒险者；读档沿用存档里的难度。

| 字段 | 学徒 easy | 冒险者 normal | 英雄 hard |
|---|---|---|---|
| 巨龙等级 | 11 | 13 | 15 |
| 挑战血量（也是苏醒的上限阈值） | 12（8 级） | 14（10 级） | 16（12 级） |
| 血瓶 | 4 | 3 | 3 |
| 祝福等级 | 5、9 | 6、10 | 11 |

```ts
export interface DiffParams {
  id: DiffId; name: string; counts: Record<number, number>;
  potionCount: number; dragonLevel: number; minHp: number; blessLevels: readonly number[];
}
// counts[l] = max(0, CONFIG.monsters.counts[l] + countsDelta[l])；结果缓存
```

- 记录每档一份：冒险者用 `records`（兼容旧数据），其余 `records.easy` / `records.hard`。
- 盘面数据带 `diff`；生成、选盘、规则、HUD 屠龙线、提示文字都按该档数值。
- 暂停面板和分享文字带难度名（「英雄 · 种子 #123」）。

### 8.2 龙怒：觉醒之后的取舍

问题：如果觉醒后继续清图只有普通击杀分、却要冒死亡清零的风险，「够血就屠龙」是唯一最优解，后半局没有决策。

解决：
- **龙怒**：巨龙觉醒之后的击杀分 ×2，结算单列「龙怒」一行；觉醒提示「巨龙已醒 · 此后击杀分 ×2」，浮动分数直接显示翻倍值。
- **余勇**：每点剩余生命 60 分，多升一级就多 60。

验收：冒险者专家机器人在 14 / 15 / 16 血屠龙的期望分相差 ≤ 15%（实测约 8%，15 血略优）。冲分的玩家有理由继续清图，求稳的玩家够血就走也不吃亏。

### 8.3 祝福：升级三选一（`game/blessings.ts`）

升到该难度的祝福等级时，升级演出播完弹出三张卡，点一张即选，**没有取消**。效果整局有效，每种一局最多一次。

**规则**
- 候选由「种子 + 第几次选」决定（`rollOffer`），已拥有的不再出现。每日挑战人人相同；读档后候选不变。
- 有待选时 `Game.tap` 什么都不做；一次连升跨过两个祝福等级时依次弹两次。选择期间计时暂停，暂停按钮无效，键盘 1–3 可选。
- 引导局没有祝福。
- 选盘时关掉祝福（`blessEnabled = false`），所以「无需致命猜测」保证的是不靠祝福也能推理通关。带代价的祝福可能让这条保证失效（例如血瓶失效后，原本靠血瓶撑过的一战打不过了），这是玩家自己做的交换。
- 生命上限的增减在选的那一刻生效（当前生命同步增减，至少留 1），之后每次升级都带上；巨龙苏醒看加成后的上限。
- 致命标记按修正后的伤害判断（选了屠夫，标「2」的格不再致命）。

**十张卡**

| id | 印 | 名 | 收益 | 代价 |
|---|---|---|---|---|
| vigor | 韧 | 坚韧 | 生命上限 +2 | 血瓶失效（点了提示「坚韧：血瓶已失效」，不消耗） |
| leech | 噬 | 噬血 | 击杀 2 级及以上的怪物回复 1 生命 | 生命上限 −1 |
| butcher | 屠 | 屠夫 | 2 级及以下的怪物不伤你 | 它们也不给经验 |
| armor | 甲 | 鳞甲 | 5 级及以上的怪物伤害 −1 | 1 级的怪物伤害 +1 |
| greed | 贪 | 贪婪 | 宝箱经验 +3、金币 ×2 | 血瓶回复 −1 |
| alchemy | 药 | 炼金 | 血瓶回满生命 | 宝箱金币减半 |
| undying | 魂 | 不屈 | 第一次致命伤害时留 1 生命（照常击败该怪、拿经验） | 宝箱不再给经验 |
| berserk | 狂 | 狂战 | 击杀经验 +2 | 生命上限 −1，受到伤害 +1 |
| insight | 眼 | 洞察 | 立刻在最强的 2 只存活怪物上标出真实等级 | 无 |
| bounty | 赏 | 赏金 | 此后击杀分每级 +5，结算单列「赏金」 | 无 |

**实现**：定义、卡面文字（代价由通用字段生成）、`rollOffer`、全部数值修正函数都在 `game/blessings.ts`。

- `rollOffer(seed, pick, owned)`：剩余卡池用 `new Rng(((seed * 31) ^ (pick * 0x9e37 + 0x51)) >>> 0)` 做 Fisher–Yates，取前 3 张。
- 修正函数（规则与机器人共用）：`bonusHp`、`damageOf`（≤ 免伤等级为 0；加 `dmgAll`；鳞甲减、低级加；不低于 0）、`killXpOf`（≤ 免伤等级为 0）、`killHealOf`、`chestXpOf`（不屈为 0）、`chestGoldOf`（贪婪 ×2、炼金减半）、`potionHealOf`（坚韧 → 0，炼金 → Infinity）。
- `Game.chooseBlessing(id)`：记下、`picks++`、`offersDue--`；按 `bonusHp` 差值调整上限和当前生命（至少 1）；洞察挑存活未翻开怪按等级降序（同级按下标）取 2 只，写 `known` 和标记并推 `mark`；推 `bless`（放在最前），检查苏醒；还有待选就再抽一次推 `blessOffer`。

**平衡要点**（为什么每张都有代价）：纯加成单张就太强，冒险者熟练机器人胜率 70% → 87–94%（生命预算很紧，多 1 点血就能改变胜负）。所以每张都配代价，用单卡消融（在第一个祝福等级强制选同一张）把每张对熟练玩家的影响校准到 −5 ~ +10 个百分点。经验：
- 「血瓶失效」代价很重（无猜测路线常靠血瓶撑过一战），只给坚韧。
- 生命上限 −1 约等于晚一级觉醒，同样很重。
- 给得越晚影响越小：英雄档只在 11 级给一次；冒险者第二次正好在觉醒时，适合拿赏金冲分。

---

## 9. 计分、记录、成就、每日挑战、存档

### 9.1 计分

| 项 | 公式 | 条件 |
|---|---|---|
| 击杀 | 觉醒前击杀等级和 × 10 | 始终 |
| 龙怒 | 觉醒后击杀等级和 × 10 × 2 | 有才显示 |
| 赏金 | 选赏金之后的击杀等级和 × 5 | 有才显示 |
| 金币 | 宝箱金币之和（受祝福修正） | 始终 |
| 屠龙 | +1000 | 胜利 |
| 余勇 | 屠龙后剩余生命 × 60 | 胜利 |
| 迅捷 | max(0, 600 − 用时秒数) × 1 | 胜利 |
| 肃清 | +300 | 击败全部怪物 |

HUD 实时分 `score` = 击杀分（含龙怒）+ 赏金 + 金币 + 肃清。

典型：胜局约 2,400–2,600 分；觉醒后清到 16 血约 3,200；全清胜局约 4,300；败局约 300–900。

结算行顺序：击杀 →（龙怒）→（赏金）→ 金币 →（胜利时：屠龙、余勇「生命 n × 60」、迅捷「mm:ss」）→（肃清）。

### 9.2 本地记录

```ts
interface Records { best: number; bestTime: number /* 秒，0 = 无 */; wins: number; plays: number; }
```

- **最高分只计胜局**：败局不刷新、也不弹「新纪录」。
- 最快通关：胜局且 `bestTime === 0 || timeSec < bestTime`。
- 每档难度一份（§8.1）。每日挑战计入冒险者。

### 9.3 成就（16 个）

结算时检查，引导局不算。存 `achievements`（id → 解锁时间戳）。

| id | 名称 | 条件 |
|---|---|---|
| first | 初战告捷 | 第一次屠龙 |
| easy / normal / hard | 学徒出师 / 冒险者 / 英雄 | 在该难度屠龙 |
| clear | 肃清 | 清光所有怪物后屠龙 |
| rage | 龙怒 | 一局龙怒得分 ≥ 300 |
| glory | 荣光 | 一局 ≥ 4,000 分 |
| speed | 迅捷 | 3 分钟内屠龙 |
| close | 命悬一线 | 战斗后只剩 1 点生命（`closeCall`，存档保留） |
| dry | 滴血不沾 | 不喝血瓶屠龙 |
| ascetic | 视金如土 | 不开宝箱屠龙 |
| seer | 先知 | 一局猜中 10 个标记 |
| lich | 巫妖克星 | 击败 9 级巫妖 |
| daily | 每日一战 | 完成一次每日挑战 |
| daily7 | 风雨无阻 | 完成 7 次每日挑战（60 天内记录） |
| veteran | 百战老兵 | 各难度累计屠龙 10 次 |

### 9.4 每日挑战

种子：本地日期键 `YYYY-MM-DD` 逐字符 `hash32` 链（初值 `CONFIG.daily.salt`），`% 1000000`。记录 `DailyRec { score, won, time, done }`。

- 同一天所有玩家同一盘面（照常经过选盘），难度固定冒险者。
- **每天一次**：开局即写入 `daily[日期] = {score:0, won:false, time:0, done:false}`（占用机会），可以读档继续；中途放弃就不能重来。结算写 `done: true`。只保留最近 60 天。
- 每日局的暂停面板没有【重新开始】，底部显示「每日挑战 · 11月1日」代替种子。
- 标题页按钮三态：未开始【每日挑战 · 11月1日】；进行中不单独显示（由【继续冒险】进入）；已完成「今日 1,630 · 屠龙」（禁用）。

### 9.5 中途存档

- key `run`。每次操作（翻格、战斗、拾取、标记、选祝福、挑战巨龙）**先结算再存档**，在演出之前写入。暂停、页面隐藏、`pagehide` 时再存一次（带计时）。
- 引导进行中不存；引导结束后的引导局正常存。对局结束（胜或负）立即删除存档。
- 盘面由 `generateBoard(seed, tutorial, regen, diff)` 确定性重建，只存玩家改变过的状态；数字和存活数由翻开状态重算。

```ts
const SAVE_VERSION = 1;
export interface RunSave {
  v: number; seed: number; regen: number; tutorial: boolean; daily: string | null;
  revealed: string;       // 108 位 '0'/'1'
  collected: string;      // 同上
  mark: number[];         // 长度 108
  player: { level: number; hp: number; maxHp: number; xp: number };
  gold: number; kills: number; killXp: number;
  awakeKillXp?: number; closeCall?: boolean; diff?: DiffId;   // 后加，缺省 0 / false / 'normal'
  correctMarks: number; fullCleared: boolean; dragonAwake: boolean; timeMs: number; marksPlaced: number;
  blessings?: string[]; offersDue?: number; undyingUsed?: boolean; bountyXp?: number; known?: number[];  // 祝福，缺省为空
}
```

`fromSave` 校验：版本号、三个数组长度为 108、`generateBoard(...).regen === s.regen`，任一不符视为坏档丢弃。恢复后若 `offersDue > 0`，用 `rollOffer(seed, picks, blessings)` 重抽同一组候选（`picks = blessings.length`）。

读档时 `BoardView.restore()` 把格子直接落定为最终状态（无翻牌演出），HUD、巨龙睁眼、音乐「已醒」层与逻辑对齐，火把直接点亮。

### 9.6 存储 key 总表（前缀 `aircade.dungeon-sweeper.`）

| key | 内容 |
|---|---|
| `settings` | `{ sfx, music, haptics, reducedMotion, chord }`，默认全开，`reducedMotion` 跟随 `prefers-reduced-motion` |
| `records` / `records.easy` / `records.hard` | `Records` |
| `run` | `RunSave` |
| `tutorial` | `true` = 引导已完成 |
| `tips` | 情境提示已显示表 `{ id: true }` |
| `daily` | `{ 'YYYY-MM-DD': DailyRec }` |
| `achievements` | `{ id: 解锁时间 }` |
| `difficulty` | `'easy' \| 'normal' \| 'hard'` |

所有读写包 try/catch（隐私模式下静默失败）。【清除记录】删除全部前缀 key（含成就）。

---

## 10. 首局引导与情境提示

### 10.1 引导地图

首次【开始冒险】进入引导局（`?tutorial=1` 强制，`?tutorial=0` 跳过）。底部 6 行固定，其余由生成器按约束随机（固定部分从配额中扣除，总数不变；所以重看引导时上半张图每次不同）。引导局正常计分、正常记录，没有祝福，不经过选盘和开局重抽。

```ts
/** '?' = 交给生成器；'#' = 龙巢；'E' = 入口；'.' 空地；数字 = 怪物等级；P 血瓶；C 宝箱 */
export const TUTORIAL_ROWS: Record<number, string> = {
  6:  '??3###???',
  7:  '11.....2.',
  8:  '3....1.24',
  9:  '..1.....3',
  10: 'P2.EEE...',
  11: '...EEE2.C',
};
```

`(2,6)` 的 3 级怪阻止连锁漏进上方随机区。开局连锁翻开 11 格，可见数字只有 1–3。

### 10.2 步骤

引导时其余区域压暗（35%），只允许点高亮目标，点错时气泡轻摇。分数行正中有「跳过引导」按钮（视觉高 28px，伪元素把可点区扩到 44px）。气泡放在棋盘下方、盖住图鉴。文案里的 `{hold}` 按玩家最近一次按下的指针类型替换成「长按」（触屏）或「右键」（鼠标）；还没按过时用 `matchMedia('(hover: hover) and (pointer: fine)')` 猜。每条在 390 宽下不超过 2 行。

| 步 | 高亮 | 气泡文案 | 操作 | 结果 |
|---|---|---|---|---|
| 0 | (2,10)「3」、(2,9)、(1,10)；两块暗砖上显示 Lv1 / Lv2 标签，数字格上方显示「1 + 2 = 3」 | 数字是周围怪物的等级相加：这里 1 级 + 2 级 = 3 | 自动 3.4s | 教「数字 = 等级之和」 |
| 1 | (3,10)「1」和 (2,9)，箭头指 (2,9) | 「1」周围只剩这块暗砖，它就是 1 级怪。点它！ | 点 (2,9) | 史莱姆，生命 5→4，经验 +1。点错提示「先点箭头指着的暗砖」 |
| 1b | — | 打几级怪就掉几血、得几经验。数字归零会自动翻开周围。 | 自动 1.8s | 数字滚动归零，波纹展开 |
| 2 | (5,10)「2」和 (6,11) | 血不够会被打死！这里最多 2 级怪，你有 4 血，放心点。 | 点 (6,11) | 蝙蝠，生命 4→2，经验 3，**升级**回满 6/6，宝箱露出 |
| 2b | 盾徽、血条 | 升级了！血回满，血上限 +1。 | 自动 2s | |
| 3 | (7,10)「3」和 (8,9) | 只剩它，必是 3 级怪。先别打，{hold}它标「3」。 | 长按 (8,9) → 选 3 | 选错数字：「这里必是 3 级怪，在轮盘里选「3」」；点按或长按别的格：「别直接点！{hold}这块砖，在弹出的轮盘里选「3」」 |
| 3b | — | 标记只是备忘，不会翻开格子。 | 自动 1.6s | |
| 4 | 龙巢（巨龙睁眼）、血条 | 血上限到 14，就能去打中央的 13 级巨龙！ | 点按钮 | 引导结束，写 `tutorial = true`，开始计时 |

引导状态机（`Tutorial` 类）只负责「当前步骤」和「是否允许某个操作」：`allowTap(cell)`、`allowLongPress(cell)`、`next(now)`、`waiting`（等演出结束再进下一步）。演出与界面由 App 驱动。

### 10.3 情境提示

非阻塞 Toast，每条一生只出现一次（记在 `tips`），贴在棋盘上沿内侧，不挡分数和计时：

| id | 触发 | 文案 |
|---|---|---|
| chest | 第一次翻出宝箱（操作触发） | 宝箱随时可以打开：快升级又残血时开，等于免费回满！ |
| potion | 第一次翻出血瓶（操作触发） | 血瓶随时可喝（+5 生命）；满血时不会浪费 |
| lowhp | 第一次生命垂危 | 生命垂危！喝血瓶、开宝箱，或去打能让你升级的怪（升级回满血） |
| disturb | 第一次惊扰巨龙（操作触发） | 巨龙需要生命 ≥ {该档挑战血量} 才能挑战：先升级吧 |
| zero | 第一次因击杀归零而连锁（操作触发） | 数字归零：周围没有怪了，自动展开！ |
| chord | 累计标记 ≥ 3 次且快开开启 | 数字快开：周围标记之和等于数字时，点数字可一次翻开其余暗砖 |

**队列规则**：一次只显示一条，间隔 ≥ 1.5s；玩家第一次操作前、引导中、演出锁定和弹窗期间不显示。由操作触发的提示（巨龙、归零、宝箱、血瓶）插队首，可在前一条显示 0.9s 后打断它，2.5s 内没显示就丢弃；普通提示 12s 后过期。死亡时清空队列并收起已显示的提示。低血判定用逻辑生命（显示值在升级演出里会先掉后灌满）。【重看引导】同时重置 `tips`。

---

## 11. 运行时架构

### 11.1 App 状态机（`app.ts`）

```
'title' ──开始/继续/每日──▶ 'intro'（开场 300ms 后可点）──▶ 'playing' ⇄ 'paused'
                                                              │
                                              胜/负演出结束 ──▶ 'result' ──再来一局──▶ 'intro'
                                                              └──返回标题──▶ 'title'
```

App 持有并串联所有子系统：

```ts
class App implements Stage, InputHandler {
  canvas, ctx;                    // #game，getContext('2d', { alpha: false })
  L: Layout;
  clock = new Clock(); tw = new Tweens(256); cam = new Camera();
  tex = new Textures(); gl = new Glyphs(); sil = new Silhouettes();
  fx: Fx; lighting = new Lighting(); board: BoardView; dragon: DragonView; hud: Hud; radial: Radial;
  ov = new Overlay(); renderer: Renderer; director: Director;
  audio = new AudioEngine(); sfx: Sfx; music: Music;
  screens: Screens; input: Input; bg: Bg; loop: Loop; tut = new Tutorial();
  game: Game; settings; records; tips; daily; diff; ach;
}
```

**每帧**（`frame(dt)`）：

```
clock.tick(dt)
input.update()                      // 长按计时
if 游戏中:
  director.update()                 // 执行到期的演出任务
  tutUpdate()
  board.update(world, real, dt)     // 翻牌、光照缓动、数字滚轮
  dragon.update()
  gameTick(rdt)                     // 计时、弹祝福、巨龙眼睛、低血、紧张度、提示
tw.update(world); fx.update(dt); cam.update(real, rdt); music.update()
压暗缓动（引导 / 轮盘）
updatePointer()                     // 指尖火把平滑跟随
renderer.draw(L, game, ptr)
bg.update()                         // 桌面两侧，30fps
记录帧耗时 → adaptQuality()
```

**gameTick 要点**：
- 计时只在 `playing`、计时已开、非引导、`phase === 'playing'`、祝福面板未开时累加真实 dt。
- `game.offer && !director.busy && 无弹窗` → 打开祝福面板（升级演出播完再弹；读档回来有待选的也在这里弹）。
- 巨龙眼睛：苏醒或引导步骤 4 → 2 只；等级 ≥ 7 → 1 只；否则 0。
- 紧张度（每 500ms）：`danger = (等级≥7 ? 0.4 : 0) + (低血 ? 0.45 : 0) + 0.3 × max(0, (3 − 最近已翻开格离巢距离)/2)`，封顶 1。

**全局事件**：首次 `pointerdown`/`keydown` 解锁音频；`resize`/`orientationchange` 节流 150ms 重算布局；屏蔽 `gesturestart`、`dblclick`、`contextmenu`；`blur` 自动暂停；`visibilitychange` 隐藏时暂停 + 存档 + 挂起音频 + 停 RAF；`pagehide` 存档。

### 11.2 时钟（`core/clock.ts`）

所有游戏动画用**世界时间**；震屏、UI、屠龙 / 死亡序列用**真实时间**。`tick(realDt)`：dt 限幅 50ms；hitstop 期间世界时间缩放 0，慢动作期间乘 `slowScale`，再乘全局 `scale`（`?fast=1` 为 3）。`hitstop(ms)` 取最大不叠加。

### 11.3 演出编排（`view/director.ts`）

Director 维护两个任务队列：`at(worldT, fn)` 和 `atReal(realT, fn)`，每帧执行到期任务。`busy` = 有待执行任务 || 有飞行中的光点 || 有格子在翻 || 序列锁。

`play(events, delay)` 遍历事件、计算每个效果的时刻：

| 事件 | 时刻 | 做什么 |
|---|---|---|
| `fight` | `fightT0 = cursor`（同一批多场战斗依次排开，间隔 ≥ strikeAt + 160） | §13 战斗序列 |
| `xp` | 战斗：`fightT0 + 280 + 40`；宝箱：`cursor + 260` | 经验光点飞向经验条（数量 = 经验，上限 9，间隔 40ms，飞 450ms）；最后一颗到达时若有 `levelUp` 则播升级 |
| `levelUp` | 跟随经验光点；无光点时立即 | 升级演出 |
| `dragonAwake` | 跟随升级；单独出现时 +700ms | 苏醒演出 |
| `numbers` | `fightT0 + 300`，每格错开 12ms | 数字滚轮，归零时「嘶」+ 火星 |
| `reveal` | 击杀引起的：`fightT0 + 380`；否则 `cursor` | 波纹翻牌：每格延迟 `min(520, 34 × 欧氏距离)`，翻转轴垂直于源→格方向；光照在翻转开始时 500ms 缓动到 0.85 |
| `collect` | `cursor` | 宝箱 / 血瓶演出 |
| `heal` | `fightT0 + 540` | 血条回复 + 薄荷色跳字 |
| `potionRefused` | 立即 | 瓶子摇晃 + 消息「生命已满，留着以后用」或「坚韧：血瓶已失效」 |
| `dragonBlocked` | 立即 | 惊扰演出 + 消息「巨龙之威：需要至少 N 点生命」 |
| `dragonFight` | 立即 | 屠龙序列（§13.3，真实时间） |
| `fullClear` | `fightT0 + 980` | 肃清演出 |
| `defeat` | 非战斗引起时立即 | 死亡序列（战斗里的死亡由 fight 序列触发） |

演出结束时 Director 调 `stage.onSequenceEnd(won)`，App 写记录、检查成就、弹结算。

### 11.4 Tween 与缓动

池化 tween（上限 256），只驱动 `Channel { v: number }`，每帧零分配；同一 Channel 新 tween 覆盖旧的。缓动表：`linear quadIn quadOut quadInOut cubicIn cubicOut cubicInOut expoOut sineInOut backOut backOutStrong elasticOut`，外加 `clamp01 lerp clamp smoothstep approach`。

### 11.5 输入（`core/input.ts`）

- 只追踪第一个指针，`setPointerCapture`，所有监听 `passive: false` 并 `preventDefault`。
- 位移超过 10px 记为 `moved`；按住 380ms 未移动触发 `onLongPress`；120ms 起提供蓄力进度给蓄力环。
- 鼠标右键 → `onContext`（桌面直接开轮盘）。滚轮 → `onWheel`（悬停暗砖循环标记数字）。
- `usesMouse`：最近一次按下的指针类型（引导文案用）。

App 侧处理：
- `onTap` → `tapCell(c)`：输入锁 → 引导允许检查 → 正在翻转则忽略 → 龙巢（可能弹确认框）→ 致命标记二次确认 → `game.tap(c)` → `playEvents`。
- 按住数字格且满足快开条件：预览描边；在格子外松手取消。
- `onLongPress` / `onContext` → `longPressCell`：未翻开格开轮盘；已翻开格闪 3×3；道具显示数值浮窗；龙巢显示「巨龙 Lv13 · 需生命 14」。
- `playEvents(ev)`：`director.play(ev)`；有战斗则 `lockUntil = real + 420`；死亡清提示；开始计时；**存档**。

键盘：

| 键 | 作用 |
|---|---|
| `1–9` | 悬停格标数字；祝福面板中选第 n 张 |
| `0` / `Backspace` | 清除标记 |
| `Q` / `S` | 标 `?` / `○` |
| `M` | 静音切换（消息「已静音（M）」） |
| `Esc` | 关轮盘 / 暂停 / 继续 / 对话框取消 |
| `P` | 暂停 / 继续 |
| `Enter` / `Space` | 标题页开始或继续；结算页再来一局；对话框确认 |

### 11.6 布局（`view/layout.ts`）

竖屏：

```ts
// 参考布局（s = 1）各段高度
const H_TOP = 64, GAP1 = 8, H_SCORE = 22, GAP2 = 10, FRAME = 6, GAP3 = 10, H_MSG = 22, GAP4 = 6, H_ROSTER = 76;
const HUD_TOTAL = 230, REF_OUTER = 372;

colW = floor(min(vw, vh * 0.5625, 520));         // 游戏栏宽
availH = vh - safeTop - safeBottom - 32;
cellW = floor((colW - 18 - 2*FRAME) / 9);
k = HUD_TOTAL / REF_OUTER;
cellH = floor((availH - k*2*FRAME) / (k*9 + 12));
cell = clamp(min(cellW, cellH), 26, 64);
s = clamp((cell*9 + 2*FRAME) / 372, 0.7, 1.4);   // UI 缩放
// 纵向剩余空间按 上 45% / 下 55% 分配（棋盘偏下，单手好够）
```

自上而下：顶栏（盾徽 52×56、血条 252×22、经验条 252×12、暂停钮 40×40）→ 分数行 → 棋盘外框（边 6px）→ 消息行 → 怪物图鉴。所有尺寸 × s。390×844 下 cell = 40。

横屏（`vw >= 1.2·vh` 且 `vh < 620`）：棋盘在左（格子按高度算，上下不留边，边框 3px；844×390 下 cell = 32），HUD 面板在右（宽 372·s）。

命中检测按网格算（`cellAt`），格子之间没有缝隙死区。

---

## 12. 渲染与美术

### 12.1 风格

**「烛光下的石室」**：炭黑、冷灰蓝的石砖构成黑暗，琥珀色烛光是唯一的温度。体积光、强暗角、火光闪烁、石材颗粒。大面积暗部加少量高饱和点缀（烛火、眼睛、血、金），不用霓虹。**所有素材用 Canvas 程序化绘制，启动或 resize 时烘焙到离屏画布。**

### 12.2 色板（`view/palette.ts`）

```ts
export const PAL = {
  abyss: '#07080D',     // 页面底色、最深阴影、暗角
  charcoal: '#12141B',  // 背景墙底色、面板底
  slate: '#3A4458',     // 暗砖顶面基色
  slateHi: '#6E7C96',   // 暗砖倒角高光
  slateLo: '#161A24',   // 暗砖阴影边、砖缝
  mist: '#2B3550',      // 雾
  floor: '#4A3A2E',     // 已翻开地面
  grout: '#1E1712',     // 地面缝、刻字阴影
  amber: '#FFB54A',     // 光照主色、UI 主强调、轮廓光
  ember: '#FF7A1A',     // 火焰内核、中高数字
  gold: '#FFD27A',      // 分数、LEVEL UP、经验
  parchment: '#E9DCC0', // 主文字、低数字
  ash: '#9C8E7A',       // 次要文字
  blood: '#C8283C',     // 血条、伤害跳字
  bloodDeep: '#6E0F1E', // 血条暗端、死亡
  chalk: '#DCE3EA',     // 玩家标记（冷白）
  lethal: '#FF4D4D',    // 致命标记
  mint: '#7FE0B0',      // ○ 标记、治疗跳字
  dragonFire: '#FF3B1F',
  dragonEye: '#FFE066',
  chestWood: '#6B3F22', chestGold: '#E8B04B',
  potion: '#E0315A', potionHi: '#FF9AB0',
} as const;

/** 数字分档颜色：1–3 / 4–7 / 8–12 / 13–19 / 20+（20+ 加外发光） */
export const NUMBER_TIERS = ['#E9DCC0', '#FFD27A', '#FFB54A', '#FF7A1A', '#FF4D3D'] as const;

/** 怪物眼睛颜色（下标 = 等级，13 = 巨龙） */
export const EYE = { 1: '#9BE36B', 2: '#FF5A5A', 3: '#FFD24A', 4: '#7FD1FF', 5: '#FFB54A',
                     6: '#FF7A1A', 7: '#FF3B3B', 8: '#B6FF5A', 9: '#C77DFF', 13: '#FFE066' };
```

颜色只是辅助，数字本身才是信息（色弱友好）。

### 12.3 字体使用

| 场景 | 规格 |
|---|---|
| 中文 Logo | 马善政，`min(64px, 16vw)`，字距 0.04em；石材渐变填充 `#E9DCC0→#9C8E7A`；分层 text-shadow 做碑刻厚度（`0 2px 0 #3A2D24, 0 4px 0 #1C1511`）；外发光 `0 0 24px rgba(255,181,74,.35)` 随烛火闪烁 |
| 英文副标 `DUNGEON SWEEPER` / LEVEL UP | Cinzel Decorative 700，字距 0.32em，熔金 |
| 格内数字 | Cinzel 800；一位数 22px，两位数 18px（cell 40 时，随 cell 缩放）；先画深色下偏 1px 再画本色 = 凹刻 |
| HUD 数值 | Cinzel 700；生命 15px、分数 18px、计时 15px |
| 中文 UI | 系统栈 500/600/700；正文 14–16px，按钮 18–20px（字距 0.08em） |

Canvas 里的数字全部预烘焙进**字形图集**（每档颜色 × 0–9 × 两种字号 + 粉笔字），每帧只 `drawImage`，**不调用 `fillText`**。

### 12.4 画面分层（`renderer.ts`，从下到上）

1. **背景**：烘焙好的石墙 + 棋盘外框（6px 刻花石框，四角铜钉）。
2. **棋盘层**（带震屏矩阵）：龙巢底图与巨龙本体、暗砖、地面、骸骨贴花、烛台、道具。
3. **光照**：§12.5。
4. **光后层**：数字（按本格光照调 alpha，保证可读）、粉笔标记（自带冷白微光，不受黑暗影响）、按压/悬停高亮、巨龙余烬层、xray。
5. **屠龙压暗**：除龙巢外压暗 60%。
6. 剪影弹出、战斗形态巨龙、棋盘空间特效（粒子、碎片、刀光、跳字）。
7. 引导 / 轮盘压暗、致命气泡。
8. 体积光、暗角、红色暗角（受伤闪 / 低血呼吸）。
9. **HUD**（不震）。
10. 屏幕空间特效（经验光点、金币）、肃清金色涟漪。
11. 死亡去饱和（`saturation` 混合 0.85 + 暗色 0.28），其上画死亡复盘（保留颜色）。
12. 大字（「你倒下了」等）、闪白、标记轮盘。

震屏矩阵直接 `setTransform`（以棋盘中心为轴旋转 + 平移），不用 save/restore。

### 12.5 光照（核心）

**低分辨率光照图 + 放大合成**。每格 8 texel，外加 1 格边距：88 × 112 的三张小画布。

画布 `LW = 88`、`LH = 112`（`TEX = 8`）。参数（`Lighting` 类字段，实测调出的最终值）：`darkAlpha 0.76`（黑暗色 rgb(7,9,18)）、`glowAlpha 0.42`、`floorAmbient 0.56`、`hiddenDim 0.55`（冷色 rgb(6,8,16)）、`hiddenGlowCut 0.85`。

每帧 `render()`：

1. `dark`：清空，以 `darkAlpha × (1 − dawn)` 填满黑暗色，切到 `destination-out` 开始「挖光」。`glow`：清空，切到 `lighter`。
2. **已翻开格**：柔光斑（内核 0.22、半径 1.12 格），`dark` 强度 `min(1, (light/0.85) × floorAmbient × boost × dim)`；`glow` 叠琥珀 `0.07 × light`。
3. **烛台格**：半径 `(2.0 + 0.12·flicker)` 格的白光斑挖光（强度 `0.92 + 0.12·flicker`），光源在格子左下（x + 0.15 格、y + 0.7 格），位置还有 ±0.5 texel 抖动；`glow` 叠 0.85 倍琥珀。
4. **入口火把**：楼梯格左右两侧（格内 x 偏移 5.5/40 与 34.5/40，y = 11.6 格），半径 3 格，强度 `brazier × (1 + 0.14·flicker)`。
5. **血瓶**：粉光，半径 1.44 格，`dark` 0.4、`glow` 0.75，带 2.4Hz 正弦起伏。
6. **龙巢**：半径 2.2 格，`dark` 0.35 × 呼吸强度，`glow` 龙焰红；苏醒后 `glow` 再叠一个金红光环 `0.25 + 0.3 × breath`。
7. **指尖火把**：跟随指针（平滑 0.35），半径 1.1 格（按下 1.4），强度 0.35（按下 0.5）。
8. **升级镀金**：`boost > 1` 时全图叠金色光斑；`boost` = 升级后 300ms 内 1.6，之后 700ms cubicOut 回落到 1。
9. 边缘渐隐遮罩（棋盘外 0.85 格内 smoothstep 到全黑）。
10. **暗砖压暗**：对每个未翻开格（非龙巢），`k = 1 − min(1, light/0.85)`；`dark` 以 `source-over` 盖 `hiddenDim × k` 冷暗色；`glow` 以 `destination-out` 扣掉 `hiddenGlowCut × k`。这样前沿暗砖即使被烛光照到也明显暗于已探索地面，并保持偏冷（避免误判为已翻开）。
11. **雾**（可关闭）：6 张大雾 sprite（雾蓝）缓慢漂移、缩放，用 `destination-in` 裁到黑暗区域。

合成（每帧 3 次大 `drawImage`，`composite()`）：开启 `imageSmoothingEnabled`，把 `dark` 按 `cell / TEX` 倍放大画到棋盘区（含 1 格边距）；雾以 α 0.16 叠上；`glow` 以 `lighter`、α `glowAlpha` 叠加。

**闪烁函数**（`core/noise.ts`）：256 点值噪声表（余弦插值），`flicker(t, seed) = 0.6·noise(t·1.7 + seed·17.13) + 0.4·noise(t·5.3 + seed·31.7 + 100)`，返回 [−1, 1]。

**全局光事件**：升级 ×1.6；死亡时从死亡格按距离波纹熄灭（`ext` 数组，0.8s）；胜利 `dawn` 缓动到 1（黑暗消散）；低血烛光 −10%。

**其他氛围**：
- 体积光：左上方斜向光柱（预烘焙线性渐变条，`lighter` alpha 0.05–0.08，缓慢漂移），带尘埃。标题页两道、更明显。
- 暗角：resize 时烘焙全屏径向渐变（中心透明 → 边缘 `#07080D` α 0.75）。
- 颗粒：石材噪点直接烘焙进所有贴图，掩盖暗部色带。**不用运行时滤镜。**

### 12.6 贴图（`textures.ts`，cell = 40 时的规格，随 cell × DPR 烘焙）

- **暗砖（未翻开）**：圆角 4，四周留 1px 缝；顶面渐变 `#3E475A`（左上）→ `#2B3243`（右下）；左上 2px 高光 `#6E7C96`（弱）；右下 2px 阴影 `#161A24`；8% 噪点，1–2 条随机游走裂纹；15% 的砖角带苔痕 `#3C5A3A` α 0.3。4 个变体。
- **地面（已翻开）**：左上 2px 内阴影的凹槽感，基色 `#4A3A2E`，暖色斑点、偶尔石子。3 个变体。
- **骸骨地面**：焦痕径向暗斑（大小随等级）+ 2–3 根小骨头（`#CDBFA8` α 0.5）。
- **入口**：`(4,11)` 画向下的石阶；楼梯格左右两侧各一支壁挂火把（0.7 倍大小）。
- **烛台**：8×12px 小烛台放在格子**左下角**，同格的数字右移、上移，火焰不盖住数字。火焰 sprite 每帧按噪声缩放 0.9–1.1、倾斜 ±6°，每秒 0–2 粒余烬。
- **数字位置**：道具格数字在右下角小字；其他格居中；N = 0 只画淡符文点。
- **石墙背景**：大块石砖（64–96px），砖缝、裂纹、苔痕、像素噪点。

### 12.7 怪物剪影（`shapes.ts` + `silhouettes.ts`）

统一做法：100×100 单位坐标写 `Path2D`（贝塞尔），填近黑 `#0A0910`，顶部向 `#1A1622` 渐变表现体积；左上 1.5px 琥珀**轮廓光**（先画偏移 (−1.5, −1.5) 的琥珀版，再盖黑色本体）；眼睛是两个带光晕的小椭圆，颜色按等级。启动时按 64×64 CSS px × DPR 烘焙：本体、纯白版（受击闪白）、16–20 片三角碎片（4×4 抖动网格三角剖分，裁剪存图集）。

| 等级 | 造型要点（轮廓辨识第一） | 弹出专属动作 |
|---|---|---|
| 1 史莱姆 | 底宽顶圆的软丘，侧面挂一滴下垂液滴 | 挤压回弹（scaleY 0.6→1.2→1） |
| 2 蝙蝠 | 小椭圆身体，两侧扇贝形大翼（展开 90 宽），尖耳 | 扇翅 ×2 |
| 3 哥布林 | 佝偻小人，超大尖耳，高举匕首 | 跳一下 |
| 4 骷髅兵 | 骷髅头，肋骨镂空（evenodd），圆盾和骨剑 | x ±2px 抖动 |
| 5 宝箱怪 | 宝箱形，掀开的盖下一排利齿，伸出长舌 | 咬合两次 |
| 6 石像鬼 | 蹲伏，弯角，半展蝠翼，尾巴卷起 | 翼展开 |
| 7 亡灵骑士 | 高瘦重甲，羽饰头盔，双手杵巨剑，破披风；眼是一条缝 | 从地下升起 |
| 8 蛇发女妖 | 女性半身，6 条波浪蛇发，下身蛇尾盘绕 | 蛇发扭动 |
| 9 巫妖 | 兜帽长袍，骨手持杖，杖头宝石，尖刺王冠 | 悬浮 + 紫色气场粒子 |

体型从 L1 的矮圆到 L7–L9 的高耸尖锐，等级越高越高大、越多尖角。弹出时旁边出现等级徽章「Lv5」（深底熔金字）。道具（宝箱三档、血瓶）同样用 Path2D 绘制。

### 12.8 巨龙（`dragonArt.ts` + `dragonView.ts`）

**画法**：100 单位坐标；中心线用 Catmull-Rom 样条采样，按宽度函数生成渐细的「管」路径（身躯、颈、尾、四肢、翼指都是管）；鳞片是沿管排布、裁剪在管内的弧线；角、爪、背刺、骨钩是独立的弯曲三角。

**龙巢静态**（3×3 格 = 120×120 烘焙）：俯视 3/4 盘睡。两翼像斗篷盖在背上（腕钩在顶部，翼膜暗紫红到橙红），翼臂之间露出带背刺的脊背；头在下方中央朝向玩家，双对角上卷、颊角外伸、头顶冠刺，眼睛闭成两道细缝；交叠的前爪搭在下巴前；头后右侧一段颈露出浅色腹面和人字纹；尾巴从左侧绕过底部，尾尖是右下的红色铲鳍。**余烬层**（单独烘焙，叠加混合，随呼吸改 alpha）：脊背熔缝、尾腹交界熔缝、颈腹暗淡人字纹、鼻孔火光。

**待机**：3.6s 呼吸周期，scale 1.00↔1.012，余烬明灭，呼气时鼻孔冒烟，眼睛是两条细金线。

**随进度显露**：玩家 ≥ 7 级睁开一只眼（龙眼金竖瞳）；苏醒时双眼全开，龙身下亮起炉火般的暖光（随呼吸），9 粒余烬从鳞缝升起，图鉴龙格显示「可战」。

**惊扰**（生命不够时点龙巢）：睁一只眼 200ms、喷鼻烟、龙巢轻抖。

**战斗形态**（300×300 烘焙）：正面直立。蝙蝠翼高举，腕上一对向内卷的大骨钩，五根指骨向下散开，翼膜从骨边暗紫红过渡到下缘橙红；头部放大 1.15 倍，双对角（主角上翻内勾、副角外下卷）、颊侧锯齿鳍、头顶冠刺、怒眉、竖向张开的口（火核）；粗颈宽胸，下颌到胯下一条浅褐腹带，带熔火人字纹（胸口最亮）；前肢外撑上举，四根骨色弯爪；粗大腿、跗关节骨刺、宽脚掌四趾爪；尾巴绕到右侧上卷，背刺一排、腹侧一道渐暗熔缝，尾尖铲形鳍。碎片沿轮廓切分（7×6 抖动网格），碎裂时缝里透出金光。图鉴里龙的图标也用这张图。

参照图在 `art-ref/`（`dragon-ref-a.png` 战斗形态、`dragon-lair-ref.png` 盘睡，Codex 生成，提示词同目录）。`__game.dragonSheet()` 可以不打到屠龙就看全部烘焙图。

### 12.9 关键画面

**A. 标题页（390×844）**
- 全屏石墙（`#151821→#0C0E14`，大块砖），强暗角，中心压暗。左上方两道琥珀体积光柱斜穿画面（约 25°），尘埃漂浮。
- y≈22–36%：中文 Logo「地牢扫雷」（毛笔字），下方 `DUNGEON SWEEPER`。Logo 左右各一支 Canvas 蜡烛（约 x=40、x=350），火焰摇曳，Logo 外发光随烛火闪烁。
- y≈50%：远处黑暗中一对龙眼，每 6–9 秒缓缓睁开，持续 1.2 秒后闭上，睁眼时隐约看到龙首轮廓光。
- 菜单从底部 8% 起向上排，宽 260，间距 12：
  - 主按钮（260×56）：青铜渐变底、金色描边、内嵌暗环加一道金线，左右两颗菱形铆钉，2.4s 呼吸外发光。无存档【开始冒险】，有存档【继续冒险】。
  - 难度三段（260×40）：石槽，选中项金字加发光下划线。无存档时在主按钮上方，有存档时在下方。
  - 次按钮（暗青铜板）：无存档时整宽【每日挑战 · 11月1日】；有存档时【新的冒险】与【每日挑战】并排各半（不带日期）。
  - 工具行：纯文字链接「设置 ◆ 成就 ◆ 玩法」。
  - 最高分铭牌：「最高分 2,350 · 屠龙 3 次」（按所选难度），无边框，两侧渐隐细线。没有记录时 `visibility: hidden` 保留占位，切换难度时按钮不跳。
- 矮屏（≤520px 高）：标志上移缩小、次按钮并排、结算面板压缩。
- 所有面板共用同一套主 / 次按钮样式；悬停效果只在 `(hover: hover)` 设备生效。

**B. 游戏中典型画面**
- 底部入口两支火把把下方 4–5 行照成温暖的琥珀褐；烛台格在已探索区形成一团团暖光；数字以凹刻金字显示。
- 越往上越冷越暗：雾蓝的暗砖只能隐约看清轮廓，雾气缓慢流动。
- 中央龙巢：黑暗中暗红余烬随呼吸明灭，两条金色眼缝。
- 交界附近暗砖带着粉笔写的「3」「?」「○」；其中一个「7」因为 ≥ 当前生命而泛红，角上带小骷髅。

**C. 屠龙**：画面压暗只留龙巢；巨龙直立展翼占满栏宽，龙焰喷向 HUD；三道金白斩痕交叉，巨龙闪白，慢动作碎成约 60 片；金光从龙巢冲刷全图，剩余暗砖大波纹翻开，地牢第一次完全被照亮。

**D. 结算**：场景全亮并缓慢虚化压暗。刻字石板（340×520，深石底 `#1A1C24`，熔金细边框，四角铜钉）从下方升起：标题「屠龙成功」（熔金 34px/900）或「你倒下了」（深血到血红渐变），副标 `DRAGON SLAIN` / `YOU FELL`；计分逐行滚出（每行 240ms，滴答声）；总分 Cinzel 900 44px，900ms easeOutExpo 计数；「历史最高 2,050」，刷新纪录时落下「新纪录！」缎带、光束旋转、金粉爆发；统计行「等级 10 · 探索 74% · 猜中标记 6 · 用时 05:12」；新解锁成就以金色小签列在统计行下；按钮【再来一局】（主）、【查看盘面】（仅败局）、【分享】、【返回标题】（文字）。

### 12.10 网站图标与预览图

`public/favicon.png`（192，自带圆角）与 `public/og.png`（1200×630）都由 `share.ts` 的 `drawIcon` / `drawOgImage` 画出：黑暗中一双龙眼 + 一排暗砖、正中一块烛光数字砖。改画法后在开发服务器跑 `__game.exportAssets()`，POST 到 `/__asset` 写回 `public/`。

---

## 13. 动效与反馈

### 13.1 强度层级

| 层级 | 用途 | trauma | hitstop | 震动 | 粒子 |
|---|---|---|---|---|---|
| L0 微 | 翻格、UI、标记 | 0 | 0 | 0–6ms | ≤ 6 |
| L1 轻 | 1–3 级怪、宝箱、血瓶、连锁 ≥ 10 格 | 0.10–0.18 | 40–60ms | 8–12ms | ≤ 20 |
| L2 中 | 4–6 级怪、升级、肃清 | 0.22–0.30 | 70–90ms | 18–22ms | ≤ 45 |
| L3 重 | 7–9 级怪、濒死一击、新纪录 | 0.35–0.45 | 100–120ms | [25,20,35] | ≤ 70 |
| L4 史诗 | 屠龙、胜利、死亡 | 0.6–0.8 | 160–220ms | 序列 | ≤ 160 |

- **trauma 震屏**：偏移 = 10px × trauma² × noise(t·22Hz)，旋转 = 1.2° × trauma² × noise；trauma 每秒衰减 1.5，叠加封顶 1。**只震棋盘层**。
- **hitstop**：世界时间缩放 = 0，持续 N ms 真实时间，多个取最大不叠加。
- 击杀强度按等级：`trauma = 0.08 + 0.035·Lv`，`hitstop = min(120, 30 + 10·Lv)`。
- **减少动效**（设置项）：震屏 ×0.25 无旋转，翻牌时长减半，关闭慢动作和全屏闪白。

### 13.2 3D 翻牌

- 进度 p ∈ [0,1]（260ms），θ = π·easeInOutQuad(p)，挤压 c = max(0.04, |cos θ|)，抬升 L = sin(πp)。
- 翻转轴垂直于「波纹源 → 本格」方向 φ：矩阵 = `T(中心)·R(φ)·S(c·(1+0.12L), 1+0.12L)·R(−φ)·T⁻¹`，直接 `setTransform`。
- p < 0.5 画暗砖面（叠黑色 α = (1−c)·0.5），p ≥ 0.5 画背面（地面、数字或道具），永不镜像。c < 0.3 时沿轴画 2px 深色厚度条。下方阴影偏移 (0, 3L)，α = 0.4L。落定 4% 微回弹。
- 波前叠一个淡金环形光（半径扩张，α 0.25→0）。数字落定后 140ms 缩放淡入（1.3→1）。

### 13.3 事件动效表

| # | 事件 | 视觉 | 音效 | 震动 | hitstop |
|---|---|---|---|---|---|
| 1 | 按下暗砖 | 砖下沉 2px、变暗 8%；指尖火把变大；120ms 后出现蓄力环，380ms 满 | 极轻正弦 300→520Hz | — | — |
| 2 | 翻开空地 | 3D 翻牌 + 阴影；数字淡入；光照 0→0.85；4 粒扬尘 | 带通噪声 2.2kHz 35ms + 正弦 140Hz 60ms，音高 ±8% | 5ms | — |
| 3 | 连锁 | 波纹翻牌，暖光随波前流动，金环扩散 | 起手「呼」（低通噪声 300→1800Hz 250ms）；每格一个「嗒」沿 D 五声音阶上行（节流 28ms，最多 14 声） | ≥10 格 10ms | — |
| 4 | 数字减少 | 滚轮：旧数字上滑淡出、新数字下方滑入（220ms），金色闪光 | 正弦 1.6kHz 20ms −24dB | — | — |
| 5 | 数字归零 | 数字缩成火星，以本格为源连锁 | 高通噪声「嘶」80ms | — | — |
| 6 | 怪物弹出 | 120ms 快翻 → 剪影升起（scale 0.4→1.12→1，160ms easeOutBack，上浮 14px），轮廓光、眼光、等级徽章，身后暗红冲击圈，专属动作 | 低吼：锯齿 140→90Hz（越高级越低越长 120–360ms）+ 6Hz 颤音，带通 600Hz | — | — |
| 7 | 出击（280ms） | 斜向金白新月刀光 90ms，剪影闪白 ≥ 50ms | 高通噪声 3k→8k 扫频 80ms + 金属叮（两路方波 1.2kHz 失谐 7Hz） | 8/14/22ms | 30+10·Lv |
| 8 | 碎裂 | 16–20 片三角：径向 120–260px/s + 上抛，重力 900px/s²，旋转，寿命 700ms；落下焦痕骸骨贴花 | 6–10 个短噪声颗粒（带通 2–5kHz，200ms 内）+ 80Hz「咚」 | — | — |
| 9 | 扣血 | 「−5」血红跳字飞向血条；血条格段碎裂掉落，白色滞后条 300ms 追上；红色暗角（α ∝ 伤害/上限，≤ 0.35） | 正弦 90→50Hz 150ms；音乐低通闪避到 600Hz 400ms | — | — |
| 10 | 经验 | 金色光点（数 = 经验，≤ 9）贝塞尔 450ms 飞入经验条，逐个点亮宝石槽 | 每颗一个叮，1.2kHz 起逐颗升高，间隔 40ms | — | — |
| 11 | 升级 | 80ms 停顿 → 盾徽金光爆发（放射光束旋转放大），全局光照 ×1.6；「LEVEL UP」+「生命上限 +1」；血条灌满流光；经验槽按新格数弹出；40 金火花 | 三角波琶音 D–F♯–A–D′（70ms 间隔）+ 闪烁尾音 1.2s + 合唱垫 | 20ms | 80ms |
| 12 | 连升多级 | 同上，「LEVEL UP ×2」，琶音高八度再来 | 叠加 | | |
| 13 | 低血 | 红暗角呼吸（1.1s 周期），心形搏动，烛光 −10% | 心跳：每 0.9s 两下 60Hz | 进入时 [6,60,6,60,6] | — |
| 14 | 死亡 | 致命剪影放大逼近（1→1.6，600ms），0.3× 慢动作，去饱和，烛光从死亡格波纹熄灭（0.8s），「你倒下了」 | 锯齿 220→55Hz 下滑 1.4s，低通关闭；心跳放慢停止；风声 | [40,60,80] | 220ms |
| 14b | 死亡复盘 | 死后 900ms 起从致死格向外依次亮出全部未翻开怪物（深色底板 + 剪影 + 等级，每格距离 45ms，淡入 320ms），致死格红框脉动；放大的致死剪影收起；结算推迟 1200ms | — | — | — |
| 15 | 宝箱翻出 | 弹一下（1.15→1），每 3–5s 金色流光扫过 | 正弦 180Hz 60ms + 噪声 | — | — |
| 16 | 开宝箱 | 盖子开启（180ms），金光柱，6–12 枚金币飞向分数，经验光点；「+60」「+2 经验」 | 吱呀 + 金币叮当 6–10 声 | 12ms | 40ms |
| 17 | 血瓶翻出 | 液面正弦晃动，气泡，粉色光源入光照图 | 正弦 2.6kHz 40ms | — | — |
| 18 | 饮用血瓶 | 瓶子飞向血条碎成粉光，血条逐段点亮（40ms），薄荷「+5」 | 咕嘟（6 个正弦 300→900Hz）+ 治愈上行 400→800Hz 带混响 | 10ms | — |
| 19 | 满血点血瓶 | 瓶子左右摆 2 次 | 正弦 160Hz 80ms | — | — |
| 20 | 打开轮盘 | 从中心展开（0.6→1，140ms easeOutBack），11 槽依次弹出（10ms），棋盘压暗 20% | 带通噪声 1.2kHz 25ms + 正弦 420Hz | 8ms | — |
| 21 | 轮盘悬停 | 槽放大 1.18×；致命槽红色带骷髅 | 正弦 900Hz + 槽号×40Hz，15ms | 3ms | — |
| 22 | 设置标记 | 粉笔字被「写」出来（遮罩 180ms），粉笔灰 | 带通噪声 3kHz 70ms 振幅抖动 | 6ms | — |
| 23 | 清除标记 | 粉笔字左右抹去 | 低通噪声 900Hz 90ms | — | — |
| 24 | 致命首次点击 | 红光脉冲 + 抖动（±2px ×3），格子旁红色气泡「致命！再点一次硬闯」 | 方波 220Hz 双响 | 15ms | — |
| 25 | 标记猜中 | 粉笔字闪金散成星点，小字「猜中」 | E6→A6 两音上行 | — | — |
| 26 | 惊扰巨龙 | §12.8 | 锯齿 60Hz + 噪声 400ms | 15ms | — |
| 27 | 巨龙苏醒 | 双眼全开、身下暖光、余烬升起；消息「巨龙已醒 · 此后击杀分 ×2」 | 合唱垫淡入 + 远处长吼 | 20ms | — |
| 28 | 胜利冲刷 | 剩余暗砖从中心大波纹翻开（剩余怪物冒烟逃散），整图点亮，金币雨 | 凯旋号角 D–G–A–D + 定音鼓 | [30,40,30] | — |
| 29 | 肃清 | 全屏金色涟漪，生命回满，「肃清 +300」 | 钟声 523/1046/1569Hz 2s | 20ms | 60ms |
| 30 | 新纪录 | 缎带落下、光束旋转、金粉两次 | 小号琶音 | [20,30,20] | — |
| 31 | 分数变化 | 逐位滚动 400ms，旁边飘「+N」 | 轻滴答 | — | — |
| 32 | 按钮 | scale 0.96 内凹；释放 easeOutBack 回弹 | 带通噪声 1.5kHz 20ms + 正弦 300Hz | 5ms | — |
| 33 | 暂停 | 画布 CSS `blur(6px) brightness(.45)`（暂停时不重绘），面板缩放淡入 | 音乐低通到 500Hz | — | — |
| 34 | 祝福选中 | 新印章在 HUD 分数行弹入（backOut）；消息行「名字：收益，代价」 | — | — | — |
| 35 | 不屈触发 | 怪物上方飘金字「不屈！」 | — | — | — |
| 36 | 开局发牌 | 暗砖自下而上浮现（fade + scale 0.9→1，每格错开 10ms），入口火把「轰」点燃，然后起点连锁 | 噪声带通扫频 400→2000Hz + 低频隆隆 | 10ms | — |

### 13.4 屠龙序列（约 3.7s，真实时间排程，锁输入）

| 时间 | 事件 | 视觉 | 音频 | 震屏 / hitstop |
|---|---|---|---|---|
| 0.00 | 开战 | 音乐静音；除龙巢外压暗 60% | 静默 | — |
| 0.20 | 巨龙苏醒 | 战斗形态从龙巢升起放大到栏宽 90%（600ms easeOutBack），双翼展开，双眼闪光 | 巨吼：3 路失谐锯齿 110→55Hz 1.2s | trauma +0.5 |
| 0.90 | 龙息 | 龙焰锥形粒子（80 粒，`lighter`）喷向 HUD；血条 −13 逐格碎裂；红暗角 0.45 | 噪声带通扫频 300→1200Hz 700ms | trauma +0.35，hitstop 160 |
| 1.80 | 三连斩 | 三道金白斩痕交叉（间隔 90ms），每道后闪白 | 三声递升刀光 + 金属叮 | 每刀 +0.2，末刀 hitstop 220 |
| 2.25 | 闪白 | 全屏白 60% ≥ 50ms（减少动效省略） | 50Hz + 白噪声爆破 | 震动 [40,30,60] |
| 2.30 | 碎裂 | 约 60 片碎片外飞，缝透金光；时间 0.3× 600ms | 大型碎裂 + 长混响 | — |
| 2.90 | 光之冲刷 | 胜利冲刷（#28） | 凯旋号角 | — |
| 3.70 | 结算 | 结算石板升起 | | |

屠龙和死亡序列用 `atReal` 排程：序列内部本身包含 hitstop 和慢动作，用世界时间会让总时长漂移。

### 13.5 待机动画

烛火摇曳与余烬；每 4–7 秒随机一块暗砖被「尘光」掠过；雾与体积光缓慢漂移；心形图标每 1.6s 一跳（低血加快）；盾徽每 6s 一道流光；图鉴剪影轻微上下浮动（各自相位）；巨龙呼吸；宝箱流光；血瓶液面晃动。

---

## 14. 音频（全部 WebAudio 实时合成）

### 14.1 节点图

```
sfxBus(1.0) ──────────────┐
musicBus(0.6) → musicLP → musicDuck ─┤→ master(0.8) → DynamicsCompressor(threshold −18, ratio 4, knee 8, attack 4ms, release 200ms) → destination
              ↘ send ↘                │
         ConvolverNode（程序化 IR：2.8s 指数衰减立体声噪声）
```

- 首次 `pointerdown`/`keydown` 创建并 `resume()` AudioContext（`latencyHint: 'interactive'`）；`suspended` / `interrupted`（iOS）时下次手势恢复。
- 同时发声最多 24；同名音效最短间隔节流（`gate(name, ms)`）；噪声缓冲启动时生成 1 秒循环复用。
- 音效 / 音乐开关分别保存；`?mute=1` 静音启动。大事件时音乐压低 6dB。

### 14.2 合成原语

`AudioEngine.tone(type, f0, f1, start, dur, gain, opts)`：振荡器，频率 f0→f1 指数滑动，线性起音后指数衰减；可选失谐、滤波、颤音、混响 send。`noiseBurst(start, dur, gain, filterType, f0, f1, q, opts)`：循环噪声缓冲过滤波器，频率扫动。`gate(name, ms)`：同名节流 + 24 声上限。

`Sfx` 的每个方法是一个「配方」，参数见 §13.3 音效列。例：石「嗒」= 带通噪声 2.2kHz 35ms（增益 0.22，Q 2.5）+ 正弦 140→120Hz 60ms，音高 ±8% 随机，节流 28ms。

### 14.3 程序化背景音乐（D 多利亚，无固定节拍）

1. 底层持续音：锯齿 D2 和 A2，失谐 ±6 音分，低通 320Hz，0.07Hz LFO 调截止 ±80Hz，增益 0.05。
2. 洞穴风：白噪声带通 600Hz（Q 0.5），中心频率 0.03Hz LFO 在 300–900Hz 摆动，增益 0.015。
3. 水滴：每 2.5–6s 一次，{D5, F5, A5, C6} 中取音的正弦，4ms 起音、180ms 衰减，混响湿度 0.6。
4. 竖琴动机：每 8–14s 一句，3–5 个音取自 D F G A C，三角波拨弦（快衰减 + 低通）。
5. 紧张层（按 `danger` 淡入淡出）：每 1.2s 一声低鼓（正弦 55Hz 下滑）+ 高音震音弦（锯齿 587Hz，6Hz 颤音，低通 1200Hz，增益 0.01）。
6. 苏醒层：巨龙苏醒后合唱垫（锯齿 D3 F3 A3，失谐，缓慢膨胀）淡入。

### 14.4 震动

`navigator.vibrate`（iOS Safari 不支持，静默忽略）。全部经过 `haptics.ts`：设置可关；最短间隔 40ms；`navigator.userActivation.hasBeenActive` 为 false 时不调用（避免浏览器干预警告）。

---

## 15. 界面与流程

### 15.1 流程

```
加载（DOM 标题 < 300ms 可点）
  └▶ 标题页 ─┬ 继续冒险（有存档）──▶ 读档，盘面直接落定
             ├ 开始 / 新的冒险 ──▶ [首次?] ─是─▶ 引导局（可跳过）─┐
             │   （有存档时先确认「放弃进行中的冒险？」） └否─▶ 普通局 ◀─┘
             ├ 难度三段（只影响新开的普通局）
             ├ 每日挑战（每天一次）──▶ 每日局
             ├ 设置 / 成就（覆盖层）
             └ 玩法 = 重看引导
  游戏中 ── ‖ / Esc / 失焦 ──▶ 暂停（继续 / 重开（每日局无）/ 设置 / 回标题）
  胜利 ──────────────▶ 结算 ──再来一局──▶ 新局（同一场景重置；每日局之后开普通局）
  死亡 ─▶ 复盘 ─▶ 结算 ──查看盘面 ⇄ 返回结算 / 分享 / 返回标题
```

### 15.2 转场

| 转场 | 做法 | 时长 |
|---|---|---|
| 标题 → 游戏 | 按钮下沉淡出 200ms，Logo 上浮淡出 300ms；背景墙向上视差滚动（像镜头下潜）；棋盘框淡入；暗砖自下而上发牌；入口火把点燃；起点连锁；HUD 从上滑入，血条经验条从 0 缓动 | 约 1.4s，第 300ms 起可点（被点的格子提前落定） |
| 游戏 → 结算 | 胜利 §13.4；死亡 #14 + 复盘；场景虚化压暗，石板 easeOutBack 升起 420ms | 约 0.8s + 计数 |
| 结算 → 新局 | 石板下沉 250ms；所有格子反向快速波纹翻回暗砖（从四周向入口收拢 400ms），烛光熄灭；新图入口点燃 | 约 1.0s |
| 面板开 / 关 | scale 0.92→1 + 淡入 220ms easeOutBack / 淡出 160ms | |
| 返回标题 | 渐暗到深渊黑 300ms，标题元素依次淡入 | 0.6s |

### 15.3 HUD（390×844，cell 40）

| 元素 | 说明 |
|---|---|
| 等级盾徽 52×56 | 盾形，熔金边，「LV」10px，等级 Cinzel 900 26px |
| 生命条 252×22 | 分段（每点 1 段），血红液面加高光，左端心形 22px 压边，右侧「7 / 9」；上限够挑战时在挑战血量那一段画金色「屠龙线」刻度和小龙头 |
| 经验条 252×12 | 宝石槽（每点 1 槽），亮槽熔金 |
| 暂停钮 40×40 | 圆形石钮 ‖，可点区扩到 48×48 |
| 分数行 | 左「分数」+ 熔金数字；中间是已选祝福的朱红印章（新的弹入）；右沙漏 + 计时 `02:31`；引导时中间换成「跳过引导」 |
| 棋盘 | 外框 6px 刻花石框 + 四角铜钉 |
| 消息行 | 13px 居中。常驻底文是巨龙状态：「巨龙沉睡中 · 需 14 点生命」（普通色）/「巨龙已醒——点击龙巢挑战」（金色）；临时消息（带时长，如苏醒时「巨龙已醒 · 此后击杀分 ×2」3.5s、低血警告、祝福说明）盖在底文上，到时恢复 |
| 怪物图鉴 76 高 | 10 槽：等级数字、剪影 26px、「×5」；凹陷深板 `#0F1117` + `#2A3242` 边；数量为 0 时剪影 25% 并打粉笔斜杠；最后一槽是巨龙（偏红底，「需14」→「可战」金色呼吸） |

HUD 数字也走字形图集。HUD 显示值由 Director 推进（不直接读 `game.player`）。

### 15.4 标记轮盘（手机好用第一）

- **触发**：按住未翻开格 120ms 出现蓄力环，380ms 弹出并轻震 8ms。桌面右键立即弹出。
- **几何**：环半径 78px，11 个槽（直径 42px），从正上方顺时针 `1 2 3 4 5 6 7 8 9 ? ○`（间隔 32.7°）。中心是「✕ 清除」（已有标记时）或「取消」。底盘半径 104px 深石圆盘（α 0.92），刻符文环。
- **边缘**：轮盘中心钳制在栏内，距边 ≥ 106px；偏移时画一条细线连回原格，原格高亮。
- **两种用法**：① 按住滑选：滑到槽上松手确认（判定为离指针最近的槽中心，距离 ≤ 槽半径 × 1.35）；② 松手点选：长按后原地松手轮盘保持打开，再点槽确认，点外面关闭。滑到空白处松手 = 关闭不改动。
- **信息**：数字槽 ≥ 当前生命（按修正后伤害）时红色带骷髅；轮盘上方一行小字「此格周边上限 ≤ 3」（`boundAt`，只整理已有信息）。
- **标记外观**（画在光后层）：粉笔白手写数字（Cinzel 600 烘焙 + 噪点 `destination-out` 做颗粒，2 个变体）+ 下方短弧线 + 冷白微光；致命时转致命红 + 1.2s 余烬脉冲 + 右上小骷髅（生命变化时实时切换）；`?` 粉笔问号 α 0.75；`○` 薄荷粉笔圈。

### 15.5 面板（DOM，`ui/screens.ts`）

所有面板挂在 `#ui` 下，按钮用 `data-act` 分发，带稳定 id（便于自动化测试）。

| 面板 id | 内容 |
|---|---|
| 标题 | `#btn-continue`、`#btn-start`、`#diff`（radiogroup）、`#btn-daily`、`#btn-settings`、`#btn-ach`、`#btn-howto`、铭牌 |
| `#panel-pause` | 「暂停」；`#btn-resume`、`#btn-restart`（每日局无，二次确认）、`#btn-psettings`、`#btn-ptitle`；音效 / 音乐快捷开关；底部「冒险者 · 种子 #123456」或「每日挑战 · 11月1日」；已选祝福列表（印章、收益、代价） |
| `#panel-settings` | 开关：音效、音乐、震动、减少动效、数字快开；`#btn-rewatch` 重看引导；`#btn-clear` 清除记录（二次确认）；`#btn-close-settings` |
| `#panel-ach` | 标题旁「n / 16」；16 项，已解锁在前（金色 ★），未解锁压暗（☆）但写明条件；`#btn-close-ach` |
| `#panel-bless` | 三张卡：朱红印章 + 名字 + 收益（米色）+ 代价（红色）；点卡即选，无取消 |
| 对话框 | 小石板，`#dlg-no` / `#dlg-yes`（主按钮在右）；Esc 取消、Enter 确认 |
| `#panel-result` | §12.9 D；`#btn-replay`、`#btn-review`（败局）、`#btn-share`、`#btn-rtitle` |
| Toast / 引导气泡 | §10 |

### 15.6 分享（`ui/share.ts`）

- 分享卡 1080×1350 Canvas：标题、模式（每日日期 / 种子）、胜负、总分、等级·探索率·用时、9×12 迷你地图。
- 文字：

文字 = 标题行（`地牢扫雷 · 每日挑战 11月1日` 或 `地牢扫雷 · 冒险者 · 种子 #123`）+ 成绩行（`屠龙成功 2,684 分 · 04:52` 或 `倒在了 Lv7 · 620 分`，后接 ` · 探索 76%`）+ 12 行 emoji 地图（已翻开 🟨、未翻开 ⬛、龙巢 🟥、龙巢中心 🐉、败局致死格 💀）+ 链接（普通局带 `?seed=`，每日局不带）。

- 地图**不暴露怪物位置**，每日挑战分享不剧透。
- 顺序：`navigator.canShare({files})` 带图分享 → 纯文字分享 → 复制到剪贴板 → 下载分享图。

### 15.7 桌面与平台

- 两张画布：`#bg` 铺满窗口（DPR 1，30fps），`#game` 只覆盖居中的游戏栏（DPR ≤ 2）。
- 两侧装饰：更大更暗的石墙；每侧约 35% 高度一支壁挂火把（铁托架）在墙上投光池；垂下的铁链随鼠标轻微视差（±4px）。栏两侧半透明石柱过渡，不出现白边或纯黑边。
- 鼠标：悬停格高亮 + 火把光跟随；右键开轮盘（屏蔽系统菜单）。

---

## 16. 调试接口

URL 参数：

| 参数 | 作用 |
|---|---|
| `?debug=1` | 左上浮层：FPS、帧时间（均/峰）、粒子数、绘制调用数、种子（含第几次重抽）；暴露 `window.__game`；控制台打印 `validateConfig()` 错误 |
| `?seed=<整数>` | 固定种子（「再来一局」沿用）；固定种子局在主线程同步选盘 |
| `?tutorial=1` / `?tutorial=0` | 强制 / 跳过引导 |
| `?mute=1` | 静音启动 |
| `?fast=1` | 所有演出 ×3 速（`clock.scale = 3`） |

`window.__game`（仅 debug；同步返回，等演出用 `await __game.idle()`）：

| 方法 | 说明 |
|---|---|
| `state()` | `{phase, seed, diff, titleDiff, awakeKillXp, blessings, offer, hp, maxHp, level, xp, xpToNext, score, gold, timeMs, revealed, alive: {1..9: n}, dragonAwake, isTutorial}` |
| `board()` | 9×12 数组 `{x, y, kind, level, revealed, dead, mark, number}`（真相，`kind` 为字符串） |
| `cellCenter(x, y)` | 该格中心的客户端坐标（给 Playwright 点击） |
| `tap(x, y)` / `longPress(x, y)` / `mark(x, y, m)` | 走真实输入管线 |
| `radialOpen()` / `radialSlot(k)` | 轮盘是否打开（返回模式 `'hold' \| 'tap'` 或 null）/ 第 k 个槽位的客户端坐标 |
| `app` | App 实例本身（测试时驱动 `app.loop.tick(t)` 等） |
| `revealSafe()` | 翻开所有非怪物格（不拾取） |
| `xray(on)` | 叠加真相（怪物等级半透明） |
| `addXp(n)` / `setHp(n)` / `setLevel(n)` / `heal()` | 数值作弊 |
| `bless(id?)` | `bless('leech')` 直接获得（已有返回 false）；`bless()` 多排一次三选一，返回候选 |
| `killAll()` | 按等级从低到高击杀全部怪物（自动补血） |
| `dragonReady()` / `fightDragon()` | 设为可挑战 / 直接进屠龙序列 |
| `win()` / `lose()` | 直接结束 |
| `newGame(seed?)` / `restart()` | 新局（结算界面调用时走「再来一局」流程） |
| `difficulty(d)` | 设定之后新开普通局的难度，返回当前值 |
| `achievements(reset?)` | 返回已解锁成就；`reset = true` 先清空 |
| `startTutorial()` / `skipTutorial()` | 引导 |
| `timeScale(s)` | 全局时间缩放 |
| `fx(name)` | `'levelup' \| 'shatter' \| 'shake' \| 'fullclear' \| 'record' \| 'death'` |
| `idle()` | Promise：演出全部结束后 resolve |
| `clearSave()` | 清除本游戏全部本地存储 |
| `perf()` | 近 120 帧帧时间统计 |
| `shareCard()` | 叠一张本局分享卡预览（再调或点击关闭） |
| `dragonSheet(bg?)` | 叠一张巨龙烘焙图总览：巢中本体、余烬层、战斗形态、白闪剪影 |
| `exportAssets()` | 仅开发服务器：把 favicon 与 OG 图写进 `public/` |

> 在后台标签 / 隐藏面板中 RAF 会被节流；自动化测试可以用假时间戳直接驱动 `__game.app.loop.tick(t)`。

---

## 17. 性能预算

| 项 | 预算（中端手机，390×844，DPR 2） |
|---|---|
| 帧率 | 稳定 60fps；单帧 CPU ≤ 8ms（桌面 ≤ 4ms） |
| 首屏 | DOM 标题 ≤ 300ms；全部烘焙 ≤ 120ms |
| 首包 | ≤ 130KB（JS ≤ 75KB gz + 字体约 43KB） |
| 绘制调用 | 常态 ≤ 450/帧，屠龙峰值 ≤ 900 |
| 对象上限 | 粒子 400、碎片 160、跳字 24、光点 48、tween 256、发声 24 |
| 内存 | 画布总量 ≤ 30MB；稳态每帧零分配 |

策略：
1. **烘焙一切**：运行时**禁止** `shadowBlur`、`ctx.filter`、每帧 `createRadialGradient`、`getImageData`、逐帧 `fillText`。
2. 低分辨率光照图（88×112）放大合成。
3. SoA + 对象池：粒子、碎片、tween、格子视图状态（`Float32Array`：翻转开始、方向、光照、目标光照、显示数字、滚轮时间、按压、标记动画、脉冲……）。
4. 直接 `setTransform`，按状态批量绘制。
5. **自适应质量**：连续 2 秒平均帧时间 > 18ms 降一档，依次：关雾 → 粒子上限减半 → DPR ×0.75。不回升，避免抖动。
6. 暂停或页面隐藏停 RAF；`#bg` 30fps。
7. 逻辑事件驱动，无每帧逻辑；粒子固定步长积分。

---

## 18. 平衡模拟与验收标准

### 18.1 `pnpm sim`

`node scripts/sim.ts [局数=150] [起始种子=1] [难度=easy,normal,hard] [--raw] [--nobless]`

- 每档用 `pickBoard(seed0 + k, false, 1e9, diff)` 生成选盘后的盘面（预算无限，保证可复现）。
- 三种机器人画像：

```ts
const PROFILES = {
  novice:  { maxNodes: 60,   slip: 0.04,  msPerAction: 4000 },                              // 祝福随机选
  skilled: { maxNodes: 600,  slip: 0.012, msPerAction: 3000, blessPref: BLESS_PREF },
  expert:  { maxNodes: 3000, slip: 0,     msPerAction: 2000, blessPref: BLESS_PREF_EXPERT },
};
// 每局 rand = new Rng((seed0 + k) * 7919 + 13)
```

- 输出每档每画像：胜率、每局致命猜测、胜局均分、期望分、余血、击杀、肃清率。`--raw` 额外跑未选盘的盘面对照；`--nobless` 关掉祝福。
- 冒险者额外跑**贪心曲线**：skilled / expert 在 14、15、16、17 血和「清空」时才屠龙。
- 不达标退出码 1。

### 18.2 检查目标

```ts
const TARGETS = {   // 够血即屠龙的胜率 [下限, 上限] %
  easy:   { novice: [50, 75], skilled: [85, 100], expert: [95, 100] },
  normal: { novice: [20, 40], skilled: [55, 80],  expert: [95, 100] },
  hard:   { novice: [0, 15],  skilled: [25, 50],  expert: [95, 100] },
};
// 另：validateConfig() 无错误；expert 在 minHp..minHp+2 血屠龙的期望分最差 ≥ 最好 × 0.85
```

### 18.3 现版本实测（150 局，种子 1–150）

| 难度 | novice 无祝福 → 有 | skilled 无 → 有 | expert 无 → 有 |
|---|---|---|---|
| 学徒 | 66.7 → 62.7 | 91.3 → 88.0 | 100 → 99.3 |
| 冒险者 | 28.0 → 36.0 | 70.7 → 73.3 | 100 → 97.3 |
| 英雄 | 9.3 → 12.7 | 46.7 → 47.3 | 100 → 98.7 |

冒险者专家在 14 / 15 / 16 血屠龙的期望分约 2,515 / 2,735 / 2,563（相差 8%）。

专家无祝福 100%，是因为选盘本身保证专家机器人无需致命猜测；有祝福偶尔会输，是路线偏离了选盘时验证的那条（洞察让它先去打已知的大怪、屠夫让它白打小怪），之后被迫猜。真人也不会走验证路线，所以专家下限是 95。


### 18.4 改完之后的检查清单

- [ ] `pnpm build` 零错误零警告；`pnpm sim` 全部 `[ok]`；浏览器控制台零报错。
- [ ] `?seed=123` 两次打开得到同一盘面；中途刷新能读档继续，致命一击刷新后仍是死亡。
- [ ] 首次进入走完引导（8 步），`{hold}` 在触屏显示「长按」、鼠标显示「右键」。
- [ ] 数字 = 周围未翻开存活怪物等级和；击杀后数字滚动减少；归零自动连锁。
- [ ] 致命标记二次确认；快开；满血血瓶无效。
- [ ] 升到祝福等级弹三选一，选择期间计时暂停，读档后候选不变；10 张卡效果与代价正确。
- [ ] 生命不够点龙巢只惊扰；够血弹确认；屠龙序列约 3.7s；结算分项正确，最高分只计胜局。
- [ ] 死亡复盘亮出剩余怪物；败局可【查看盘面】。
- [ ] 每日挑战每天一次，分享文字不暴露怪物。
- [ ] 16 个成就可解锁；三档难度记录分开。
- [ ] 390×844、桌面、横屏手机三种布局都不裁切；控制台零报错；60fps。

---

## 19. 附录：示例数据

### 19.1 一次战斗的事件序列

场景（示意，格子下标为举例）：冒险者，玩家 Lv1、生命 4/5、经验 1/3，巨龙未醒。点击 (6,11)（下标 105）的一只 2 级蝙蝠，它有两个已翻开的邻格 95、104，数字分别是 2 和 3。

```json
[
  { "t": "fight", "cell": 105, "level": 2, "hpBefore": 4, "hpAfter": 2, "lethal": false, "score": 20, "rage": false, "undying": false },
  { "t": "xp", "amount": 2, "from": 105, "source": "monster" },
  { "t": "levelUp", "from": 1, "to": 2, "maxHp": 6 },
  { "t": "numbers", "cells": [95, 104], "before": [2, 3], "after": [0, 1] },
  { "t": "reveal", "origin": 105, "cells": [105, 96, 86, 87, 106, 107] }
]
```

演出时间线（世界时间，从点击起）：0ms 快翻 120ms → 100ms 剪影弹出 → 280ms 出击（刀光、生命 4→2、hitstop 50ms、trauma 0.15）→ 300ms 数字滚轮 → 320ms 经验光点起飞，约 770ms 到达 → 升级演出（生命灌满到 6/6）；380ms 起波纹翻开。

### 19.2 选祝福

冒险者升到 6 级，`rollOffer(seed, 0, [])` 给出候选，玩家选「噬血」：

```json
// gainXp 中推出
{ "t": "blessOffer", "offer": ["leech", "bounty", "armor"] }
// chooseBlessing('leech') 返回（maxHp 10 → 9，hp 10 → 9）
[ { "t": "bless", "id": "leech", "cells": [] } ]
```

选「洞察」时 `cells` 为被标出的两格，并紧跟两条 `mark` 事件。

### 19.3 存档示例（节选，「…」处省略）

```json
{
  "v": 1, "seed": 482913, "regen": 3, "tutorial": false, "daily": null, "diff": "normal",
  "revealed": "0000…（共 108 位，龙巢 9 格恒为 1）…0111",
  "collected": "0000…（共 108 位）…0000",
  "mark": [0, 0, 0, "…共 108 项…", 3, 0, -1, 0],
  "player": { "level": 4, "hp": 6, "maxHp": 8, "xp": 2 },
  "gold": 40, "kills": 6, "killXp": 11, "awakeKillXp": 0, "closeCall": false,
  "correctMarks": 2, "fullCleared": false, "dragonAwake": false, "timeMs": 74210, "marksPlaced": 4,
  "blessings": [], "offersDue": 0, "undyingUsed": false, "bountyXp": 0, "known": [0, 0, "…共 108 项…"]
}
```

### 19.4 分享文字示例

```
地牢扫雷 · 冒险者 · 种子 #482913
屠龙成功 2,684 分 · 04:52 · 探索 76%
🟨🟨⬛⬛⬛⬛🟨🟨🟨
🟨🟨🟨⬛⬛🟨🟨🟨🟨
🟨🟨🟨🟨🟨🟨🟨🟨⬛
⬛🟨🟨🟨🟨🟨🟨🟨⬛
⬛🟨🟨🟥🟥🟥🟨🟨⬛
⬛🟨🟨🟥🐉🟥🟨🟨🟨
🟨🟨🟨🟥🟥🟥🟨🟨🟨
🟨🟨🟨🟨🟨🟨🟨⬛⬛
🟨🟨🟨🟨🟨🟨🟨🟨⬛
🟨🟨🟨🟨🟨🟨🟨🟨🟨
🟨🟨🟨🟨🟨🟨🟨🟨🟨
🟨🟨🟨🟨🟨🟨🟨🟨🟨
https://<部署域名>/dungeon-sweeper/?seed=482913
```

### 19.5 结算明细示例（冒险者胜局，觉醒后多打了几只）

| 行 | 明细 | 分 |
|---|---|---|
| 击杀 | 24 只（觉醒前等级和 82） | 820 |
| 龙怒 | ×2（觉醒后等级和 18） | 360 |
| 金币 | 4 个宝箱 | 300 |
| 屠龙 | | 1,000 |
| 余勇 | 生命 2 × 60 | 120 |
| 迅捷 | 04:52（600 − 292） | 308 |
| **总分** | | **2,908** |

核对：击杀经验 100 + 宝箱经验 8 = 108，落在 11 级区间（累计 93–108），上限 15，屠龙后剩 15 − 13 = 2。

统计行：等级 11 · 探索 81% · 猜中标记 5 · 用时 04:52。

---

## 20. 风险与对策

| 风险 | 对策 |
|---|---|
| 低端机全屏合成掉帧 | 光照图低分辨率；不用滤镜和阴影模糊；静态层缓存；自适应质量四级降档；DPR 上限 2 |
| 黑暗太重、看不清暗砖或标记 | 暗砖基色偏亮（albedo 和光照分离）；远处可见度保底 0.12；前沿渗光；指尖火把；标记画在光后层并带自发光；截图逐项检查对比度 |
| 「数字 = 等级和」和「数字会变」难理解 | 引导前两步专门教；数字滚轮动画让变化可见；图鉴给出全局剩余；消息行实时说明 |
| 平衡偏难或偏易 | 数值集中在 config；模拟脚本可重跑；debug 接口快速验证后期；引导局使用固定的温和布局 |
| 长按与系统手势冲突（iOS 放大镜、文本选择、右键菜单） | CSS 禁用加 `preventDefault`；`setPointerCapture`；长按期间屏蔽 `contextmenu` |
| 演出和逻辑不同步 | 逻辑同步结算、视图只消费事件；director 支持快进；R12 输入锁 |
| 字体加载晚于烘焙 | `FontFace.load()` 最多等 300ms（`FONT_WAIT_MS`，首屏预算）；超时先用衬线回退烘焙，加载完成后重烘字形图集 |
| iOS 音频解锁或中断 | 每次手势都检查 `ctx.state`；`interrupted` 时恢复；静音开关独立 |
| 范围膨胀 | 严格按 P0 → P1 → P2；阶段 A 先保证完整流程可玩，再叠加画面 |
| 种子重抽导致复现不一致 | 重抽使用确定性的 `seed + k` 序列，debug 浮层显示「种子 #s（第 k 次重抽）」 |

---

## 21. 修改记录

各轮修改的原始记录（表中的 §编号指当时的旧版文档）。

### 21.1 实现偏差记录（阶段 2）

| 项 | 文档原设计 | 实际实现 | 原因 |
|---|---|---|---|
| 自适应质量 | 四档，含光照图减半 | 三档：关雾 → 粒子减半 → DPR ×0.75 | 光照图本身很小，减半收益低，而且会出现块状边缘 |
| 屠龙序列和死亡序列时钟 | 未指定 | 按真实时间排程（`atReal`），不受 hitstop 和慢动作影响 | 序列内部本身包含 hitstop 和慢动作，用世界时间排程会让总时长漂移 |
| 引导局怪物配额 | 未写明 | 随机配额扣除 `CONFIG.tutorial.countsDelta`（1 级 −2、2 级 −1） | 底部固定布局已手工放入这几只怪，扣除后全局怪物数量与正式局一致 |
| 跳过引导按钮 | 右上角 | 分数行正中 | 右上角与暂停键和桌面 HUD 重叠 |
| 引导气泡 | 未指定 | 棋盘下方，盖住图鉴 | 不挡引导格和轮盘 |
| Toast | 未指定 | 棋盘上沿内侧 | 不挡分数和计时 |

### 21.2 优化轮修改（阶段 3，依据评审 round1）

| 项 | 修改 | 说明 |
|---|---|---|
| 「数字 = 等级之和」 | 引导新增第 0 步：在两只暗砖怪上标出 Lv1、Lv2，数字格下方显示「1 + 2 = 3」，3.4s 后自动进入下一步；常驻提示改为「数字 = 周围怪物等级之和 · 点击翻开 · 长按标记」 | 评审反馈：玩家把数字当成怪物个数 |
| 光照 | 已探索地面：环境亮度 0.46，并在每格做软斑；蜡烛：半径 (2.0 + 0.12·闪烁)T，暖色光池，带闪烁；前沿：未翻开的格再叠一层冷色压暗（0.42 × 未受光程度），暗砖基色压暗为 #3E475A→#2B3243，高光减弱 | 评审反馈：原先前沿反而最亮。新模型是暖色烛光池 + 冷暗前沿 |
| 蜡烛 | 缩小并放在格子左下角；同格数字右移、上移 | 火焰不再盖住数字 |
| 提示 | 队列化，一次只显示一条，间隔 `tipGapMs` = 1.5s；玩家第一次操作前、引导中、演出锁定和弹窗期间都不显示；低血提示按真实 HP 判断 | 修复刷屏和误报 |
| 致命提示 | 被点的格子旁边显示红色气泡「致命！再点一次硬闯」 | 原先只在消息行显示，离视线远 |
| 横屏 | 当 `vw ≥ 1.2·vh` 且 `vh < 620` 时，棋盘在左、HUD 面板在右；格子大小按高度计算 | 修复手机横屏底部被裁 |
| 跳过按钮 | 视觉高度 28px，通过伪元素把可点区域扩到 44px | 达到触控尺寸，又不挤分数行 |
| 结算 | HUD 分数同步为结算总分（1.2s 滚动）；胜利后数字淡出；结算面板背后的场景模糊并压暗 | 消除分数不一致 |
| 标题 | 两道体积光、更密的灰尘、中心压暗、双层暗角 | 增强氛围 |
| 被迫猜测 | 生成期加入求解机器人校验：只看可见信息，回溯约束（按连通块，3000 节点上限）；同一种子按 `seed + k` 最多重抽 16 次，取第一个「机器人能赢且没有致命猜测」的盘面。随机局在 Web Worker 里预取下一局；固定种子局在主线程同步挑选（2.5s 预算） | 用强机器人（20000 节点）评测 200 局：原始盘面胜率 89%、有致命猜测的局 15%；挑选后胜率 98%、有致命猜测的局 4%。挑选平均耗时 86ms，在 Worker 中运行。没有做到完全消除猜测：完全无猜测的生成会明显拖慢生成，而且会削弱「等级和」带来的风险取舍 |
| 提示时效（round2） | 由操作触发的提示（巨龙、归零、宝箱、血瓶）插到队首，可在 0.9s 后打断上一条，2.5s 内没显示就丢弃；普通提示 12s 后过期 | 避免点完巨龙巢穴约 7s 才出提示 |
| 入口火把（round2） | 从 (3,11) 和 (5,11) 两格移到楼梯格左右两侧，缩小到 0.7 倍；火光光源同步移动 | 楼梯格没有数字，相邻格数字不再被挤 |
| 横屏格子（round2） | 上下不留边，边框 3px：844×390 下格子 30 → 32px（12 行竖排在 390px 高度下的上限） | 再放大就要把棋盘转成横向 12×9，牵涉所有坐标代码，暂不做 |

### 21.3 发布前补齐（阶段 4）

| 项 | 修改 | 说明 |
|---|---|---|
| 中途存档 | §6.5b | 刷新或切后台不再丢局；先存后演出，刷新不能撤销死亡 |
| 死亡复盘 | 死亡 0.9s 后从致死格向外依次亮出全部未翻开的怪物（深色底板 + 剪影 + 等级），致死格红框脉动；复盘层画在死亡去饱和之后，保留颜色；放大的致死剪影收起，不再盖住 HUD；结算面板推迟 1.2s 出现；败局结算有【查看盘面】，面板沉到屏外、底部【返回结算】。数值在 `CONFIG.review` | 原先死亡直接模糊盖结算，看不到是谁打死的、剩下什么 |
| 每日挑战 + 分享 | §6.9 | |
| PWA / 图标 / OG | §6.10 | |
| 「新纪录」 | 最高分只计胜局 | 败局也弹「新纪录」 |
| 调试 `newGame()` 卡死 | 结算界面调 `newGame()` / `restart()` 改走 `replay()` | 原先跳过了收起结算面板 |
| 标题菜单 | 菜单从底部定位，铭牌并入菜单流；矮屏（≤520px 高，手机横屏）下标志上移缩小、【新的冒险】与【每日挑战】并排、结算面板压缩、得分行两列 | 菜单多了一两行，避免与铭牌、标志重叠 |
| 暗砖对比 | 已探索地面环境亮度 0.46 → 0.56；暗砖压暗 0.42 → 0.55；暗砖格从暖色辉光层扣掉 85%（`hiddenGlowCut`），烛光不再把前沿暗砖染成地面的暖色。同一盘面实测（格内亮度）：已探索最暗 50 → 54，前沿暗砖最亮 77（暖）→ 39（冷） | 原先前沿暗砖被烛光照亮后比远处的已探索地面还亮，易误判 |
| 低血提示与死亡同时出现 | 提示只在本局存活时出队；死亡时清空队列并收起已显示的提示 | 非紧急提示可能恰好在点怪到死亡锁定之间的约 200ms 出现，并盖在死亡演出上 |
| 首屏 | 生产构建实测：字体在脚本之后 1–2ms 内就绪（本地冷启动约 143ms，SW 缓存约 23ms），首屏在预算内；开发模式的 2.3s 不代表线上。字体等待上限 1.5s → 300ms，慢网下不再黑屏等字体 | |
| 删除辅助文字 | 标题页「点击任意处开启声音」（首次点击本来就会解锁音频）；对局底部前 3 局的规则提示条（引导第 0 步已教「数字 = 等级之和」） | 按约定删去辅助文字 |
| 构建 | `vite.config.ts` 改由 `tsconfig.node.json` 检查（新增 devDependency `@types/node`），`pnpm build` 依次检查游戏代码、配置文件再打包 | 配置里的开发中间件和 SW 插件需要 Node 类型，不让 Node 全局类型混进游戏代码 |


### 21.4 长线可玩性第一批（阶段 5）

| 项 | 修改 | 说明 |
|---|---|---|
| `pnpm sim` | `scripts/sim.ts`；求解器拆出 `playBot(g, opts)`：推理深度、失手率、每步计时、屠龙血量（贪心程度）都可调；`solveGame` 保持原行为（专家、够血即走），选盘校验不变 | 设计期脚本只在 scratchpad，规则会和游戏漂移。逻辑模块改用带 `.ts` 后缀的相对导入（`allowImportingTsExtensions`），Node 可以直接运行；`scripts/` 由 `tsconfig.node.json` 检查 |
| 难度档 | §3.8 | 盘面数据带 `diff`，生成、选盘、规则、HUD 屠龙线和提示文字都按该档数值；存档带难度，旧存档按冒险者读 |
| 龙怒与余勇 | §3.9 | 消除「够血就走」的唯一最优解。注意：余勇翻倍让同样的胜局比以前多 30–150 分，此前的最高分偏低 |
| 成就 | §6.11 | 第一批 16 个 |


### 21.5 视觉打磨：菜单与巨龙

| 项 | 修改 | 说明 |
|---|---|---|
| 标题菜单 | §4.7 A：青铜主按钮、石槽难度选择、并排次按钮、文字链接工具行、无框铭牌 | 原先是一摞同样重的暗色方框，层级不清 |
| 巨龙美术 | §4.6：新文件 `view/dragonArt.ts`；`shapes.ts` 里的 `DRAGON_LAIR` / `DRAGON_CRACKS` / `DRAGON_RISE` 删除 | 原先巢中是看不出形状的黑团加随机橙色弧线，战斗形态像卡通猫 |
| 苏醒效果 | 巢外的金红光圈改为身下暖光加升起的余烬 | 光圈糊成一片米色，盖住龙 |
| 调试 | `__game.dragonSheet()` | 调龙的造型时不用打到屠龙 |
| 战斗形态再修 | §4.6：倒三角躯干、趾行后腿、抬起的前爪、细长 S 形颈、尾背刺；`claw()` 支持旋转 | 原先下半身是一团、腿短粗，双臂下垂像抱着肚子
| 战斗形态按参照图重画 | §4.6：Codex 出 3 张参照（厚重 / 精瘦 / 以旧图重画），选厚重版 A 重画全部几何与配色；`hook()` 画骨钩；口与眼位置随头部放大更新 | 前一版体态仍然别扭
| 睡龙按参照图重画 | §4.6：以战斗形态参照图为输入让 Codex 出睡姿参照，按它重画盘龙，与战斗形态同一套配色和骨钩画法 | 两种形态风格不一致 |
| 废弃 PWA | §6.10：删去 manifest、Service Worker、主屏图标和 `apple-mobile-web-app-*` meta；保留 favicon 与 OG 图；启动时注销旧 Service Worker 并清缓存 | 不再支持安装到主屏 / 离线 |
| 引导文案 | §6.2：全部气泡改写（参考 Gemini 经 `agy` 给的改写）：说清「为什么」那块是 1 / 3 级、点之前讲「血不够会被打死」、1b 补上「数字归零会自动翻开周围」、标记步写明「先别打，长按」；每条在 390 宽下 ≤ 2 行 | 试玩反馈：看不太懂 |
| 长按 / 右键按设备落字 | 引导文案写 `{hold}`，显示时按玩家最近一次按下的指针类型换成「长按」（触屏）或「右键」（鼠标）；还没按过时用 `(hover: hover) and (pointer: fine)` 猜（`Input.usesMouse`）。去掉了「（电脑右键）」括注 | 试玩反馈：同时写两种操作不如直接说对的那种 |
| 切难度时菜单跳动 | 铭牌没记录时改为 `visibility: hidden` 保留占位（原先 `display: none`） | 菜单从底部排，有的难度有记录、有的没有时，切换会让按钮上下移动 |
| 中文标题字体 | 系统黑体 900 → 马善政毛笔楷书（§4.3），标题页和分享卡都用 | 系统黑体太普通；对比过马善政、志莽行、龙藏、站酷小薇、站酷庆科黄油、思源宋体 Black，毛笔字最贴暗黑地牢气质且仍好认 |


### 21.6 长线可玩性第二批：祝福

| 项 | 修改 | 说明 |
|---|---|---|
| 升级三选一祝福 | §3.10：新模块 `game/blessings.ts`；`Game` 加 `blessings / offer / offersDue / picks / undyingUsed / bountyXp / known` 和 `chooseBlessing(id)`；新事件 `blessOffer`、`bless`、`heal`，`fight` 带 `undying`，`potionRefused` 带 `void`；结算加「赏金」行 | 每局构筑不同，提高重玩价值 |
| 难度档 | `difficulty.*.blessLevels` | 学徒 5 / 9、冒险者 6 / 10、英雄 11 |
| 存档 | `RunSave` 加 `blessings / offersDue / undyingUsed / bountyXp / known`（可缺省），读档时按种子重抽同一组候选并重新弹出 | 旧存档按无祝福读 |
| 机器人与模拟 | `playBot` 会选祝福（`blessPref`，不给则随机）；伤害、经验、血瓶、宝箱都按祝福修正；洞察的已知等级进入回溯约束。`pnpm sim 150 1 normal --nobless` 对照 | 专家胜率下限 98 → 95，原因见 §3.10 |
| 调试 | `__game.bless(id?)`，`state()` 带 `blessings` / `offer` | |
| 成就面板铆钉 | `#panel-ach::after` 跟 `::before` 一起改阴影偏移 | 原先右上角多一颗铆钉；祝福面板同样处理 |

### 21.7 文档重写与难度文字修正

| 项 | 修改 | 说明 |
|---|---|---|
| 设计文档 | 按当前实现重写：规则、数值、算法、存储、界面都改成最终状态，阶段记录归入本节；源码不再整段复制，改为指向文件 | 旧文档前面是设计期内容，后面几轮修改只记在表里，要读完全文才拼得出现状，部分正文（事件类型、光照参数、布局公式、引导步骤、情境提示）已与代码不符 |
| 惊扰巨龙提示 | 「巨龙需要生命 ≥ 14」改为当前难度的挑战血量 | 学徒 12 / 英雄 16 时提示写错 |
| 图鉴龙格 | 等级「13」与「需14」改为当前难度的巨龙等级和挑战血量（`Hud.dragonLevel` / `dragonHp`，换难度时重烘标签） | 同上 |
