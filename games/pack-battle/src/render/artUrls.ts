// 手绘图地址：立牌 id → url，以及标题页的行囊；快手构建里整个模块换成 platform/yoola/artUrls.ts
import bagUrl from '../assets/title/bag.webp?url';
const GLOB = import.meta.glob('../assets/monsters/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const ART_URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(GLOB)) ART_URLS[path.slice(path.lastIndexOf('/') + 1, -5)] = url;

export const TITLE_BAG_URL: string = bagUrl;
