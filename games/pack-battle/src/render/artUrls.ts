// 手绘立牌图的地址表（立牌 id → url）；快手构建里整个模块换成 platform/yoola/artUrls.ts
const GLOB = import.meta.glob('../assets/monsters/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const ART_URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(GLOB)) ART_URLS[path.slice(path.lastIndexOf('/') + 1, -5)] = url;
