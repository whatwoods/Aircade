#!/usr/bin/env bash
# 构建部署到 Cloudflare Workers 的站点：每款游戏的 dist/ 放到 site/<路径>/。
# 增减上线的游戏只改 GAMES。
set -euo pipefail

GAMES=(
  "dungeon-sweeper:sweeper"
  "pack-battle:battle"
)

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# Cloudflare 构建镜像里的 pnpm 是 asdf 垫片，Node 补丁版本和预装的对不上时 `command -v` 找得到却跑不起来，
# 所以先实际跑一次，不行就走 npx 固定版本
if pnpm --version >/dev/null 2>&1; then
  pnpm() { command pnpm "$@"; }
else
  pnpm() { npx --yes pnpm@11.8.0 "$@"; }
fi

rm -rf site
cp -r site-root site

for entry in "${GAMES[@]}"; do
  game="${entry%%:*}"
  path="${entry##*:}"
  echo "== $game → /$path/"
  pnpm --dir "games/$game" install --frozen-lockfile
  pnpm --dir "games/$game" build
  cp -r "games/$game/dist" "site/$path"
done
