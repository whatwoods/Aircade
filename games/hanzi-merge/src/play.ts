/**
 * 游戏中场景：把 core 的事件变成动画、声音、提示与界面（§3、§6.6、§7.2、§8.3–§8.6）。
 * 输入 → Action → core.apply → GameEvent[] → 视图。core 不知道任何渲染细节。
 */
import { BS, CONFIG, LAYOUT, cellXY } from './config.ts';
import { Game, createEndless, createLevel, hintCost, hintMax, stars as starsOf } from './core/game.ts';
import { RECIPE_MAP, canMergeTiles, resolveMerge } from './core/recipes.ts';
import type { Action, GameEvent, LevelDef, Order, Source, Tile, Zone } from './core/types.ts';
import { CHAPTER_NAMES, LEVELS } from './data/levels.ts';
import { clamp, easeInOutQuad, easeOutBack, easeOutCubic, lerp, seg } from './anim/ease.ts';
import { AudioEngine, pentaFreq } from './audio/audio.ts';
import { Music } from './audio/music.ts';
import { Background } from './render/background.ts';
import { BODY_STACK, INK, glyphs } from './render/glyphs.ts';
import { Revealer, makeBlooms, makeMaskBlooms } from './render/ink.ts';
import { MergeFx } from './render/mergeFx.ts';
import { PK, Particles } from './render/particles.ts';
import { Popups } from './render/popups.ts';
import { RackView } from './render/rack.ts';
import { Scrolls } from './render/scrolls.ts';
import { Shake } from './render/shake.ts';
import { GLYPH_BASE, TILE, defaultOpts, drawCard, drawFace, drawTile, roundRect } from './render/tiles.ts';
import type { PointerHandler } from './input/pointer.ts';
import { markTip, save, saveAtlas, saveEndless, saveProgress, saveStats, setTutorialDone } from './save.ts';

const CELLS = CONFIG.board.cols * CONFIG.board.rows;
let HAND: Path2D | null = null;
/** 引导用的手形剪影（指尖在原点，食指朝上），只建一次 */
function handPath(): Path2D {
  if (HAND) return HAND;
  const p = new Path2D();
  p.moveTo(-4, 24);
  p.lineTo(-4, 4);
  p.arc(0, 4, 4, Math.PI, 0);
  p.lineTo(4, 19);
  p.arc(8, 20, 4, Math.PI, 0);
  p.arc(16, 22, 4, Math.PI, 0);
  p.arc(23, 25, 3.5, Math.PI, 0);
  p.lineTo(26.5, 36);
  p.quadraticCurveTo(26, 46, 14, 47);
  p.lineTo(4, 47);
  p.quadraticCurveTo(-5, 46, -8, 38);
  p.lineTo(-13, 30);
  p.quadraticCurveTo(-15, 25, -9, 25.5);
  p.lineTo(-4, 30);
  p.closePath();
  HAND = p;
  return p;
}
/** 拖错动画：摇两下 / 飞回（秒） */
const FAIL_WOBBLE = 0.42;
const FAIL_BACK = 0.2;
const NUM = '一二三四五六七八九十';

export function levelTitle(def: LevelDef): string {
  const k = (def.id - 1) % 5;
  return `卷${NUM[def.chapter - 1]} · 第${NUM[k]}帖`;
}

export interface ResultInfo {
  mode: 'level' | 'endless';
  won: boolean;
  level: number;
  score: number;
  best: number;
  record: boolean;
  stars: number;
  inkLeft: number;
  newChars: string[];
  missing: string[];
  done: number;
  total: number;
  stage: number;
}

/** 界面层（DOM）需要提供的能力 */
export interface PlayHost {
  showCard(ch: string, note: string, done: () => void): void;
  showBrief(ch: string): void;
  showResult(r: ResultInfo): void;
  tip(text: string, ms: number, strong?: boolean): void;
  clearTip(): void;
  showSkip(on: boolean): void;
  pause(): void;
}

interface TileAnim {
  id: number;
  kind: 'drop' | 'slide' | 'swapB' | 'bounce';
  t: number;
  dur: number;
  fx: number;
  fy: number;
}

interface Discard {
  on: boolean;
  t: number;
  tile: Tile;
  x: number;
  y: number;
}

/** 引导步骤（§8.3） */
interface Tutorial {
  step: number;
  t: number;
  alt: boolean;
  caption: string;
  captionT: number;
}

export class Play {
  game: Game | null = null;
  def: LevelDef = LEVELS[0];
  mode: 'level' | 'endless' = 'level';
  seed = 1;
  title = '';
  time = 0;
  paused = false;
  cardOpen = false;
  over = false;
  /** 结果已经弹出 */
  resultShown = false;
  timeScale = 1;
  newChars: string[] = [];
  known = new Set<string>();

  readonly bg = new Background();
  readonly blooms = makeBlooms();
  readonly reveal = new Revealer(makeMaskBlooms());
  readonly particles = new Particles(this.blooms);
  readonly popups = new Popups();
  readonly shake = new Shake();
  readonly rack = new RackView();
  readonly scrolls: Scrolls;
  readonly fx: MergeFx;

  private anims: TileAnim[] = [];
  private discards: Discard[] = [];
  private drag: { from: Source; tile: Tile; startX: number; startY: number } | null = null;
  private hover = -1;
  /** 拖拽悬停在不能合成的牌上（画灰色 ✕） */
  private badHover = -1;
  /** 拖错：拖拽物在落点左右摇两下再飞回（§7.2） */
  private fail = { on: false, t: 0, tile: { id: -1, kind: 'base', ch: '' } as Tile, x: 0, y: 0, bx: 0, by: 0, bs: 1, cell: -1, fromRack: true };
  private hoverZone: Zone = 'center';
  private glow = new Uint8Array(CELLS);
  private overBowl = false;
  private wonAt = -1;
  private lostAt = -1;
  private pendingResult = false;
  private comboT = 0;
  private comboStep = 0;
  private lastSwapHint = false;
  private tut: Tutorial | null = null;
  private idleT = 6;
  private idleCell = -1;
  private idleBloom = 0;
  private opts = defaultOpts();
  private moteT = 0;
  private dragTile: Tile = { id: -1, kind: 'base', ch: '' };
  private inkLowNotified = false;
  private host: PlayHost;
  private audio: AudioEngine;
  private music: Music;
  private retrySeed = 0;

