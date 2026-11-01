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

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable pnpm 2>/dev/null || npm install -g pnpm@11.8.0
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
