// 快手版立牌图：由 scripts/pack-yoola.ts 复制到 package/res/Image/，文件名按平台规范改成 monster-<id>.webp
export const ART_URLS: Record<string, string> = {};
for (const id of ['slime', 'goblin', 'spider', 'skeleton', 'ogre', 'rats', 'witch', 'knight', 'ranger', 'dragon']) {
  ART_URLS[id] = 'res/Image/monster-' + id + '.webp';
}
export const TITLE_BAG_URL = 'res/Image/title-bag.webp';