  constructor(host: PlayHost, audio: AudioEngine, music: Music) {
    this.host = host;
    this.audio = audio;
    this.music = music;
    this.scrolls = new Scrolls(this.reveal, {
      stamp: (_slot, x, y) => {
        this.audio.stamp(0.55);
        this.shake.add(CONFIG.fx.trauma.medium);
        this.shake.stop(CONFIG.fx.hitstop.medium);
        this.particles.confetti(x, y, 3, 140);
      },
      closed: () => undefined,
    });
    this.fx = new MergeFx(this.reveal, this.blooms, this.particles, {
      beat: (k, m) => this.onBeat(k, m),
      mergeDone: (ch, first, cell) => this.onMergeDone(ch, first, cell),
      deliverArrive: (slot, uid) => {
        this.scrolls.arrive(slot, uid);
      },
      deliverDone: (slot, _uid, score) => {
        const x = this.scrolls.x(slot) + LAYOUT.scrollW / 2;
        this.popups.float(`+${score}`, x, LAYOUT.scrollY + LAYOUT.scrollH - 6, INK.red, 16);
      },
    });
    this.fx.setScrollX((s) => this.scrolls.x(s));
    for (let i = 0; i < 40; i++) this.anims.push({ id: -1, kind: 'drop', t: 0, dur: 0, fx: 0, fy: 0 });
    for (let i = 0; i < 4; i++) this.discards.push({ on: false, t: 0, tile: { id: 0, kind: 'base', ch: '' }, x: 0, y: 0 });
  }

  get s() {
    return this.game!.s;
  }

  /** 低端机降级（§10）：粒子 ×0.5、远山不漂移 */
  lowPower = false;

  setSettings(): void {
    this.fx.pinyin = save.settings.pinyin;
    this.fx.method = save.settings.methodMark;
    this.fx.reduced = save.settings.reduceMotion;
    this.shake.reduced = save.settings.reduceMotion;
    this.particles.scale = save.settings.reduceMotion || this.lowPower ? 0.5 : 1;
  }

