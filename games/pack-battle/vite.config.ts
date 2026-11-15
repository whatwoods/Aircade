import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const src = (p: string): string => resolve(import.meta.dirname, 'src', p);

// 快手 Yoola 构建：把依赖浏览器 / WebAudio 的模块整体换成 src/platform/yoola 下的同名实现，
// 并去掉 CSS 入口（快手运行时没有 CSS，字体走 ttf）。只在 --mode yoola 时启用，网页和 TapTap 构建不经过这里。
const YOOLA_SWAPS: Record<string, string> = {
  [src('audio/audio.ts')]: src('platform/yoola/audio.ts'),
  [src('audio/sfx.ts')]: src('platform/yoola/sfx.ts'),
  [src('audio/music.ts')]: src('platform/yoola/music.ts'),
  [src('render/artUrls.ts')]: src('platform/yoola/artUrls.ts'),
};

function yoolaPlatform(): Plugin {
  return {
    name: 'pack-battle-yoola',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const abs = resolve(dirname(importer), source);
      return YOOLA_SWAPS[abs] ?? null;
    },
    load(id) {
      if (id.endsWith('/src/styles.css')) return '';
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const yoola = mode === 'yoola';
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(pkg.version), __YOOLA__: JSON.stringify(yoola) },
    plugins: yoola ? [yoolaPlatform()] : [],
    server: { port: 5104, strictPort: true, host: true },
    preview: { port: 5104, strictPort: true, host: true },
    build: yoola
      ? {
          // 单文件 IIFE，之后由 scripts/pack-yoola.ts 用 TypeScript 降到 ES5
          outDir: 'dist-yoola',
          target: 'esnext',
          minify: true,
          cssCodeSplit: false,
          assetsInlineLimit: 0,
          lib: { entry: 'src/main.ts', formats: ['iife'], name: 'PackBattle', fileName: () => 'pack-battle.js' },
        }
      : {
          outDir: 'dist',
          target: 'es2022',
          assetsInlineLimit: 0,
          chunkSizeWarningLimit: 600,
        },
  };
});
