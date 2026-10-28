# Aircade

七款「经典玩法融合」网页游戏。竖屏移动端优先，同时适配桌面。所有美术与音效都由代码程序化生成，运行时不请求任何外部资源。

| 游戏 | 融合玩法 | 目录 | 设计文档 | 开发端口 |
|---|---|---|---|---|
| 地牢扫雷 · Dungeon Sweeper | 扫雷 × 地牢冒险 | [`games/dungeon-sweeper`](games/dungeon-sweeper) | [`docs/dungeon-sweeper.md`](docs/dungeon-sweeper.md) | 5101 |
| 霓虹破阵 · Brick Survivor | 打砖块 × 割草肉鸽 | [`games/brick-survivor`](games/brick-survivor) | [`docs/brick-survivor.md`](docs/brick-survivor.md) | 5102 |
| 弹个大西瓜 · Sling Merge | 合成大西瓜 × 弹弓 | [`games/sling-merge`](games/sling-merge) | [`docs/sling-merge.md`](docs/sling-merge.md) | 5103 |
| 行囊对决 · Pack Battle | 俄罗斯方块 × 背包整理 × 自动战斗 | [`games/pack-battle`](games/pack-battle) | [`docs/pack-battle.md`](docs/pack-battle.md) | 5104 |
| 翡翠连珠 · Chain 2048 | 祖玛 × 2048 | [`games/chain-2048`](games/chain-2048) | [`docs/chain-2048.md`](docs/chain-2048.md) | 5105 |
| 五子落 · Five Drop | 俄罗斯方块 × 五子棋 | [`games/five-drop`](games/five-drop) | [`docs/five-drop.md`](docs/five-drop.md) | 5106 |
| 造字记 · Hanzi Merge | 汉字偏旁部首 × 合成 | [`games/hanzi-merge`](games/hanzi-merge) | [`docs/hanzi-merge.md`](docs/hanzi-merge.md) | 5107 |

每款游戏都是独立项目：各自的 `package.json` / `package-lock.json`、各自安装依赖、各自构建，互不依赖，仓库根目录没有 workspace。

## 技术栈

所有游戏的共同底座：

- **TypeScript（strict）+ Vite 8**，npm 管理依赖，不引入游戏引擎。
- **音频**：WebAudio 实时合成（振荡器、噪声、滤波、包络、程序化混响），背景音乐是程序化生成的；首次点击后解锁，音效/音乐开关记在本地。
- **字体**：标题和数字用 OFL 开源拉丁字体，通过 `@fontsource/*` 打包进本地（只含 latin 子集）；中文用系统字体栈。例外是 hanzi-merge：汉字本身就是美术，构建时把 OFL 字体霞鹜文楷（LXGW WenKai）和马善政按游戏实际用到的字做子集化后打包，缺字则构建失败。
- **本地存储**：最高分、设置、引导是否完成，key 前缀 `aircade.<游戏名>.`。
- **调试**：`?debug=1` 显示 FPS/帧时间浮层，并暴露 `window.__game` 调试接口（跳关、触发 Boss、加经验/金币等，见各设计文档）；`?seed=<数字>` 固定随机种子以复现对局。
- 所有玩法数值集中在各游戏的 `src/config.ts`。

各游戏的差异：

| 游戏 | 渲染 | 物理 / 核心系统 | 美术方向 | 字体 |
|---|---|---|---|---|
| dungeon-sweeper | Canvas 2D 单画布 + 低分辨率光照图（烛光/黑暗）；菜单与弹窗用 DOM + CSS | 带种子的地图生成器（入口安全、巨龙巢穴固定在中心）；伪 3D 翻牌 | 炭黑冷灰石砖 + 琥珀烛光 | Cinzel / Cinzel Decorative |
| brick-survivor | 自研 WebGL 精灵批渲染器（WebGL2，回退 WebGL1）：预烘焙辉光 + 加色混合 + 1/4 分辨率 bloom，按帧时自动降画质 | 自研 120 Hz 固定步长碰撞，砖块网格 O(1) 查询 | 深空黑紫 + 高饱和霓虹 | Orbitron / Rajdhani |
| sling-merge | Canvas 2D，水果、阴影、粒子预渲染成精灵 | 自研圆形刚体求解器（子步 + 热启动 + 休眠），弹道预测和实际轨迹逐步一致 | 奶油马卡龙糖果色、果冻 Q 弹 | Fredoka |
| pack-battle | Canvas 2D 全屏单画布 + 离屏分层缓存，UI 控件也画在画布里 | 6 列 × 5 行背包的格子摆放 / 相邻加成 / 合成升星；固定 1/60 s 步长的自动战斗模拟 | 皮革、木桌、羊皮纸、墨线手绘 | Patrick Hand / Kalam |
| chain-2048 | Canvas 2D 游戏层 + DOM 菜单 | 弧长查找表驱动的轨道链条；同数相邻合成翻倍、连锁、凑到关卡金印数即封印移除；模拟器以「真人节奏」机器人为主关卡门槛 | 丛林遗迹：翡翠石刻 + 鎏金铜 | Bungee / Big Shoulders Display |
| five-drop | Canvas 2D | 9 × 15 交叉点棋盘；黑白子方块下落，横 / 竖 / 斜同色五连消除，只在受影响列逐子重力并可连锁；满行时多数色退场；规则单测 + 「色盲 / 形盲」对照机器人模拟 | 现代极简：雾蓝石板 + 黑曜石 / 白瓷棋子 | Inter |
| hanzi-merge | Canvas 2D + DOM 字卡 / 图鉴 | 200 字配方数据（依据《说文》与 IDS 结构，偏旁变体逐字标注）由校验脚本把关；墨量为主要约束，模拟器校准 30 帖难度 | 宣纸、水墨、朱砂印 | 霞鹜文楷子集 / 马善政 |

