import { Inter } from 'next/font/google';
// 需要你在 public/fonts 下放置自托管字体后，取消下面两段注释：
// import localFont from 'next/font/local';

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// export const harmony = localFont({
//   src: '../../public/fonts/HarmonyOS_Sans_SC_Regular.woff2',
//   variable: '--font-harmony',
//   display: 'swap',
// });

// export const lxgw = localFont({
//   src: '../../public/fonts/LXGWWenKai-Regular.woff2',
//   variable: '--font-lxgw',
//   display: 'swap',
// });

// 占位变量：在字体接入前，保证 layout 里组合 className 时不报错
export const harmony = { variable: '' } as { variable: string };
export const lxgw = { variable: '' } as { variable: string };
