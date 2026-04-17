---
title: Aircade 脚手架与基础架构设计
date: 2026-04-17
status: draft
scope: scaffold only（不含业务功能实现）
related_prd: /PRD.md
---

# Aircade 脚手架与基础架构设计

## 1. 目标与非目标

### 目标

为 Aircade（PRD v1.0）建立一个可直接开工的项目骨架：运行 `pnpm dev` 能看到空白但已应用品牌底色的首页；`drizzle-kit migrate` 能把 PRD §6 的全部表建到本地 Postgres；`pnpm lint`、`pnpm typecheck`、`pnpm test` 都能通过。后续每个功能子项目（认证、作品、审核…）都在此骨架上增量添加，不再需要动配置层。

### 非目标

- **不实现任何业务功能**：无注册登录、无作品 CRUD、无管理后台、无图片上传。
- **不打桩页面/API**：除必要的 `app/layout.tsx` 和 `app/page.tsx`，不预创建 PRD §4 的任何路由。
- **不做部署**：不配 Nginx、pm2、备份脚本，这些留到"上线"子项目。
- **不初始化 git 仓库**：由用户自己决定何时 `git init`（目前工作目录非 git 仓库）。

## 2. 技术决策（已定）

| 项 | 决策 | 来源 |
|---|---|---|
| 框架 | Next.js 14+ App Router + TypeScript | PRD §7.1 |
| 样式 | TailwindCSS + shadcn/ui（暖色调圆角改造） | PRD §7.1 §8 |
| 数据库 | PostgreSQL 16（本机原生安装） | PRD §7.1，用户选择 |
| 缓存 | Redis 7（本机原生安装） | PRD §7.1，用户选择 |
| ORM | Drizzle（drizzle-orm + drizzle-kit） | 用户选择 |
| 认证 | 手写（bcryptjs + jose + 自管 session 表） | 用户选择 |
| 包管理器 | pnpm | PRD §7.5 |
| 校验 | zod（env + 后续表单/API） | 惯例 |
| 测试 | Vitest | 惯例；配好不写业务用例 |
| 格式化 | ESLint + Prettier + Husky + lint-staged | 惯例 |

## 3. 目录结构

```
Aircade/
├── .env.example                # 所有必需/可选变量
├── .env.local                  # 本机实际值（gitignore）
├── .gitignore
├── .prettierrc
├── .eslintrc.cjs
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── drizzle.config.ts
├── vitest.config.ts
├── components.json             # shadcn/ui 配置
├── README.md                   # 本地开发步骤
├── PRD.md                      # 已存在
├── docs/
│   └── superpowers/specs/
│       └── 2026-04-17-scaffold-design.md
├── drizzle/                    # drizzle-kit 生成的 migration
│   ├── 0000_init.sql
│   └── meta/
├── public/
│   └── fonts/                  # 霞鹜文楷 woff2 留位（TODO 放字体文件）
└── src/
    ├── app/
    │   ├── layout.tsx          # 根 layout，应用字体 + 品牌底色
    │   ├── page.tsx            # 占位首页，显示 "Aircade"
    │   ├── globals.css         # Tailwind 指令 + 基础变量
    │   └── fonts.ts            # next/font 配置
    ├── components/
    │   └── ui/                 # shadcn/ui 生成到此（本期暂不生成组件）
    ├── db/
    │   ├── client.ts           # drizzle 实例单例
    │   ├── schema/
    │   │   ├── index.ts        # 统一导出
    │   │   ├── users.ts
    │   │   ├── invite-codes.ts
    │   │   ├── works.ts
    │   │   ├── tags.ts
    │   │   ├── work-tags.ts
    │   │   ├── likes.ts
    │   │   ├── favorites.ts
    │   │   └── sessions.ts
    │   └── seed.ts             # 占位：仅写一个 admin 用户 + 5 个预设标签 TODO，不在本期跑
    ├── lib/
    │   ├── env.ts              # zod 校验 process.env，全局单入口
    │   ├── redis.ts            # ioredis 单例，懒连接
    │   ├── utils.ts            # shadcn 默认 cn()
    │   └── env.test.ts         # 示例测试：env 校验在缺变量时抛错
    ├── features/               # 各功能模块未来落位，本期为空
    │   ├── auth/               # .gitkeep
    │   ├── works/              # .gitkeep
    │   └── admin/              # .gitkeep
    └── shared/                 # 跨 feature 的纯逻辑（本期为空）
        └── .gitkeep
```

