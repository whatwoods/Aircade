# Aircade

七款「经典玩法融合」网页游戏，每款是 `games/<名>/` 下的独立项目（TypeScript strict + Vite 8，无游戏引擎）。总览、端口、构建与部署见 [README.md](README.md)；每款的规则、数值、美术和模块划分见 `docs/<名>.md`。

## 约定

- 包管理用 **pnpm**，在游戏目录里运行（`pnpm install`、`pnpm dev`、`pnpm build`）。仓库根没有 workspace，不要加；游戏之间不共享代码和依赖。
- 一个会话只改自己负责的那款：`games/<名>/` 和 `docs/<名>.md`。改到 README 或根目录文件时在汇报里说明。
- 运行时不请求任何外部资源：美术、音效、音乐都用代码程序化生成，字体通过 `@fontsource/*` 或子集化打包进本地。
- 玩法数值集中在 `src/config.ts`，不要散落在逻辑代码里。
- 本地存储 key 前缀 `aircade.<游戏名>.`。
- 调试：`?debug=1` 打开 FPS 浮层和 `window.__game` 调试接口，`?seed=<数字>` 固定随机种子。新增调试能力挂到 `__game` 上，并写进设计文档。
- 竖屏移动端优先（以 390×844 为基准），同时适配桌面。

## 预览

`.claude/launch.json` 为每款配了开发服务器，名字就是游戏目录名（端口 5101–5107），用 `preview_start` 按名字启动。

## 改完之后

- `pnpm build` 零错误、零警告（含类型检查）。
- 有验证脚本的一并跑通：pack-battle `pnpm balance`；chain-2048 / five-drop / hanzi-merge `pnpm sim`；five-drop `pnpm rules`；hanzi-merge `pnpm verify`。
- 在浏览器里实际玩一遍改到的流程，控制台零报错。
- 玩法、数值或结构有变化时同步更新 `docs/<名>.md`。
