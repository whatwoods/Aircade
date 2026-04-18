# Aircade

> 群友造的街机厅——AI 做游戏社群的作品展示站。

完整产品需求见 [`docs/PRD.md`](./docs/PRD.md)。设计基线见 [`docs/design/README.md`](./docs/design/README.md)。

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
pnpm db:seed         # 生成本地开发管理员
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
| `pnpm db:seed` | 写入本地开发管理员 |
| `pnpm db:studio` | 启动 Drizzle Studio（浏览器查表） |

## 认证验收

执行 `pnpm db:seed` 后，本地会确保存在一组开发用凭据：

- 管理员用户名：`admin`
- 管理员密码：`admin123456`

然后可以直接访问：

- `/register`：直接注册
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

## 生产部署

当前仓库已经验证可生产构建，默认部署方式推荐：

- 应用：`pnpm build && pnpm start`
- 进程托管：PM2
- 反向代理：Nginx
- 数据库：本机 PostgreSQL
- 缓存 / session：本机 Redis

### 生产环境变量

生产机至少需要配置以下变量：

```bash
NODE_ENV=production
DATABASE_URL=postgres://aircade:<strong-password>@127.0.0.1:5432/aircade
REDIS_URL=redis://127.0.0.1:6379
AUTH_SECRET=<32+ chars random secret>
AUTH_SESSION_COOKIE=aircade_sid
AUTH_SESSION_TTL_DAYS=30
NEXT_PUBLIC_SITE_NAME=Aircade
NEXT_PUBLIC_SITE_URL=https://your-domain.example.com
UPLOAD_DIR=/var/aircade/uploads
UPLOAD_PUBLIC_BASE=/uploads
```

上传图片现在会直接写入 `UPLOAD_DIR`，数据库只保存相对访问路径。服务端会在入库前统一转成 `webp`：

- 封面目标压到约 `500KB` 内
- 截图目标压到约 `800KB` 内
- 二维码走无损 `webp`，优先保证扫码可读性

单机云服务器建议保持：

- `UPLOAD_DIR` 指向代码目录外的持久化磁盘路径，例如 `/var/aircade/uploads`
- `UPLOAD_PUBLIC_BASE` 维持 `/uploads`
- Nginx 直接托管 `/uploads/`，或者在 Nginx 未配置前由应用内置路由兜底返回图片

### Ubuntu 24.04 / PM2 + Nginx 部署步骤

```bash
# 1) 安装依赖
sudo apt update
sudo apt install -y nginx postgresql redis-server

# 2) 安装 Node.js 20 + pnpm + pm2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm pm2

# 3) 初始化数据库
sudo -u postgres psql -c "CREATE USER aircade WITH PASSWORD '<strong-password>';"
sudo -u postgres psql -c "CREATE DATABASE aircade OWNER aircade;"

# 4) 部署代码
git clone <repo-url>
cd Aircade
cp .env.example .env.production
sudo mkdir -p /var/aircade/uploads
sudo chown -R <app-user>:<app-user> /var/aircade/uploads

# 5) 修改 .env.production 后执行
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed   # 可选：初始化管理员
pnpm build

# 6) 用 PM2 启动
pm2 start "pnpm start" --name aircade
pm2 save
pm2 startup
```

Nginx 需要把 80/443 请求反代到本地 `3000` 端口，并把 `/uploads/` 直接映射到 `UPLOAD_DIR`。仓库内提供了可直接改域名后使用的示例配置：[docs/deploy/nginx-aircade.conf.example](./docs/deploy/nginx-aircade.conf.example)。

其中 `/uploads/` 的上线配置要点是：

```nginx
location ^~ /uploads/ {
    alias /var/aircade/uploads/;
    try_files $uri =404;
    access_log off;
    expires 365d;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Content-Type-Options nosniff always;
}
```

注意两点：

- `alias` 必须带尾部 `/`，并且要和 `UPLOAD_DIR` 指向的真实目录一致。
- `try_files $uri =404;` 可以阻止路径穿越或误落到别的 location。

完成反代后，再用 `certbot` 或其他 ACME 客户端签发 HTTPS 证书。

### 健康检查

生产环境提供健康检查路由：

```bash
curl https://your-domain.example.com/api/health
```

返回 `200` 代表应用、PostgreSQL、Redis 均可用；返回 `503` 代表服务已启动，但至少一个依赖不可用。

### 一键更新脚本

仓库内置生产更新脚本：

```bash
cd /var/www/Aircade
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh
```

可选参数：

```bash
APP_NAME=aircade BRANCH=main ./scripts/deploy-production.sh
RUN_SEED=1 ./scripts/deploy-production.sh
HEALTHCHECK_URL=http://127.0.0.1:3000/api/health ./scripts/deploy-production.sh
```

默认流程包括：

1. 拉取最新 `origin/<branch>`
2. `pnpm install --frozen-lockfile`
3. `pnpm db:migrate`
4. `pnpm build`
5. `pm2 restart/start`
6. 轮询 `/api/health` 做部署后自检