**分层约定**（供未来子项目遵守）：

- `src/db/` 只做 schema 和连接；查询逻辑放各自的 `features/*/server/*.ts`
- `src/lib/` 只放**无业务含义**的通用工具（env、redis 客户端、cn）
- `src/features/<name>/` 是 feature 内聚目录，内部可以再分 `server/` `client/` `schemas/`
- `src/shared/` 放跨 feature 共享的业务逻辑（如通用的分页、限流封装）
- `src/components/ui/` 只放 shadcn 原子组件；业务组件放 feature 目录

## 4. 依赖清单（package.json）

### dependencies

```
next                ^14.2
react               ^18.3
react-dom           ^18.3
typescript          ^5.4
drizzle-orm         ^0.30
postgres            ^3.4    # drizzle 的 postgres 驱动
ioredis             ^5.4
bcryptjs            ^2.4
jose                ^5.6    # JWT 签名/校验
zod                 ^3.23
clsx                ^2.1    # shadcn 需要
tailwind-merge      ^2.3    # shadcn 需要
class-variance-authority ^0.7  # shadcn 需要
lucide-react        ^0.400
```

### devDependencies

```
@types/node @types/react @types/react-dom @types/bcryptjs
tailwindcss postcss autoprefixer
drizzle-kit         ^0.21
eslint eslint-config-next prettier prettier-plugin-tailwindcss
husky lint-staged
vitest @vitest/ui
tsx                 # 跑 seed/脚本
```

**注意**：本期不安装 `@auth/core` / `next-auth` / `lucia`（认证手写）。

## 5. Drizzle Schema（按 PRD §6）

完整把 8 张表写进 `src/db/schema/*.ts`。关键点：

### 5.1 users

```ts
// users.ts
id          text primary key ($defaultFn: nanoid)
username    varchar(20) unique not null
passwordHash text not null
email       varchar(254) unique nullable
nickname    varchar(30) not null
avatarUrl   text nullable
bio         varchar(100) nullable
slug        varchar(40) unique not null
role        text enum(user|admin) not null default 'user'
status      text enum(active|banned) not null default 'active'
inviteCodeUsed text nullable references inviteCodes.id
createdAt   timestamptz default now()
lastLoginAt timestamptz nullable
failedLoginCount int default 0
lockedUntil timestamptz nullable  // 5次失败锁 30 分钟用
```

索引：`idx_users_username` unique、`idx_users_slug` unique、`idx_users_email` unique where not null。

### 5.2 invite_codes

```ts
id          text primary key
code        varchar(32) unique not null
type        text enum(single|multi) not null
maxUses     int not null default 1
usedCount   int not null default 0
createdBy   text not null references users.id
expiresAt   timestamptz nullable
status      text enum(active|revoked|used) not null default 'active'
createdAt   timestamptz default now()
```

索引：`idx_invite_codes_code` unique。

### 5.3 works

```ts
id          text primary key
authorId    text not null references users.id
title       varchar(30) not null
type        text enum(game|tool|social|ai|other) not null
tagline     varchar(30) not null
description varchar(300) not null
coverUrl    text not null
screenshots json not null  // string[]
qrUrl       text nullable
webUrl      text nullable
status      text enum(pending|live|rejected|unlisted) not null default 'pending'
rejectReason text nullable
likeCount   int not null default 0
viewCount   int not null default 0
featuredAt  timestamptz nullable
createdAt   timestamptz default now()
reviewedAt  timestamptz nullable
```

索引：`idx_works_status_createdAt`、`idx_works_author`、`idx_works_featuredAt`。
约束（CHECK）：`qrUrl IS NOT NULL OR webUrl IS NOT NULL`（PRD §5.1 二选一）。

### 5.4 tags / work_tags

```ts
// tags
id text pk, name varchar(20) unique, slug varchar(40) unique,
preset boolean default false, createdAt timestamptz

// work_tags
workId text references works.id on delete cascade
tagId  text references tags.id on delete cascade
primary key (workId, tagId)
```

