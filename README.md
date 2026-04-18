# Aircade

> 群友造的街机厅——AI 做游戏社群的作品展示站。

完整产品需求见 [`PRD.md`](./PRD.md)。脚手架设计见 [`docs/superpowers/specs/2026-04-17-scaffold-design.md`](./docs/superpowers/specs/2026-04-17-scaffold-design.md)。

## 快速开始

### 前置要求

- Node.js ≥ 20.11
- pnpm ≥ 9（`npm i -g pnpm`）
- PostgreSQL 16（本机原生安装）
- Redis 7（本机原生安装）

### 准备数据库

```bash
psql -U postgres -c "CREATE USER aircade WITH PASSWORD 'aircade';"
psql -U postgres -c "CREATE DATABASE aircade OWNER aircade;"
```

### 准备环境变量

```bash
cp .env.example .env.local
```

然后编辑 `.env.local`：至少把 `AUTH_SECRET` 改成 ≥32 字节的随机串：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 安装与启动

```bash
pnpm install
pnpm db:migrate      # 建好 PRD §6 的 8 张表
pnpm db:seed         # 生成本地开发管理员 + 测试邀请码
pnpm dev             # http://localhost:3000
```

## 常用脚本

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动 Next.js 开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产服务（先 build） |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript 无生成检查 |
| `pnpm test` | 跑 Vitest 一次 |
| `pnpm test:watch` | Vitest watch 模式 |
| `pnpm db:gen` | 从 schema 生成 migration 文件 |
| `pnpm db:migrate` | 把 migration 应用到数据库 |
| `pnpm db:seed` | 写入本地开发管理员和测试邀请码 |
| `pnpm db:studio` | 启动 Drizzle Studio（浏览器查表） |

## 认证验收

执行 `pnpm db:seed` 后，本地会确保存在一组开发用凭据：

- 管理员用户名：`admin`
- 管理员密码：`admin123456`
- 测试邀请码：`AIRCADE-DEV-001`

然后可以直接访问：

- `/register`：邀请码注册
- `/login`：用户名密码登录
- `/account`：已登录账号页（未登录会跳回 `/login`）
- `/submit`：登录后提交作品，进入审核队列
- `/admin/works`：管理员审核作品，通过后会上首页
- `/works/:id`：作品详情页，未上线作品仅作者和管理员可见

## 目录结构

```
src/
├── app/              # Next.js App Router
├── components/ui/    # shadcn/ui 原子组件
├── db/
│   ├── client.ts     # Drizzle 单例
│   └── schema/       # 按表拆分的 schema
├── features/         # 按 feature 聚合的业务目录（auth/works/admin）
├── shared/           # 跨 feature 的业务工具
└── lib/              # 无业务通用工具（env、redis、cn）
```

## 已知 TODO

- [ ] `public/fonts/HarmonyOS_Sans_SC_Regular.woff2` —— 自行放置后在 `src/app/fonts.ts` 取消对应 `localFont` 调用的注释
- [ ] `public/fonts/LXGWWenKai-Regular.woff2` —— 同上
- [ ] 业务功能：继续沿 PRD §3.1 推进标签、精选、点赞收藏、作者主页与投稿编辑

## 备份、部署

脚手架阶段不涉及。参考 PRD §7.4 / §7.5 的方案，会在独立子项目实施。
