// Inline SVG line icons (24×24, stroke = currentColor). No external requests.
import type { EvolutionId, UpgradeId } from '../types';

const S = (body: string, extra = ''): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const ICONS: Record<UpgradeId | EvolutionId | 'battery' | 'cache', string> = {
  multi: S('<circle cx="7" cy="15" r="3"/><circle cx="17" cy="15" r="3"/><circle cx="12" cy="7" r="3"/>'),
  pierce: S('<path d="M3 12h15"/><path d="M14 7l5 5-5 5"/><path d="M8 5v14" stroke-dasharray="2 2.4"/>'),
  split: S('<circle cx="6" cy="12" r="2.6"/><path d="M9 12h3l5-5M12 12l5 5"/><path d="M17 7h2.5M17 17h2.5" />'),
  fire: S('<path d="M12 3c1 3.2 5 5.3 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.3-4.8.3 1.6 1.1 2.6 2.2 3C11 8.8 11.2 5.6 12 3z"/>'),
  ice: S('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>'),
  blast: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5M5.3 5.3l2.5 2.5M16.2 16.2l2.5 2.5M5.3 18.7l2.5-2.5M16.2 7.8l2.5-2.5"/>'),
  homing: S('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  power: S('<path d="M13 2.5L5.5 13.5H12L11 21.5l7.5-11H12z"/>'),
  overclock: S('<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4M12 3V1.5M9.5 1.5h5"/>'),
  magnet: S('<path d="M5 4v7a7 7 0 0 0 14 0V4h-4v7a3 3 0 0 1-6 0V4z"/><path d="M5 7.5h4M15 7.5h4"/>'),
  wide: S('<path d="M3 15h18"/><path d="M7 11l-4 4 4 4M17 11l4 4-4 4"/><path d="M9 7l3-3 3 3"/>'),
  aegis: S('<path d="M12 2.8l7.5 3v6c0 4.6-3.2 8-7.5 9.4C7.7 19.8 4.5 16.4 4.5 11.8v-6z"/><path d="M8.8 12l2.2 2.2 4.4-4.4"/>'),
  supernova: S('<circle cx="12" cy="12" r="4"/><path d="M12 1.5l1.4 5M12 22.5l-1.4-5M1.5 12l5-1.4M22.5 12l-5 1.4M4.6 4.6l3.8 3.4M19.4 19.4L15.6 16M4.6 19.4L8 15.6M19.4 4.6L16 8.4"/>'),
  absoluteZero: S('<path d="M12 2l3 6-3 3-3-3zM12 22l-3-6 3-3 3 3zM2 12l6-3 3 3-3 3zM22 12l-6 3-3-3 3-3z"/>'),
  swarm: S('<path d="M4 18l5-3-2-2zM10 10l5-3-2-2zM14 20l5-3-2-2z"/><path d="M6 13c2-4 6-7 12-8" stroke-dasharray="1.5 2"/>'),
  prismEcho: S('<path d="M12 4l7.5 13h-15z"/><path d="M2 10.5h6M2 14h5M16 10.5h6M17 14h5"/>'),
  battery: S('<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3M8 12h6M11 9v6"/>'),
  cache: S('<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/>'),
};

export const UI_ICONS = {
  pause: S('<path d="M8.5 5v14M15.5 5v14" stroke-width="2.6"/>'),
  play: S('<path d="M7 4.5l12 7.5-12 7.5z"/>'),
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3L7 7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>'),
  tutorial: S('<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.6"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor"/>'),
  soundOn: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: S('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  skull: S('<path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.1 4 2.5 5v3h9v-3c1.4-1 2.5-2.6 2.5-5a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="10.5" r="1.4" fill="currentColor"/><circle cx="14.7" cy="10.5" r="1.4" fill="currentColor"/><path d="M10.5 18v2M13.5 18v2"/>', 'stroke-width="2"'),
  retry: S('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v4h4"/>'),
  home: S('<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>'),
  check: S('<path d="M4.5 12.5l4.5 4.5 10.5-10.5" stroke-width="2.6"/>'),
  finger: S('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11l3.6.7c1.5.3 2.4 1.7 2.1 3.2L17 19a3 3 0 0 1-3 2.5H11a3 3 0 0 1-2.4-1.2L5.4 16a1.6 1.6 0 0 1 2.3-2.2L9 15"/>'),
  infinity: S('<path d="M7.5 15.5c-2 0-3.5-1.6-3.5-3.5s1.5-3.5 3.5-3.5c3.5 0 5.5 7 9 7 2 0 3.5-1.6 3.5-3.5s-1.5-3.5-3.5-3.5c-3.5 0-5.5 7-9 7z"/>'),
  rotate: S('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'),
};

/** hex frame used on the level-up cards (72×72) */
export const HEX_FRAME = `<svg class="frame" viewBox="0 0 72 72" fill="none"><path d="M36 3 L65 19.5 V52.5 L36 69 L7 52.5 V19.5 Z" stroke="currentColor" stroke-width="2" fill="rgba(5,3,11,0.55)"/><path d="M36 9 L60 22.6 V49.4 L36 63 L12 49.4 V22.6 Z" stroke="currentColor" stroke-opacity="0.3" stroke-width="1"/></svg>`;