### 5.5 likes / favorites

```ts
// 结构相同，主键 = (userId, workId)，均带 createdAt
```

### 5.6 sessions

**与 PRD 的对齐说明**：PRD §5.3 写"httpOnly cookie + JWT"，§6 又列了 Session 表——两种方案。本脚手架采用**"DB session + httpOnly cookie 存不透明 token"**路线，理由：

- 可服务端吊销（改密码、封号立即失效），比纯 JWT 更安全
- PRD §6 本身已经给出 Session 表字段（`token_hash`、`ip`、`user_agent`），显然倾向这个方案
- 未来要加 CSRF、异地登录提醒都有着落
- `jose` 依赖仍然保留：签发/校验不透明 token 本身不需要 JWT，但邮箱验证码（V1.1）、一次性操作令牌等场景会用到 JWT 短签

本期只建表，不写认证逻辑。

```ts
id          text primary key           // sid，cookie 里不直接放它
userId      text not null references users.id on delete cascade
tokenHash   text not null              // sha256(cookie 中的不透明 token)，即使库泄漏也反推不出 cookie
expiresAt   timestamptz not null
ip          inet nullable
userAgent   text nullable
createdAt   timestamptz default now()
```

索引：`idx_sessions_userId`、`idx_sessions_expiresAt`（用于清理过期）。

### 5.7 Migration

```bash
pnpm drizzle-kit generate   # 生成 drizzle/0000_init.sql
pnpm drizzle-kit migrate    # 应用到本地库
```

脚本写进 `package.json`：`"db:gen"`、`"db:migrate"`、`"db:studio"`。

## 6. 环境变量

`.env.example` 内容：

```
# --- Database ---
DATABASE_URL=postgres://aircade:aircade@127.0.0.1:5432/aircade

# --- Redis ---
REDIS_URL=redis://127.0.0.1:6379

# --- Auth ---
AUTH_JWT_SECRET=change-me-at-least-32-bytes-long-xxxxxxxxx   # 32+ 字节
AUTH_SESSION_COOKIE=aircade_sid                               # cookie 名
AUTH_SESSION_TTL_DAYS=30

# --- App ---
NEXT_PUBLIC_SITE_NAME=Aircade
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# --- Uploads（本期不用，但先占位，和 PRD §7.3 对齐）---
UPLOAD_DIR=/var/aircade/uploads
UPLOAD_PUBLIC_BASE=/uploads
```

`src/lib/env.ts` 用 zod 做 schema 校验：

- 缺失任何必需变量时，**模块加载即抛错**，在 dev 启动和 build 时都能看到。
- `AUTH_JWT_SECRET` 校验长度 ≥ 32。
- 导出冻结的 `env` 对象，**全站不再允许直接用 `process.env`**（ESLint 规则 `no-process-env` 开启，`src/lib/env.ts` 自身豁免）。

## 7. 设计 Token（tailwind.config.ts）

按 PRD §8：

```ts
theme: {
  extend: {
    colors: {
      brand: {
        orange: '#FF9F6B',
        cream:  '#FFE9B8',
        mint:   '#9FE3C9',
        pink:   '#FFB7C5',
        milk:   '#FFFBF5',
        coffee: '#3D2E1F',
      }
    },
    borderRadius: {
      btn:   '12px',
      card:  '20px',
      input: '10px',
    },
    fontFamily: {
      sans: ['var(--font-inter)', 'var(--font-harmony)', 'system-ui', 'sans-serif'],
      display: ['var(--font-lxgw)', 'var(--font-harmony)', 'sans-serif'],  // 霞鹜文楷
    }
  }
}
```

shadcn 的 CSS 变量（`--background` 等）在 `globals.css` 里覆盖为 brand 色系，使得 shadcn 生成的组件自动走暖色调。

**字体**：

- Inter：`next/font/google` 直出
- HarmonyOS Sans：`next/font/local` 指向 `public/fonts/HarmonyOS_Sans_SC_Regular.woff2` —— 字体文件需用户后续补齐，README 写明
- 霞鹜文楷：同上，`public/fonts/LXGWWenKai-Regular.woff2` —— 本期**留占位 + TODO**，不 block 启动

## 8. 根布局与占位首页