  // ───────────────────────── 开局 ─────────────────────────
  startLevel(id: number, seed?: number, tutorial?: boolean): void {
    const def = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))];
    this.def = def;
    this.mode = 'level';
    this.seed = seed ?? def.id * 1000 + 7;
    this.retrySeed = this.seed;
    this.title = levelTitle(def);
    this.known = new Set(save.atlas);
    this.game = new Game(createLevel(def, this.seed, this.known));
    this.begin();
    const tut = tutorial ?? (def.id === 1 && !save.tutorialDone);
    this.tut = tut && def.id === 1 ? { step: 1, t: 0, alt: false, caption: '', captionT: 0 } : null;
    this.host.showSkip(!!this.tut);
    if (this.tut) this.host.tip('把「木」拖进格子', 0);
    else this.levelTips();
    this.music.xiao = def.chapter >= 4;
  }

  startEndless(seed?: number, stage = 1): void {
    this.mode = 'endless';
    this.seed = seed ?? ((Date.now() % 100000) + 1);
    this.retrySeed = this.seed;
    this.known = new Set(save.atlas);
    this.game = new Game(createEndless(this.seed, this.known, stage));
    this.def = this.s.def;
    this.title = `书斋 · 第${stage}章`;
    this.tut = null;
    this.host.showSkip(false);
    this.begin();
    this.music.xiao = stage >= 4;
  }

  /** 再写一遍（同一种子或换一组，按设置） */
  retry(): void {
    if (this.mode === 'endless') this.startEndless();
    else this.startLevel(this.def.id, save.settings.sameDeal ? this.retrySeed : (Date.now() % 100000) + 1, false);
  }

  private begin(): void {
    this.over = false;
    this.resultShown = false;
    this.pendingResult = false;
    this.wonAt = -1;
    this.lostAt = -1;
    this.newChars = [];
    this.paused = false;
    this.cardOpen = false;
    this.drag = null;
    this.hover = -1;
    this.badHover = -1;
    this.fail.on = false;
    this.cardQueue = '';
    this.heldScore = 0;
    this.inkLowNotified = false;
    this.fx.clear();
    this.particles.clear();
    this.popups.clear();
    for (const a of this.anims) a.id = -1;
    for (const d of this.discards) d.on = false;
    this.scrolls.reset(this.s.def.active, this.s.orders);
    this.rack.reset(this.s.ink, this.s.def.ink, 0);
    this.host.clearTip();
    this.audio.swish(0.1);
    for (let i = 0; i < 4; i++) this.spawnMote();
  }

  private levelTips(): void {
    const tip = this.def.tip;
    const texts: Record<string, string> = {
      hint: '想不出怎么拆？点一下卷轴看提示',
      zone: '同样的部件，放的位置不同，成的字也不同：一放在木上是「末」，放在木下是「本」',
      phonetic: '形声字：一边表意思，一边表读音。清、情、请都读 qing',
      chain: '合成出来的字还能当部件用：先拼出「相」',
    };
    if (tip && texts[tip]) this.tipOnce(tip, texts[tip], 5200);
    if (this.s.orders.some((o) => o.hint === 0)) this.structTip();
  }

  /** 第一次出现只有结构图的卷轴：解释图标（延后，避开开局的情境提示） */
  private structTip(): void {
    if (this.tut || save.tips.has('struct')) return;
    const g = this.game;
    window.setTimeout(() => {
      if (this.game === g && !this.over) this.tipOnce('struct', '卷轴上的小方框是结构图：中间一竖 = 左右结构，一横 = 上下结构。点卷轴可看部件提示', 5000);
    }, 5600);
  }

  private tipOnce(id: string, text: string, ms = 4000): void {
    if (save.tips.has(id)) return;
    markTip(id);
    this.host.tip(text, ms);
  }

  // ───────────────────────── 动作 ─────────────────────────
  act(a: Action, ax?: number, ay?: number): GameEvent[] {
    if (!this.game || this.over) return [];
    const rackBefore = this.s.rack[0];
    const ev = this.game.act(a);
    this.consume(ev, a, rackBefore, ax, ay);
    return ev;
  }

  private consume(ev: GameEvent[], a: Action, rackBefore: string, ax?: number, ay?: number): void {
    const s = this.s;
    let delivered = 0;
    for (const e of ev) {
      switch (e.t) {
        case 'placed': {
          this.anim(e.tile.id, 'drop', 0.16, ax ?? cx(e.cell), ay ?? cy(e.cell));
          this.audio.wood(0.32, s.ink <= 3);
          this.tutEvent('placed');
          if (s.def.decoys.includes(e.tile.ch)) this.tipOnce('discard', '用不上的部件，拖进右下角的笔洗——耗一墨', 4500);
          break;
        }
        case 'moved':
          this.anim(e.tile.id, 'slide', 0.16, ax ?? cx(e.from), ay ?? cy(e.from));
          this.audio.wood(0.18);
          break;
        case 'swapped':
          // 交换：两张牌沿相反方向的弧线互换（§7.2），落点那张从上方绕、原位那张从下方绕
          this.anim(e.a.id, 'slide', 0.3, ax ?? cx(e.ca), ay ?? cy(e.ca));
          this.anim(e.b.id, 'swapB', 0.3, cx(e.cb), cy(e.cb));
          this.audio.wood(0.2);
          setTimeout(() => this.audio.wood(0.16), 90);
          if (!this.lastSwapHint) {
            this.lastSwapHint = true;
            this.tipOnce('undo', '拼错了？每帖可以悔笔一次', 3500);
          }
          break;
        case 'rejected':
          if (e.from === 'rack') {
            this.rack.rejectShake = 1;
            this.audio.pluck(pentaFreq(-2), 0.25, true);
            if (s.ink <= 0) this.host.tip('墨已尽：只能在纸上合成或移动', 2200);
          }
          break;
        case 'merged': {
          const first = !save.atlas.has(e.recipe);
          if (first) {
            save.atlas.add(e.recipe);
            this.newChars.push(e.recipe);
            saveAtlas();
          }
          const from = e.from;
          const sx = ax ?? (from === 'rack' ? LAYOUT.rackCur.x + LAYOUT.rackCur.w / 2 : cx(from));
          const sy = ay ?? (from === 'rack' ? LAYOUT.rackCur.y + LAYOUT.rackCur.h / 2 : cy(from));
          const zone = a.t === 'drop' ? a.zone : 'center';
          this.fx.startMerge(e.a, e.b, e.result, e.cell, sx, sy, first && !(this.tut && e.recipe === '林'), zone === 'right' || zone === 'bottom');
          save.stats.merges++;
          const r = RECIPE_MAP.get(e.recipe);
          const vv = r?.vv ? [...r.vv] : null;
          const vi = vv && r ? vv.findIndex((c, i) => c !== r.parts[i]) : -1;
          if (r && vv && vi >= 0 && first && !this.tut) {
            this.tipOnce('variant', `「${r.parts[vi]}」在「${r.c}」里写作「${vv[vi]}」——不少部件入字后会写成偏旁的样子`, 4000);
          }
          if (!first && !s.orders.some((o) => o.ch === e.recipe)) {
            // 重复合成已知字：小气泡 1.2 s
            this.popups.showInfo(e.recipe, cx(e.cell), cy(e.cell) - 70, 1.2);
          }
          this.tutEvent('merged', e.recipe);
          break;
        }
        case 'pending':
          this.fx.startMerge(e.a, e.b, e.result, e.cell, ax ?? cx(typeof e.from === 'number' ? e.from : 0), ay ?? cy(typeof e.from === 'number' ? e.from : 0), false, false);
          this.tipOnce('pending', '三个部件的字：先叠两个，再补第三个', 4000);
          break;
        case 'delivered':
          this.scrolls.delivered(e.order.slot, e.order.uid);
          this.fx.startDeliver(e.tile.ch, e.cell, e.order.slot, e.order.uid, e.score, e.index);
          delivered++;
          break;
        case 'orderOpened':
          this.scrolls.orderOpened(e.order);
          this.audio.swish(0.08);
          if (e.order.hint === 0) this.structTip();
          break;
        case 'discarded': {
          const d = this.discards.find((x) => !x.on) ?? this.discards[0];
          d.on = true;
          d.t = 0;
          d.tile = e.tile.id === -1 ? { id: -1, kind: 'base', ch: rackBefore } : e.tile;
          d.x = ax ?? (e.from === 'rack' ? LAYOUT.rackCur.x + 44 : cx(e.from as number));
          d.y = ay ?? (e.from === 'rack' ? LAYOUT.rackCur.y + 44 : cy(e.from as number));
          save.stats.discards++;
          break;
        }
        case 'hint':
          this.scrolls.setHint(e.order);
          this.audio.pluck(pentaFreq(4), 0.18, true);
          break;
        case 'ink':
          if (e.delta < 0) this.popups.float(`−${-e.delta}`, LAYOUT.ink.x + 44, LAYOUT.ink.y + 8, INK.red, 14);
          else this.popups.float(`+${e.delta}`, LAYOUT.ink.x + 44, LAYOUT.ink.y + 8, INK.ink2, 14);
          if (s.ink <= 3 && s.ink > 0 && !this.inkLowNotified) this.inkLowNotified = true;
          break;
        case 'rack':
          this.rack.shift = 0;
          break;
        case 'score':
          if (this.fx.busy()) this.heldScore += e.delta;
          break;
        case 'undo':
          this.onUndo();
          break;
        case 'inkOut':
          this.audio.bell(pentaFreq(-5), 0.25);
          this.host.tip('墨已尽，看看棋盘上还能拼出什么', 3500);
          markTip('inkout');
          break;
        case 'won':
          this.over = true;
          this.wonAt = this.time;
          break;
        case 'lost':
          this.over = true;
          this.lostAt = this.time;
          this.audio.wind(0.2);
          for (let i = 0; i < 4; i++) this.audio.pluck(pentaFreq(4 - i * 2), 0.2, false, undefined, i * 0.22);
          break;
        case 'stage':
          this.title = `书斋 · 第${e.stage}章`;
          this.popups.float(`第${e.stage}章`, LAYOUT.W / 2, 50, INK.red, 18);
          this.audio.bell(pentaFreq(5), 0.2);
          if (e.stage >= 4) this.music.xiao = true;
          break;
        default:
          break;
      }
    }
    if (delivered >= 2) {
      // 连成：磬声逐个升高 + 朱色跳字
      this.popups.float(`连成 ×${delivered}`, LAYOUT.W / 2, LAYOUT.scrollY + LAYOUT.scrollH + 14, INK.red, 16);
    }
    this.music.tension = s.ink <= 3 ? 1 : 0;
  }

  private onUndo(): void {
    this.fx.clear();
    for (const a of this.anims) a.id = -1;
    this.scrolls.sync(this.s.orders);
    this.rack.shift = 1;
    this.audio.paper(0.16);
    this.over = false;
    this.wonAt = -1;
    this.lostAt = -1;
  }

  private anim(id: number, kind: TileAnim['kind'], dur: number, fx: number, fy: number): void {
    const a = this.anims.find((x) => x.id === -1 || x.id === id) ?? this.anims[0];
    a.id = id;
    a.kind = kind;
    a.t = 0;
    a.dur = dur;
    a.fx = fx;
    a.fy = fy;
  }

  private onBeat(k: string, m: { first: boolean; depth: number; tri: boolean; index: number; x: number; y: number }): void {
    const T = CONFIG.fx;
    if (k === 'fly') this.audio.paper(0.16);
    else if (k === 'join' || k === 'pendingJoin') {
      if (this.comboT > 0) this.comboStep = Math.min(5, this.comboStep + 1);
      else this.comboStep = 0;
      this.comboT = 3;
      // 连续合成：每次上行两个五声音级（约一个大三度），并叠一个高八度泛音，音高上行清楚可辨
      const step = Math.min(12, m.depth + this.comboStep * 2);
      this.audio.wood(0.22, true);
      if (k === 'pendingJoin') this.audio.pluck(pentaFreq(step) * 1.5, 0.3);
      else {
        this.audio.pluck(pentaFreq(step), 0.42);
        if (this.comboStep > 0) this.audio.pluck(pentaFreq(step + 5), 0.16 + 0.03 * this.comboStep, false, undefined, 0.05);
        if (m.tri) {
          this.audio.pluck(pentaFreq(step + 2), 0.3, false, undefined, 0.09);
          this.audio.pluck(pentaFreq(step + 4), 0.3, false, undefined, 0.18);
        }
        this.shake.stop(m.first ? T.hitstop.heavy : T.hitstop.medium);
        this.shake.add(m.first && m.tri ? T.trauma.heavy : T.trauma.light);
      }
    } else if (k === 'reveal') this.audio.hiss(0.1);
    else if (k === 'seal') {
      if (m.first) {
        this.audio.stamp(0.5);
        this.audio.bell(pentaFreq(7), 0.18, 0.05);
        this.shake.add(0.1);
      }
    } else if (k === 'arrive') {
      const base = 5 + m.index * 2;
      this.audio.bell(pentaFreq(base), 0.22);
      this.audio.bell(pentaFreq(base + 2), 0.14, 0.06);
      this.audio.bell(pentaFreq(base + 3), 0.1, 0.12);
    }
  }

  private onMergeDone(ch: string, first: boolean, _cell: number): void {
    if (!first) return;
    const tutLin = this.tut && ch === '林';
    if (tutLin) return;
    if (save.settings.card === 'brief' || this.cardForcedBrief) {
      this.host.showBrief(ch);
      return;
    }
    const note = '';
    // 新字卡等「成」印落下、字飞进卷轴之后再弹（P1-3：不切断高潮）
    this.cardQueue = ch;
    this.cardNote = note;
    this.cardWait = 0;
  }

  private cardQueue = '';
  private cardNote = '';
  private cardWait = 0;
  /** 合成 / 交付动画未结束前不计入显示分数（分数在落印、交付时才滚动） */
  private heldScore = 0;

  /** ?card=brief（自动化测试） */
  cardForcedBrief = false;

  openCard(ch: string, note = ''): void {
    this.cardOpen = true;
    if (this.drag) this.cancelDrag();
    this.host.showCard(ch, note, () => {
      this.cardOpen = false;
    });
  }

  // ───────────────────────── 输入 ─────────────────────────
  readonly input: PointerHandler = {
    down: (x, y) => {
      if (!this.game || this.paused || this.cardOpen || this.over) return false;
      this.pressX = x;
      this.pressY = y;
      const c = cellAt(x, y);
      if (c >= 0 && this.s.board[c] && !this.fx.locked(c)) {
        this.opts.lift = 0;
        return true;
      }
      if (inRect(x, y, LAYOUT.rackCur) && this.s.ink > 0) return true;
      return false;
    },
    dragStart: () => {
      if (!this.game) return;
      const start = this.pressStart();
      if (start === 'rack') {
        this.dragTile.id = -1;
        this.dragTile.kind = 'base';
        this.dragTile.ch = this.s.rack[0];
        this.dragTile.parts = undefined;
        this.drag = { from: 'rack', tile: this.dragTile, startX: LAYOUT.rackCur.x + 44, startY: LAYOUT.rackCur.y + 44 };
      } else if (typeof start === 'number' && this.s.board[start]) {
        this.drag = { from: start, tile: this.s.board[start]!, startX: cx(start), startY: cy(start) };
      } else return;
      this.audio.paper(0.12);
      this.computeGlow();
    },
    dragMove: (x, y) => this.dragMove(x, y),
    dragEnd: (x, y) => this.dragEnd(x, y),
    dragCancel: () => this.cancelDrag(),
    tap: (x, y) => this.tap(x, y),
  };

  /** 按下位置：拖拽开始时（指针可能已移开）据此确认来源 */
  private pressX = 0;
  private pressY = 0;
  private pressStart(): Source | null {
    const x = this.pressX;
    const y = this.pressY;
    const c = cellAt(x, y);
    if (c >= 0 && this.s.board[c] && !this.fx.locked(c)) return c;
    if (inRect(x, y, LAYOUT.rackCur) && this.s.ink > 0) return 'rack';
    return null;
  }

  private computeGlow(): void {
    const d = this.drag;
    this.glow.fill(0);
    if (!d) return;
    const targets = new Set(this.s.orders.map((o) => o.ch));
    for (let i = 0; i < CELLS; i++) {
      const t = this.s.board[i];
      if (!t || i === d.from) continue;
      if (!canMergeTiles(d.tile, t)) continue;
      this.glow[i] = 1;
      for (const z of ZONES) {
        const r = resolveMerge(d.tile, t, z);
        if (r.kind === 'char' && targets.has(r.recipe.c)) this.glow[i] = 2;
        if (r.kind === 'pending' && r.targets.some((x) => targets.has(x.c))) this.glow[i] = 2;
      }
    }
  }

  private dragMove(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    const c = cellAt(x, y);
    this.overBowl = Math.hypot(x - (LAYOUT.bowl.x + 35), y - (LAYOUT.bowl.y + 35)) < 44;
    if (c >= 0 && c !== d.from && this.s.board[c] && !this.fx.locked(c) && this.glow[c]) {
      const zone = zoneAt(x, y, c);
      const t = this.s.board[c]!;
      const r = resolveMerge(d.tile, t, zone);
      const changed = c !== this.hover || zone !== this.hoverZone;
      this.hover = c;
      this.hoverZone = zone;
      if (r.kind !== 'none') {
        const multi = r.kind === 'char' && r.candidates.length > 1;
        const ch = r.kind === 'char' ? r.recipe.c : '';
        const p = cellXY(c);
        const hc = LAYOUT.cell / 2;
        let bx = p.x + hc;
        let by = p.y - 76 + hc - (LAYOUT.cell - 66) / 2;
        if (c < CONFIG.board.cols) {
          // 第 0 行上方是卷轴：气泡放到左侧或右侧
          by = p.y + hc;
          bx = p.x + hc + (p.x < LAYOUT.W / 2 ? hc + 60 : -hc - 60);
        }
        this.popups.setPreview(ch, bx, by, multi ? arrowOf(zone) : '');
        this.popups.preview.big = r.kind === 'pending';
        if (changed) this.audio.ding();
      }
      this.badHover = -1;
    } else {
      this.hover = -1;
      this.badHover = c >= 0 && c !== d.from && this.s.board[c] && !this.fx.locked(c) ? c : -1;
      this.popups.hidePreview();
    }
  }

  private dragEnd(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.hover = -1;
    this.popups.hidePreview();
    this.glow.fill(0);
    const s = this.s;
    if (this.overBowl) {
      this.overBowl = false;
      if (s.ink <= 0) {
        this.host.tip('墨尽，不能洗笔', 2000);
        this.bounceBack(d, x, y);
        return;
      }
      this.act({ t: 'discard', from: d.from }, x, y);
      return;
    }
    const c = cellAt(x, y);
    if (c < 0 || c === d.from || this.fx.locked(c)) {
      this.bounceBack(d, x, y);
      return;
    }
    const zone = zoneAt(x, y, c);
    const target = s.board[c];
    if (d.from === 'rack' && target && s.ink > 0 && resolveMerge(d.tile, target, zone).kind === 'none') {
      this.failDrop(d.tile, c, x, y);
      return;
    }
    const ev = this.act({ t: 'drop', from: d.from, cell: c, zone }, x, y);
    if (!ev.length) this.bounceBack(d, x, y);
  }

  /** 笔架部件拖到组不成字的牌上：落点摇两下 + 闷弦 + 灰 ✕ + 简短原因，再飞回笔架 */
  private failDrop(tile: Tile, cell: number, x: number, y: number): void {
    const f = this.fail;
    f.on = true;
    f.t = 0;
    f.tile.id = -1;
    f.tile.kind = tile.kind;
    f.tile.ch = tile.ch;
    f.x = x;
    f.y = y;
    f.bx = LAYOUT.rackCur.x + LAYOUT.rackCur.w / 2;
    f.by = LAYOUT.rackCur.y + LAYOUT.rackCur.h / 2;
    f.bs = LAYOUT.rackCur.w / TILE;
    f.cell = cell;
    f.fromRack = true;
    this.audio.pluck(pentaFreq(-3), 0.32, true);
    this.audio.wood(0.14, true);
    const t = this.s.board[cell];
    if (!save.tips.has('nomerge') && !this.tut) this.tipOnce('nomerge', `这两个部件组不成字：「${tile.ch}」+「${t?.kind === 'pending' ? '未成' : t?.ch ?? ''}」`, 3000);
    else this.popups.float('组不成字', cx(cell), cy(cell) - LAYOUT.cell * 0.6, INK.wash, 14);
  }

  private bounceBack(d: { from: Source; tile: Tile }, x: number, y: number): void {
    if (d.from === 'rack') {
      this.rack.shift = 1;
      this.rack.rejectShake = 0.6;
    } else this.anim(d.tile.id, 'bounce', 0.22, x, y);
  }

  cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.hover = -1;
    this.overBowl = false;
    this.popups.hidePreview();
    this.glow.fill(0);
    if (d.from !== 'rack') this.anim(d.tile.id, 'bounce', 0.2, cx(d.from), cy(d.from));
  }

  private tap(x: number, y: number): void {
    if (!this.game || this.cardOpen) return;
    if (inRect(x, y, LAYOUT.pauseBtn, 4)) {
      this.host.pause();
      return;
    }
    if (this.paused || this.over) return;
    if (inRect(x, y, LAYOUT.undoBtn)) {
      this.undo();
      return;
    }
    const slot = this.scrolls.hit(x, y);
    if (slot >= 0) {
      this.hint(slot);
      return;
    }
    const c = cellAt(x, y);
    if (c >= 0 && this.s.board[c]) {
      const t = this.s.board[c]!;
      if (t.kind !== 'pending') this.popups.showInfo(t.ch, cx(c), c < CONFIG.board.cols ? cy(c) + 70 : cy(c) - 70);
      this.audio.ding();
      return;
    }
    if (inRect(x, y, LAYOUT.rackCur)) {
      this.popups.showInfo(this.s.rack[0], LAYOUT.rackCur.x + 44, LAYOUT.rackCur.y - 40);
      return;
    }
    if (inRect(x, y, LAYOUT.bowl)) this.host.tip('用不上的部件拖进笔洗，耗一墨', 2200);
  }

  undo(): void {
    if (!this.game || !this.game.canUndo() || this.over) return;
    this.act({ t: 'undo' });
  }

  hint(slot: number): void {
    if (!this.game) return;
    const o = this.s.orders.find((x) => x.slot === slot);
    if (!o) return;
    if (o.hint >= hintMax(o)) {
      this.popups.showInfo(o.ch, this.scrolls.x(slot) + 56, LAYOUT.scrollY + LAYOUT.scrollH + 40, 1.6);
      return;
    }
    if (this.s.ink < hintCost(this.s)) {
      this.host.tip('墨不够，不能再看提示', 2000);
      return;
    }
    this.act({ t: 'hint', slot });
  }

  // ───────────────────────── 引导 ─────────────────────────
  skipTutorial(): void {
    if (!this.tut) return;
    this.tut = null;
    setTutorialDone(true);
    this.host.showSkip(false);
    this.host.clearTip();
  }

  tutorialStep(step: number): void {
    if (this.def.id !== 1 || this.mode !== 'level') this.startLevel(1, undefined, true);
    if (!this.tut) this.tut = { step: 1, t: 0, alt: false, caption: '', captionT: 0 };
    this.tut.step = Math.max(1, Math.min(4, step));
    this.host.showSkip(true);
  }

  private tutEvent(kind: 'placed' | 'merged', ch = ''): void {
    const t = this.tut;
    if (!t) return;
    if (t.step === 1 && kind === 'placed') {
      t.step = 2;
      t.t = 0;
      this.host.tip('每落一笔，耗一墨', 1500, true);
      setTimeout(() => this.tut?.step === 2 && this.host.tip(t.alt ? '把两个「木」叠在一起' : '把「木」拖到「木」上', 0), 1600);
    } else if (t.step === 2 && kind === 'placed') {
      t.alt = true;
      this.host.tip('把两个「木」叠在一起', 0);
    } else if (t.step === 2 && kind === 'merged' && ch === '林') {
      t.step = 3;
      t.caption = '林 · 从二木 · 会意';
      t.captionT = 2;
      this.host.tip('部件按真实的造字方式才能合成。墨用完前写完卷轴上的字。', 2600, true);
      setTimeout(() => this.tut?.step === 3 && this.host.tip('先拼一个「林」', 0), 2700);
    } else if (t.step === 3 && kind === 'merged' && ch === '林') {
      t.step = 4;
      this.host.tip('再添一木，就成了「森」', 0);
    } else if (t.step === 4 && kind === 'merged' && ch === '森') {
      this.tut = null;
      setTutorialDone(true);
      this.host.showSkip(false);
      this.host.clearTip();
    }
  }

  // ───────────────────────── 每帧 ─────────────────────────
  update(rdt: number): void {
    if (!this.game) return;
    if (this.paused) return;
    const frozen = this.cardOpen;
    this.popups.update(rdt);
    if (frozen) return;
    const k = this.shake.update(rdt);
    const dt = rdt * k * this.timeScale;
    this.time += rdt * this.timeScale;
    this.comboT = Math.max(0, this.comboT - rdt);
    this.fx.update(dt);
    this.scrolls.update(dt);
    this.particles.update(rdt * this.timeScale);
    if (!this.fx.busy()) this.heldScore = 0;
    this.rack.update(rdt, this.s.ink, this.s.score - this.heldScore);
    if (this.cardQueue) {
      this.cardWait += rdt;
      // 交付飞行结束（或最多等 2 s）后再弹卡
      if (!this.fx.delivering(-1) || this.cardWait > 2) {
        const ch = this.cardQueue;
        this.cardQueue = '';
        if (!this.over || this.newChars.includes(ch)) this.openCard(ch, this.cardNote);
      }
    }
    this.rack.bowlHot = this.drag && this.overBowl ? 1 : 0;
    this.rack.bowlArmed = this.drag ? 1 : 0;
    for (const a of this.anims) {
      if (a.id === -1) continue;
      a.t += dt;
      if (a.t >= a.dur) a.id = -1;
    }
    if (this.fail.on) {
      this.fail.t += rdt;
      if (this.fail.t >= FAIL_WOBBLE + FAIL_BACK) this.fail.on = false;
    }
    for (const d of this.discards) {
      if (!d.on) continue;
      const pt = d.t;
      d.t += dt;
      if (pt < 0.3 && d.t >= 0.3) {
        this.particles.mist(LAYOUT.bowl.x + 35, LAYOUT.bowl.y + 35);
        this.rack.bowlRipple = 1;
        this.audio.water(0.3);
      }
      if (d.t >= 0.5) d.on = false;
    }
    if (this.tut) {
      this.tut.t += rdt;
      if (this.tut.captionT > 0) this.tut.captionT -= rdt;
    }
    // 待机：字牌偶发「墨润」
    this.idleT -= rdt;
    if (this.idleT <= 0) {
      this.idleT = 6 + Math.random() * 4;
      const cand: number[] = [];
      for (let i = 0; i < CELLS; i++) if (this.s.board[i]?.kind === 'char') cand.push(i);
      this.idleCell = cand.length ? cand[Math.floor(Math.random() * cand.length)] : -1;
      this.idleBloom = 0;
    }
    if (this.idleCell >= 0) {
      this.idleBloom += rdt / 0.8;
      if (this.idleBloom >= 1) this.idleCell = -1;
    }
    this.moteT -= rdt;
    if (this.moteT <= 0) {
      this.moteT = 3 + Math.random() * 3;
      this.spawnMote();
    }
    // 结束 → 结算
    if (this.over && !this.resultShown && !this.pendingResult) {
      const idle = !this.fx.busy() && !this.cardOpen && !this.cardQueue && !this.scrolls.views.some((v) => v && v.phase !== 'open');
      if (this.wonAt >= 0 && idle && this.time - this.wonAt > 0.4) this.finish(true);
      if (this.lostAt >= 0 && this.time - this.lostAt > 1.4) this.finish(false);
    }
  }

  private spawnMote(): void {
    this.particles.spawn(PK.Mote, 20 + Math.random() * 350, 200 + Math.random() * 420, (Math.random() - 0.5) * 6, -2 - Math.random() * 4, 8 + Math.random() * 6, 3 + Math.random() * 4);
  }

  private finish(won: boolean): void {
    this.pendingResult = true;
    const s = this.s;
    if (won) {
      this.audio.bell(pentaFreq(5), 0.25);
      for (let i = 0; i < 5; i++) this.audio.pluck(pentaFreq(i * 2), 0.28, false, undefined, i * 0.09);
      this.shake.add(CONFIG.fx.trauma.heavy);
      this.music.stop(1);
    }
    let best = 0;
    let record = false;
    let st = 0;
    if (this.mode === 'level') {
      st = won ? starsOf(s) : 0;
      const rec = save.progress.levels[this.def.id] ?? { best: 0, stars: 0 };
      if (won) {
        record = s.score > rec.best && rec.best > 0;
        const first = rec.best === 0;
        rec.best = Math.max(rec.best, s.score);
        rec.stars = Math.max(rec.stars, st);
        save.progress.levels[this.def.id] = rec;
        if (this.def.id + 1 > save.progress.unlocked) save.progress.unlocked = Math.min(LEVELS.length, this.def.id + 1);
        saveProgress();
        if (first) record = false;
      }
      best = rec.best;
    } else {
      const eb = save.endlessBest;
      record = s.score > eb.score && eb.score > 0;
      if (s.score > eb.score || s.stage > eb.stage) {
        eb.score = Math.max(eb.score, s.score);
        eb.stage = Math.max(eb.stage, s.stage);
        saveEndless();
      }
      best = eb.score;
    }
    save.stats.seconds += Math.round(this.time);
    saveStats();
    const missing = s.orders.map((o) => o.ch).concat(this.mode === 'level' ? s.queue : []);
    const info: ResultInfo = {
      mode: this.mode, won, level: this.def.id, score: s.score, best, record, stars: st, inkLeft: s.ink,
      newChars: [...this.newChars], missing, done: s.delivered, total: this.mode === 'level' ? this.def.targets.length : s.delivered, stage: s.stage,
    };
    setTimeout(() => {
      this.resultShown = true;
      this.host.showResult(info);
      if (record) {
        this.audio.bell(pentaFreq(7), 0.3, 0.9);
        this.audio.bell(pentaFreq(9), 0.2, 1.0);
      }
    }, won ? 200 : 100);
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    const t = this.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg.drawBase(ctx, t, 690, 0.8, !save.settings.reduceMotion && !this.lowPower);
    ctx.save();
    if (this.shake.trauma > 0) {
      ctx.translate(LAYOUT.W / 2 + this.shake.x, LAYOUT.H / 2 + this.shake.y);
      ctx.rotate(this.shake.rot);
      ctx.translate(-LAYOUT.W / 2, -LAYOUT.H / 2);
    }
    if (!this.game) {
      ctx.restore();
      return;
    }
    const s = this.s;
    this.rack.drawPause(ctx);
    this.rack.drawHeader(ctx, this.title);
    this.scrolls.draw(ctx, t);
    this.bg.drawGrid(ctx);
    if (this.tut && this.tut.captionT > 0) {
      // 放在卷轴下木轴与盘面第一行之间的窄缝里（画在格线之后），衬一条宣纸底
      const capY = (LAYOUT.scrollY + LAYOUT.scrollH + LAYOUT.boardY) / 2 + 1;
      ctx.font = `13px ${BODY_STACK}`;
      ctx.globalAlpha = Math.min(1, this.tut.captionT * 2);
      const tw = ctx.measureText(this.tut.caption).width + 20;
      ctx.fillStyle = 'rgba(248,243,232,0.92)';
      roundRect(ctx, LAYOUT.W / 2 - tw / 2, capY - 11, tw, 22, 11);
      ctx.fill();
      ctx.fillStyle = INK.redLo;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.tut.caption, LAYOUT.W / 2, capY);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'start';
    }
    // 引导：亮格
    if (this.tut && this.tut.step === 1) {
      const p = cellXY(CONFIG.board.focus);
      ctx.strokeStyle = INK.red;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, LAYOUT.cell - 2, LAYOUT.cell - 2);
      ctx.globalAlpha = 1;
    }
    this.particles.draw(ctx, 'paper');
    const o = this.opts;
    o.pinyin = save.settings.pinyin;
    o.method = save.settings.methodMark;
    o.time = t;
    const fade = this.lostAt >= 0 ? this.time - this.lostAt : -1;
    const d = this.drag;
    for (let i = 0; i < CELLS; i++) {
      const tile = s.board[i];
      if (!tile || this.fx.locked(i)) continue;
      let x = cx(i);
      let y = cy(i);
      let sc = 1;
      for (const a of this.anims) {
        if (a.id !== tile.id) continue;
        const u = clamp(a.t / a.dur);
        if (a.kind === 'drop') {
          const e = easeOutBack(u);
          x = lerp(a.fx, x, Math.min(1, u * 1.6));
          y = lerp(a.fy, y, Math.min(1, u * 1.6));
          sc = 0.94 + 0.06 * e;
        } else {
          const e = a.kind === 'bounce' ? easeOutCubic(u) : easeInOutQuad(u);
          x = lerp(a.fx, x, e);
          const arc = a.kind === 'slide' ? -16 : a.kind === 'swapB' ? 16 : 0;
          y = lerp(a.fy, y, e) + Math.sin(u * Math.PI) * arc;
          if (a.kind === 'swapB' || (a.kind === 'slide' && a.dur > 0.25)) sc = 1 + 0.08 * Math.sin(u * Math.PI);
        }
      }
      const g = d ? this.glow[i] : 0;
      if (g) {
        const br = 0.35 + 0.15 * Math.sin((t / 1.2) * Math.PI * 2);
        const hot = this.hover === i ? 0.3 : 0;
        ctx.fillStyle = `rgba(95,127,106,${br + hot})`;
        roundRect(ctx, x - 35 * BS, y - 35 * BS, 70 * BS, 70 * BS, 9);
        ctx.fill();
        if (g === 2) {
          ctx.strokeStyle = INK.red;
          ctx.lineWidth = 1.6;
          roundRect(ctx, x - 33 * BS, y - 33 * BS, 66 * BS, 66 * BS, 8);
          ctx.stroke();
        }
      }
      const isSrc = d && d.from === i;
      o.alpha = isSrc ? 0.3 : 1;
      o.scale = sc * BS;
      o.lift = 0;
      o.fade = fade >= 0 ? clamp((fade - i * 0.03) / 0.3) : 0;
      o.bloom = this.idleCell === i ? Math.sin(this.idleBloom * Math.PI) : 0;
      drawTile(ctx, tile, x, y, o);
      o.bloom = 0;
    }
    o.alpha = 1;
    o.scale = 1;
    o.fade = 0;
    // 方位箭头（同部件多结果）
    if (d && this.hover >= 0 && this.popups.arrow) {
      const hx = cx(this.hover);
      const hy = cy(this.hover);
      const z = this.hoverZone;
      const ox = z === 'left' ? -24 : z === 'right' ? 24 : 0;
      const oy = z === 'top' ? -24 : z === 'bottom' ? 24 : 0;
      ctx.fillStyle = INK.jade;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(hx + ox, hy + oy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    this.fx.draw(ctx, t);
    // 底部 HUD
    const gray = s.ink <= 0;
    this.rack.drawInk(ctx, s.ink, t);
    this.rack.drawRack(ctx, s.rack, !!(d && d.from === 'rack') || this.fail.on, gray, t);
    this.rack.drawBowl(ctx, s.ink > 0);
    this.rack.drawUndo(ctx, s.undoLeft, this.game.canUndo() && !this.over);
    // 洗笔中的牌
    for (const dd of this.discards) {
      if (!dd.on) continue;
      const u = easeInOutQuad(clamp(dd.t / 0.3));
      const bx = LAYOUT.bowl.x + 35;
      const by = LAYOUT.bowl.y + 35;
      o.scale = lerp(BS, 0.3, u);
      o.alpha = 1 - seg(dd.t, 0.25, 0.4);
      drawTile(ctx, dd.tile, lerp(dd.x, bx, u), lerp(dd.y, by, u) - Math.sin(u * Math.PI) * 30, o);
    }
    o.scale = 1;
    o.alpha = 1;
    this.particles.draw(ctx, 'air');
    this.fx.drawDeliver(ctx);
    if (this.tut) this.drawFinger(ctx, t);
    // 拖错：落点左右摇两下，再飞回笔架
    if (this.fail.on) {
      const f = this.fail;
      let x = f.x;
      let y = f.y;
      let sc = BS;
      if (f.t < FAIL_WOBBLE) {
        const u = f.t / FAIL_WOBBLE;
        x += Math.sin(u * Math.PI * 4) * 10 * (1 - u);
      } else {
        const k = easeInOutQuad(clamp((f.t - FAIL_WOBBLE) / FAIL_BACK));
        x = lerp(f.x, f.bx, k);
        y = lerp(f.y, f.by, k) - Math.sin(k * Math.PI) * 24;
        sc = lerp(BS, f.bs, k);
      }
      o.scale = sc;
      o.alpha = 0.92;
      drawCard(ctx, x, y, sc, 0.92, 0.6);
      drawFace(ctx, f.tile, x, y, o);
      o.scale = 1;
      o.alpha = 1;
    }
    // 拖拽物：悬停在可合成的目标上时缩小、半透明，让下面的目标牌（石绿光晕、朱描边）露出来
    if (d) {
      const P = this.dragPos;
      const over = this.hover >= 0 ? 1 : this.badHover >= 0 ? 0.8 : 0;
      const gs = BS * lerp(1.08, 0.8, over);
      const ga = lerp(0.96, 0.55, over);
      o.scale = gs;
      o.lift = 1;
      o.alpha = ga;
      drawCard(ctx, P.x, P.y, gs, ga, 1);
      drawFace(ctx, d.tile, P.x, P.y, o);
      o.lift = 0;
      o.scale = 1;
      o.alpha = 1;
      if (this.overBowl) {
        ctx.fillStyle = 'rgba(95,127,106,0.25)';
        ctx.beginPath();
        ctx.arc(P.x, P.y, 40, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 不能合成的目标：淡灰 ✕（拖拽悬停时，或拖错后 0.45 s）
    const xc = d && this.badHover >= 0 ? this.badHover : this.fail.on && this.fail.t < FAIL_WOBBLE + 0.15 ? this.fail.cell : -1;
    if (xc >= 0) {
      const X = cx(xc);
      const Y = cy(xc);
      const r = LAYOUT.cell * 0.22;
      ctx.strokeStyle = INK.light;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X - r, Y - r);
      ctx.lineTo(X + r, Y + r);
      ctx.moveTo(X + r, Y - r);
      ctx.lineTo(X - r, Y + r);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }
    this.popups.draw(ctx, BODY_STACK);
    ctx.restore();
  }

  /** 拖拽物中心（由 main 每帧写入） */
  dragPos = { x: 0, y: 0 };

  isDragging(): boolean {
    return !!this.drag;
  }

  private drawFinger(ctx: CanvasRenderingContext2D, t: number): void {
    const tu = this.tut!;
    let x0 = LAYOUT.rackCur.x + 44;
    let y0 = LAYOUT.rackCur.y + 44;
    let x1 = cx(CONFIG.board.focus);
    let y1 = cy(CONFIG.board.focus);
    const s = this.s;
    if (tu.step === 2 || tu.step === 4) {
      const target = tu.step === 2 ? '木' : '林';
      const cells: number[] = [];
      for (let i = 0; i < CELLS; i++) if (s.board[i]?.ch === target) cells.push(i);
      if (!cells.length) return;
      if (tu.step === 2 && tu.alt && cells.length >= 2) {
        x0 = cx(cells[0]);
        y0 = cy(cells[0]);
        x1 = cx(cells[1]);
        y1 = cy(cells[1]);
      } else {
        x1 = cx(cells[0]);
        y1 = cy(cells[0]);
      }
    } else if (tu.step === 3) return;
    if (this.drag) return;
    // 拖动轨迹：上拱的虚线弧 + 箭头；手形剪影带着一张淡「木」牌沿弧线走
    const qx = (x0 + x1) / 2;
    const qy = Math.min(y0, y1) - 40;
    ctx.save();
    ctx.strokeStyle = INK.red;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 22;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(qx, qy, x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    // 箭头（沿终点切线）
    const ang = Math.atan2(y1 - qy, x1 - qx);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x1 - Math.cos(ang - 0.45) * 11, y1 - Math.sin(ang - 0.45) * 11);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(ang + 0.45) * 11, y1 - Math.sin(ang + 0.45) * 11);
    ctx.stroke();
    ctx.restore();
    const period = 1.8;
    const u = (t % period) / period;
    const m = easeInOutQuad(seg(u, 0.15, 0.75));
    const a = u < 0.1 ? u / 0.1 : u > 0.85 ? Math.max(0, (1 - u) / 0.15) : 1;
    const im = 1 - m;
    const x = im * im * x0 + 2 * im * m * qx + m * m * x1;
    const y = im * im * y0 + 2 * im * m * qy + m * m * y1;
    drawCard(ctx, x, y, BS * 0.9, 0.5 * a, 1);
    glyphs.draw(ctx, '木', x, y, GLYPH_BASE * BS * 0.9, INK.light, 0.6 * a);
    const press = u > 0.12 && u < 0.78 ? 1 : 0.85;
    ctx.save();
    ctx.translate(x + 6, y + 10);
    ctx.rotate(-0.35);
    ctx.scale(press, press);
    ctx.globalAlpha = 0.92 * a;
    ctx.fillStyle = '#FBF8F1';
    ctx.strokeStyle = INK.ink2;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    const hand = handPath();
    ctx.fill(hand);
    ctx.stroke(hand);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 调试快照（§9.1） */
  snapshot(): unknown {
    if (!this.game) return null;
    const s = this.s;
    return {
      level: this.mode === 'level' ? this.def.id : 0,
      mode: this.mode,
      ink: s.ink,
      score: s.score,
      status: s.status,
      stage: s.stage,
      orders: s.orders.map((o: Order) => ({ char: o.ch, done: false, hint: o.hint, slot: o.slot })),
      queue: [...s.queue],
      rack: [...s.rack],
      board: s.board.map((t) => (t ? { char: t.ch, kind: t.kind, ...(t.parts ? { parts: [...t.parts] } : {}) } : null)),
      undoLeft: s.undoLeft,
      canUndo: this.game.canUndo(),
      atlasCount: save.atlas.size,
      paused: this.paused,
      cardOpen: this.cardOpen,
      busy: this.fx.busy(),
      tutorialStep: this.tut ? this.tut.step : 0,
      over: this.over,
      resultShown: this.resultShown,
    };
  }

  // 调试辅助
  debugWin(): void {
    if (!this.game || this.over) return;
    const s = this.s;
    s.status = 'won';
    s.queue = [];
    s.orders = [];
    this.consume([{ t: 'won', inkLeft: s.ink, bonus: 0, stars: starsOf(s) }], { t: 'undo' }, '');
  }
  debugLose(): void {
    if (!this.game || this.over) return;
    this.s.status = 'lost';
    this.consume([{ t: 'lost' }], { t: 'undo' }, '');
  }

  chapterName(): string {
    return CHAPTER_NAMES[this.def.chapter - 1] ?? '';
  }
}

export const ZONES: Zone[] = ['left', 'right', 'top', 'bottom', 'center'];

export function cx(i: number): number {
  return LAYOUT.boardX + (i % CONFIG.board.cols) * (LAYOUT.cell + LAYOUT.gap) + LAYOUT.cell / 2;
}
export function cy(i: number): number {
  return LAYOUT.boardY + Math.floor(i / CONFIG.board.cols) * (LAYOUT.cell + LAYOUT.gap) + LAYOUT.cell / 2;
}

/** 落点格：格子外扩半个间距 */
export function cellAt(x: number, y: number): number {
  const step = LAYOUT.cell + LAYOUT.gap;
  const c = Math.floor((x - LAYOUT.boardX + LAYOUT.gap / 2) / step);
  const r = Math.floor((y - LAYOUT.boardY + LAYOUT.gap / 2) / step);
  if (c < 0 || r < 0 || c >= CONFIG.board.cols || r >= CONFIG.board.rows) return -1;
  return r * CONFIG.board.cols + c;
}

/** 方位：拖拽物中心相对目标格中心（§3.5） */
export function zoneAt(x: number, y: number, cell: number): Zone {
  const dx = x - cx(cell);
  const dy = y - cy(cell);
  if (Math.hypot(dx, dy) < LAYOUT.cell * CONFIG.input.centerZone) return 'center';
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

function arrowOf(z: Zone): string {
  return z === 'top' ? 'up' : z === 'bottom' ? 'down' : z === 'left' ? 'left' : z === 'right' ? 'right' : '';
}

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

