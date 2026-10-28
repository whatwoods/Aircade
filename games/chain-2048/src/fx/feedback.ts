/** 把游戏事件映射成反馈档位（docs §5.1 / §5.2）：震动、hitstop、镜头、粒子、跳字、音效、HUD。 */
import { CONFIG } from '../config';
import { settings } from '../core/storage';
import type { Loop } from '../core/loop';
import type { Session } from '../game/session';
import * as sfx from '../audio/sfx';
import { music } from '../audio/music';
import type { Renderer } from '../render/renderer';
import { levelStyle } from '../render/palette';
import { gateCenter } from '../render/scene';
import type { Hud } from '../ui/hud';

const ROMAN = ['I', 'II', 'III', 'IV'];
/** HUD 金印徽章中心（逻辑坐标） */
const BADGE = { x: 350, y: 38 };
const WILD_SLOT = { x: 346, y: 800 };

export class Feedback {
  private s: Session;
  private r: Renderer;
  private loop: Loop;
  private hud: Hud;
  private lastArrived = 0;
  private beatT = 0;
  private lastMerge = { x: 195, y: 400 };
  private cashN = 0;
  private swallowN = 0;
  private pos = { x: 0, y: 0 };
  private gate = { x: 0, y: 0 };
  /** 当前瞄准的可合成目标（用于「叮」去重） */
  lastAimMatch = -1;
  /** 由 app 设置：结算/小结等 */
  onStageClear: ((e: { stage: number; stageScore: number; clearBonus: number; cashBonus: number; longest: number }) => void) | null = null;
  onRunOver: (() => void) | null = null;
  onLifeLost: (() => void) | null = null;
  onTip: ((id: number) => void) | null = null;

  constructor(s: Session, r: Renderer, loop: Loop, hud: Hud) {
    this.s = s;
    this.r = r;
    this.loop = loop;
    this.hud = hud;
    this.applyShake();
    this.wire();
  }

  applyShake(): void {
    this.r.shakeMul = [0, 0.5, 1][settings.shake] ?? 1;
  }

  private at(sv: number): { x: number; y: number } {
    return this.s.track.posAt(sv, this.pos);
  }

  private tier(t: 'light' | 'mid' | 'heavy'): void {
    const F = CONFIG.fx;
    this.r.addTrauma(F.trauma[t]);
    if (t === 'mid') this.loop.addHitstop(F.hitstop.mid);
    if (t === 'heavy') this.loop.addHitstop(F.hitstop.heavy);
  }