`src/app/layout.tsx`：

- `<html lang="zh-CN">`
- 应用 `font-sans` + `bg-brand-milk text-brand-coffee` 到 body
- metadata：title `Aircade`，description `群友造的街机厅`，og/twitter 基础三件套

`src/app/page.tsx`：

- 居中显示 `Aircade` + slogan `群友造的街机厅`
- 一个 `bg-brand-orange rounded-btn` 按钮（仅视觉检查 Token 是否生效，无交互）

## 9. 测试与工具链

### 9.1 Vitest

- `vitest.config.ts` 用 `node` 环境
- 仅一个示例 `src/lib/env.test.ts`：临时 `delete process.env.DATABASE_URL` 后动态 import env，断言抛错；恢复后断言成功
- 不配 React Testing Library（留到有组件时）

### 9.2 Lint & Format

- ESLint 继承 `next/core-web-vitals`，额外：
  - `no-process-env: error`（env.ts 豁免）
  - `no-restricted-imports` 禁止从 `src/features/*` 交叉 import（强制边界）
- Prettier + `prettier-plugin-tailwindcss`
- Husky `pre-commit` 跑 `lint-staged`：对改动文件跑 `eslint --fix` + `prettier --write`
- `pre-commit` 额外跑 `pnpm typecheck`（tsc --noEmit）

### 9.3 package.json scripts

```
dev           next dev
build         next build
start         next start
lint          next lint
typecheck     tsc --noEmit
test          vitest run
test:watch    vitest
db:gen        drizzle-kit generate
db:migrate    drizzle-kit migrate
db:studio     drizzle-kit studio
prepare       husky
```

## 10. README（本地开发步骤）

覆盖：

1. 前置：Node 20 LTS、pnpm、PostgreSQL 16、Redis 7（本机原生装）
2. 建库：`createdb aircade`、`createuser aircade` 的示例命令
3. `cp .env.example .env.local`，按注释填
4. `pnpm install`
5. `pnpm db:migrate`
6. `pnpm dev` → 打开 http://localhost:3000
7. 字体缺失的 TODO（HarmonyOS / 霞鹜文楷 woff2）
8. 目录结构一句话说明（指向本 spec）

## 11. 验收标准

本子项目"完成"的判定：

- [ ] `pnpm install` 成功，无 peer 警告错
- [ ] `.env.local` 按 example 填好后，`pnpm db:migrate` 成功建出 8 张表
- [ ] `pnpm dev` 启动后首页显示品牌色 + Aircade 文案
- [ ] `pnpm lint` 无错
- [ ] `pnpm typecheck` 无错
- [ ] `pnpm test` 跑通 `env.test.ts`
- [ ] `pnpm build` 成功
- [ ] `drizzle-kit studio` 能连上数据库看见表结构
- [ ] PRD §6 所有字段、主键、外键、关键索引均在 schema 中体现

## 12. 风险与留坑

| 项 | 处理 |
|---|---|
| 霞鹜文楷 / HarmonyOS Sans woff2 未随仓库提供 | README TODO；字体缺失时 fallback system-ui，不 block |
| `postgres` 驱动与 Next.js edge runtime 不兼容 | db/client.ts 上加 `export const runtime = 'nodejs'` 注释约定；未来 API 路由默认 node runtime |
| bcryptjs vs bcrypt（native） | 选 bcryptjs，避开 Windows 编译；cost=12 符合 PRD |
| Windows 路径与 husky | husky 新版已兼容；用 `pnpm prepare` 初始化 |
| 本期不 init git | README 在末尾提醒 `git init && git add -A && git commit -m "scaffold"` |

## 13. 下一步（不在本 spec 范围）

依赖此脚手架的后续子项目（每个都会独立走 brainstorm → spec → plan → implement）：

1. **认证**：注册（含邀请码核销）、登录、登出、session 中间件、`getCurrentUser()`
2. **作品浏览**：首页/详情/分类/标签，SSR + SEO
3. **作品提交**：表单 + 图片上传 + webp 压缩
4. **管理后台**：审核队列、标签管理、邀请码管理、用户管理
5. **点赞 / 收藏 + 反刷限流**
6. **作者主页**
7. **部署**（Nginx / pm2 / 备份脚本）
