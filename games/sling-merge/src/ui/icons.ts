/**
 * 内联 SVG 图标（docs §7）：暂停、播放、齿轮、音符、喇叭、震动、屏幕震动、主页、重来、皇冠、小手、问号。
 * 全部 24×24 视窗、圆角线条，颜色走 currentColor（皇冠除外）。
 */
const svg = (body: string, cls = 'ico'): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICON = {
  pause: svg('<rect x="6" y="5" width="4.4" height="14" rx="2.2" fill="currentColor"/><rect x="13.6" y="5" width="4.4" height="14" rx="2.2" fill="currentColor"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>'),
  gear: svg(
    '<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8 4.6v-2.4l-2.3-.5a6 6 0 0 0-.7-1.6l1.3-2-1.7-1.7-2 1.3a6 6 0 0 0-1.6-.7L12.5 3h-2.4l-.5 2.3a6 6 0 0 0-1.6.7l-2-1.3-1.7 1.7 1.3 2a6 6 0 0 0-.7 1.6L2.6 10.5v2.4l2.3.5c.2.6.4 1.1.7 1.6l-1.3 2 1.7 1.7 2-1.3c.5.3 1 .5 1.6.7l.5 2.3h2.4l.5-2.3c.6-.2 1.1-.4 1.6-.7l2 1.3 1.7-1.7-1.3-2c.3-.5.5-1 .7-1.6z" fill="currentColor"/>',
  ),
  note: svg('<path d="M9 17.5V6.2l10-2v11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="6.6" cy="17.6" rx="2.9" ry="2.4" fill="currentColor"/><ellipse cx="16.6" cy="15.4" rx="2.9" ry="2.4" fill="currentColor"/>'),
  speaker: svg('<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  vibrate: svg('<rect x="8" y="4" width="8" height="16" rx="2.4" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  shake: svg('<rect x="5" y="6" width="14" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2.1" transform="rotate(-8 12 12)"/><path d="M2.5 7.5l1.4 1.2M2 12h1.8M2.5 16.5l1.4-1.2M21.5 7.5l-1.4 1.2M22 12h-1.8M21.5 16.5l-1.4-1.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
  home: svg('<path d="M4 11.2L12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.2h-6v5.2H5.5A1.5 1.5 0 0 1 4 19z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'),
  retry: svg('<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M19.6 3.8v4.6H15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  crown: svg('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="#FFC93C" stroke="#F2A100" stroke-width="1.8" stroke-linejoin="round"/>', 'ico crown'),
  book: svg('<path d="M4 5.5C6.8 4.6 9.6 4.8 12 6.4c2.4-1.6 5.2-1.8 8-.9V18.6c-2.8-.9-5.6-.7-8 .9-2.4-1.6-5.2-1.8-8-.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6.4v13" stroke="currentColor" stroke-width="2"/>'),
  trash: svg('<path d="M5 7h14M10 4h4M7 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h5.2a1.6 1.6 0 0 0 1.6-1.5L17 7" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>'),
  check: svg('<path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  skip: svg('<path d="M6 6l6 6-6 6M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  arrowUp: svg('<path d="M12 4l7 8h-4.2v8H9.2v-8H5z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
};

/** 引导用小手（指尖在 (12,3) 附近） */
export const HAND_SVG =
  '<svg class="hand-svg" viewBox="0 0 48 56" aria-hidden="true">' +
  '<path d="M17 30V9.5a4.2 4.2 0 0 1 8.4 0V24l.6-1.2a4 4 0 0 1 7.4 2.2l.4-.6a3.9 3.9 0 0 1 6.9 2.4l.3-.3a3.6 3.6 0 0 1 6 2.6V38c0 9-6.5 15.5-15 15.5h-2.3c-5 0-8.6-2.2-11.3-6.3L5.2 37.4a4.1 4.1 0 0 1 6.3-5.2z" ' +
  'fill="#FFFFFF" stroke="#5B3A5E" stroke-width="3" stroke-linejoin="round"/>' +
  '<path d="M25.6 30v-4.5M33.4 31v-3.8M40.6 32v-3" stroke="#5B3A5E" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>' +
  '<ellipse cx="21.2" cy="11" rx="2.3" ry="1.6" fill="#FFB3C6" opacity=".9"/>' +
  '</svg>';