  private wire(): void {
    const b = this.s.bus;
    const r = this.r;
    b.on('stageStart', (e) => {
      r.setTrack(this.s.track);
      r.popups.clear();
      r.popups.setTotem(this.s.totemX, this.s.totemY);
      r.gateDrop = 0;
      this.gate = gateCenter(this.s.track);
      const temple = Math.min(3, Math.floor((e.stage - 1) / 3));
      sfx.setTemple(e.stage > 12 ? (e.stage - 13) % 4 : temple);
      this.hud.setStage(e.stage);
      this.hud.setSeal(e.cfg.sealLevel, 0, e.cfg.quota);
      this.hud.setLives(this.s.lives, CONFIG.run.lives);
      this.cashN = 0;
      this.swallowN = 0;
      const name = e.stage > 12 ? `无尽 · 第 ${e.stage} 关` : `神殿 ${ROMAN[temple]} · 第 ${e.stage} 关`;
      if (e.retry) this.hud.banner('再试一次', `金印 <b>${2 ** e.cfg.sealLevel}</b> × ${e.cfg.quota}`, 1.2);
      else this.hud.banner(name, `金印 <b>${2 ** e.cfg.sealLevel}</b> × ${e.cfg.quota}`, 1.4);
      sfx.drum(0.3);
      sfx.grind();
    });
    b.on('fired', (e) => {
      r.recoilKick();
      r.loadT = 0;
      sfx.whoosh(false);
      void e;
    });
    b.on('inserted', (e) => {
      const p = this.at(e.ball.s);
      if (!e.merge) {
        sfx.thud(0.22);
        r.particles.shards(p.x, p.y, '#B9B192', 4, 90);
      } else sfx.stoneTap(0.18);
    });
    b.on('merged', (e) => {
      const p = this.at(e.ball.s);
      this.lastMerge.x = p.x;
      this.lastMerge.y = p.y;
      const st = levelStyle(e.level);
      for (const fs of e.fromS) r.ghost(e.level - (e.triple ? 2 : 1), fs, e.ball.id);
      r.particles.shards(p.x, p.y, st.shard, e.triple ? 14 : 6 + Math.min(4, e.step), 150);
      r.particles.sparks(p.x, p.y, '#fff', 4, 80, 0.3);
      sfx.chime(e.step, e.level);
      if (e.triple) {
        sfx.chime(e.step + 2, e.level, 0.2);
        r.tag(`三合一 ×4`, p.x, p.y - 40, '#FFE7A3', 17);
        this.onTip?.(2);
      }
      if (e.step >= 3 || e.triple) {
        this.tier('mid');
        r.particles.ring(p.x, p.y, 50, 0.4, 'rgba(255,231,163,0.9)');
        r.zoomPulse(1 + Math.min(0.04, 0.01 * (e.step - 2)), p.x, p.y);
      } else r.addTrauma(e.step >= 2 ? 0.06 : 0);
      if (e.step >= 3) r.bumpBadge(e.step);
    });
    b.on('sealStart', (e) => {
      const p = this.at(e.ball.s);
      this.tier('heavy');
      r.zoomPulse(1.04, p.x, p.y);
      r.flashRgb = '255,240,200';
      r.flash = 0.6;
      sfx.gong(e.ball.level >= 11);
      if (e.ball.level >= 11) this.hud.banner('2048!', '', 1.2, true, true);
    });
    b.on('sealed', (e) => {
      const p = this.at(e.s);
      r.particles.gold(p.x, p.y, BADGE.x, BADGE.y, 40);
      r.particles.ring(p.x, p.y, 520, 0.7, 'rgba(255,215,120,0.85)');
      r.particles.sparks(p.x, p.y, '#FFE7A3', 20, 220, 0.6);
      r.freezeGlow = CONFIG.seal.freeze;
      sfx.freezeHum(CONFIG.seal.freeze);
      sfx.arpeggio(true, 4, 0.06, 0.08);
    });
    b.on('joined', (e) => {
      if (!e.attract) return;
      const p = this.at(e.s);
      r.particles.sparks(p.x, p.y, '#FFE7A3', 10, 120, 0.3);
      sfx.suck();
      sfx.stoneTap(0.2);
      this.onTip?.(5);
    });
    b.on('swallowed', (e) => {
      const p = this.at(Math.min(this.s.track.length, e.ball.s));
      r.particles.sparks(p.x, p.y, '#E2463A', 3, 60, 0.3);
      if (this.swallowN++ % 3 === 0) sfx.thud(0.15);
    });
    b.on('cashed', () => {
      const g = this.gate;
      r.particles.sparks(g.x, g.y, '#FFE7A3', 2, 50, 0.3);
      r.popups.add(-1, CONFIG.score.retreatPerBall * this.s.stage, g.x, g.y + 30, 'bonus');
      sfx.cashTick(this.cashN++);
    });
    b.on('reroll', (e) => {
      r.rerollT = 0;
      r.rerollWhich = e.which;
      sfx.flip();
    });
    b.on('swapped', () => {
      r.swapT = 0;
      sfx.jadeClink();
    });
    b.on('armed', (e) => {
      if (e.on) sfx.hum();
      else sfx.tick();
    });
    b.on('wildEarned', () => {
      r.particles.gold(this.lastMerge.x, this.lastMerge.y, WILD_SLOT.x, WILD_SLOT.y, 18, '#7CF0B4');
      r.tag('获得翡翠灵珠', 195, 700, '#A8E6C8', 15);
      sfx.arpeggio(true, 6, 0.05, 0.1);
      this.tier('mid');
      this.onTip?.(3);
    });
    b.on('wildBonus', (e) => {
      r.tag(`灵珠满 +${e.pts}`, 195, 700, '#A8E6C8', 15);
    });
    b.on('score', (e) => {
      if (e.kind === 'merge' || e.kind === 'seal') {
        const p = this.at(e.s);
        r.popups.add(e.cid, e.pts, p.x, p.y, e.kind);
      }
    });
    b.on('streak', (e) => this.hud.setStreak(e.n, e.mul, e.broken));
    b.on('sealCount', (e) => this.hud.setSeal(this.s.cfg.sealLevel, e.seals, e.quota));
    b.on('quotaReached', () => {
      this.loop.slowmo(0.35, 0.4, 0.3);
      this.hud.banner('封印完成', '', 1.2);
      sfx.gong(true);
      this.tier('heavy');
      r.gateDrop = 1;
      r.particles.dust(this.gate.x, this.gate.y, 14);
    });
    b.on('stageClear', (e) => {
      sfx.drum(0.25);
      this.onStageClear?.(e);
    });
    b.on('failStart', () => {
      sfx.swallow();
      this.tier('heavy');
      r.flashRgb = '226,70,58';
      r.flash = 1;
    });
    b.on('lifeLost', (e) => {
      this.hud.shatterPei(e.lives);
      this.hud.setLives(e.lives, CONFIG.run.lives);
      sfx.shatter();
      this.tier('heavy');
      this.onLifeLost?.();
    });
    b.on('runOver', () => {
      sfx.chordDown();
      this.onRunOver?.();
    });
    b.on('emptyBonus', (e) => {
      r.tag(`清空链条 +${e.pts}`, 195, 380, '#FFE7A3', 18);
    });
    b.on('danger', (e) => {
      if (e.level >= 1) this.onTip?.(4);
      this.beatT = 0;
    });
    b.on('miss', (e) => {
      if (e.bridge) {
        r.particles.shards(e.p.x, e.p.y, '#B9B192', 8, 120);
        sfx.crumble();
      } else {
        r.particles.sparks(Math.max(4, Math.min(386, e.p.x)), Math.max(100, Math.min(750, e.p.y)), '#F7EFD8', 5, 40, 0.2);
        sfx.whoosh(true);
      }
    });
  }

  /** 每帧（真实时间） */
  update(dt: number): void {
    const s = this.s;
    // 金粉到达徽章
    const a = this.r.particles.arrived;
    if (a - this.lastArrived >= 8) {
      this.lastArrived = a;
      this.hud.flashQuota();
    } else if (a < this.lastArrived) this.lastArrived = a;
    // 心跳
    const lv = s.phase === 'live' ? s.dangerLevel : 0;
    if (lv > 0) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = lv >= 2 ? 0.7 : 1.0;
        sfx.heartbeat(lv >= 2);
      }
    }
    music.danger = s.phase === 'live' ? s.chain.headProgress() : 0;
  }
}