## 本地运行

环境要求：**Node.js ≥ 22.12**（Vite 8 的要求），npm 10+。直接运行 `.ts` 的脚本需要 **Node ≥ 22.18**：pack-battle 的 `npm run balance`、chain-2048 / five-drop / hanzi-merge 的 `npm run sim`、five-drop 的 `npm run rules`、hanzi-merge 的 `npm run verify`，以及 hanzi-merge 的 `npm run build`（构建前后会运行字体子集检查脚本）。

进入某个游戏目录：

```bash
cd games/sling-merge     # 或其他任一游戏目录
npm install
npm run dev              # 开发服务器，固定端口，见上表；同时监听局域网，可用手机直接访问
```

打开 `http://localhost:5103/`（端口按上表替换）。用手机测试时，访问终端里打印的局域网地址即可。

常用 URL 参数：

- `?debug=1`：FPS / 帧时间浮层 + `window.__game` 调试接口
- `?seed=12345`：固定随机种子

数值验证脚本（在对应游戏目录运行）：

| 命令 | 游戏 | 作用 |
|---|---|---|
| `npm run balance` | pack-battle | 自动战斗数值平衡模拟 |
| `npm run sim` | chain-2048 / five-drop / hanzi-merge | 用不同水平的机器人跑难度曲线并检查验收阈值 |
| `npm run rules` | five-drop | 消除 / 重力 / 连锁规则单元测试 |
| `npm run verify` | hanzi-merge | 校验全部汉字配方（结构、偏旁变体、繁体、标签一致性） |

## 构建

```bash
cd games/<游戏名>
npm run build      # 先做 TypeScript 类型检查，再做生产构建，输出到 dist/
npm run preview    # 在同一端口预览 dist/
```

全部游戏一次构建：

```bash
for g in games/*/; do (cd "$g" && npm ci && npm run build) || break; done
```

构建产物是纯静态文件（HTML + JS + CSS + woff2），`base: './'` 使用相对路径，可放在任意域名的任意子路径下。

## 部署

把每个游戏的 `dist/` 目录上传到任意静态托管即可，不需要服务端，也不需要额外配置路由（单页、无前端路由）。

- **任意静态服务器 / 对象存储（Nginx、S3、OSS、COS 等）**：把 `games/<游戏名>/dist/` 的内容上传到某个目录，例如 `https://example.com/aircade/sling-merge/`。建议给 `assets/` 下的带哈希文件设置长缓存，`index.html` 不缓存。
- **GitHub Pages**：把各个 `dist/` 分别拷贝到同一个发布目录的子文件夹（如 `site/dungeon-sweeper/` …），再发布这个目录。
- **Netlify / Vercel / Cloudflare Pages**：每款游戏建一个项目，根目录（Base directory）设为 `games/<游戏名>`，构建命令 `npm run build`，发布目录 `dist`。

合并发布全部游戏的示例：

```bash
rm -rf site && mkdir site
for g in dungeon-sweeper brick-survivor sling-merge pack-battle chain-2048 five-drop hanzi-merge; do
  (cd games/$g && npm ci && npm run build) && cp -r games/$g/dist site/$g
done
# 把 site/ 上传到静态托管
```

注意：

- 需要通过 `http(s)://` 访问。直接双击打开 `file://` 的 `index.html`，会因浏览器的模块与字体加载限制而无法运行。
- 音频需要用户的第一次点击才能开始播放（浏览器策略）。
- brick-survivor 需要 WebGL，不支持 WebGL 的环境会显示提示页。

## 目录结构

```
.
├── docs/                 # 各游戏的设计文档（规则、数值、美术、动效清单、界面流程、模块划分）
└── games/
    ├── dungeon-sweeper/  # 每个游戏：index.html、src/、vite.config.ts、tsconfig.json、package.json
    ├── brick-survivor/
    ├── sling-merge/
    ├── pack-battle/      # 另有 scripts/balance.ts：数值平衡模拟（npm run balance）
    ├── chain-2048/       # 另有 scripts/sim.ts：难度曲线模拟
    ├── five-drop/        # 另有 scripts/sim.ts、scripts/rules-test.ts
    └── hanzi-merge/      # 另有 tools/：字体子集化、配方校验、难度模拟
```
