# Aircade

四款「经典玩法融合」网页游戏。竖屏移动端优先，同时适配桌面。所有美术与音效都由代码程序化生成，运行时不请求任何外部资源。

| 游戏 | 融合玩法 | 目录 | 设计文档 | 开发端口 |
|---|---|---|---|---|
| 地牢扫雷 · Dungeon Sweeper | 扫雷 × 地牢冒险 | [`games/dungeon-sweeper`](games/dungeon-sweeper) | [`docs/dungeon-sweeper.md`](docs/dungeon-sweeper.md) | 5101 |
| 霓虹破阵 · Brick Survivor | 打砖块 × 割草肉鸽 | [`games/brick-survivor`](games/brick-survivor) | [`docs/brick-survivor.md`](docs/brick-survivor.md) | 5102 |
| 弹个大西瓜 · Sling Merge | 合成大西瓜 × 弹弓 | [`games/sling-merge`](games/sling-merge) | [`docs/sling-merge.md`](docs/sling-merge.md) | 5103 |
| 行囊对决 · Pack Battle | 俄罗斯方块 × 背包整理 × 自动战斗 | [`games/pack-battle`](games/pack-battle) | [`docs/pack-battle.md`](docs/pack-battle.md) | 5104 |

每款游戏都是独立项目：各自的 `package.json` / `package-lock.json`、各自安装依赖、各自构建，互不依赖，仓库根目录没有 workspace。

## 技术栈

四款游戏的共同底座：

- **TypeScript（strict）+ Vite 8**，npm 管理依赖，不引入游戏引擎。
- **音频**：WebAudio 实时合成（振荡器、噪声、滤波、包络、程序化混响），背景音乐是程序化生成的；首次点击后解锁，音效/音乐开关记在本地。
- **字体**：标题和数字用 OFL 开源拉丁字体，通过 `@fontsource/*` 打包进本地（只含 latin 子集）；中文用系统字体栈。
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

## 本地运行

环境要求：**Node.js ≥ 22.12**（Vite 8 的要求；pack-battle 的 `npm run balance` 直接运行 `.ts` 脚本，需要 Node ≥ 22.18），npm 10+。

进入某个游戏目录：

```bash
cd games/sling-merge     # 或 dungeon-sweeper / brick-survivor / pack-battle
npm install
npm run dev              # 开发服务器，固定端口，见上表；同时监听局域网，可用手机直接访问
```

打开 `http://localhost:5103/`（端口按上表替换）。用手机测试时，访问终端里打印的局域网地址即可。

常用 URL 参数：

- `?debug=1`：FPS / 帧时间浮层 + `window.__game` 调试接口
- `?seed=12345`：固定随机种子

## 构建

```bash
cd games/<游戏名>
npm run build      # 先做 TypeScript 类型检查，再做生产构建，输出到 dist/
npm run preview    # 在同一端口预览 dist/
```

四款游戏一次全部构建：

```bash
for g in games/*/; do (cd "$g" && npm ci && npm run build) || break; done
```

构建产物是纯静态文件（HTML + JS + CSS + woff2），`base: './'` 使用相对路径，可放在任意域名的任意子路径下。

## 部署

把每个游戏的 `dist/` 目录上传到任意静态托管即可，不需要服务端，也不需要额外配置路由（单页、无前端路由）。

- **任意静态服务器 / 对象存储（Nginx、S3、OSS、COS 等）**：把 `games/<游戏名>/dist/` 的内容上传到某个目录，例如 `https://example.com/aircade/sling-merge/`。建议给 `assets/` 下的带哈希文件设置长缓存，`index.html` 不缓存。
- **GitHub Pages**：把四个 `dist/` 分别拷贝到同一个发布目录的子文件夹（如 `site/dungeon-sweeper/` …），再发布这个目录。
- **Netlify / Vercel / Cloudflare Pages**：每款游戏建一个项目，根目录（Base directory）设为 `games/<游戏名>`，构建命令 `npm run build`，发布目录 `dist`。

合并发布四款游戏的示例：

```bash
rm -rf site && mkdir site
for g in dungeon-sweeper brick-survivor sling-merge pack-battle; do
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
├── docs/                 # 四款游戏的设计文档（规则、数值、美术、动效清单、界面流程、模块划分）
└── games/
    ├── dungeon-sweeper/  # 每个游戏：index.html、src/、vite.config.ts、tsconfig.json、package.json
    ├── brick-survivor/
    ├── sling-merge/
    └── pack-battle/      # 另有 scripts/balance.ts：数值平衡模拟（npm run balance）
```
