/** 瞄准射线与弹丸（docs §2.3 / §3.3）。预测和真实命中共用 hitTest。 */
import { CONFIG } from '../config.ts';
import type { Chain } from './chain.ts';

export const TOTEM_R = 40;
export const MUZZLE = 46;

export interface Hit {
  /** 命中珠 id，-1 = 撞石桥，-2 = 无 */
  id: number;
  index: number;
  side: 0 | 1;
  /** 弹丸中心在接触瞬间的位置 */
  x: number;
  y: number;
  /** 沿射线的距离 */
  t: number;
  /** 被击中的珠子位置 */
  bx: number;
  by: number;
}

const tmp = { x: 0, y: 0 };

/** 插入侧：命中点相对珠心在轨道切线（指向链头）上的投影 */
export function sideOf(chain: Chain, s: number, bx: number, by: number, px: number, py: number): 0 | 1 {
  const a = chain.track.angleAt(s);
  const dot = (px - bx) * Math.cos(a) + (py - by) * Math.sin(a);
  return dot > 0 ? 0 : 1;
}

/** 射线与链条求交。返回值写入 out，命中返回 true */
export function raycastChain(chain: Chain, ox: number, oy: number, angle: number, out: Hit, maxT = 1400): boolean {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const R = CONFIG.ball.D * CONFIG.shot.hitRadiusK;
  const R2 = R * R;
  let best = maxT;
  let bi = -1;
  const balls = chain.balls;
  const track = chain.track;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i]!;
    if (!track.hittable(b.s)) continue;
    const p = track.posAt(b.s, tmp);
    const fx = p.x - ox, fy = p.y - oy;
    const proj = fx * dx + fy * dy;
    if (proj < 0) continue;
    const perp2 = fx * fx + fy * fy - proj * proj;
    if (perp2 > R2) continue;
    const t = proj - Math.sqrt(R2 - perp2);
    if (t < best && t > 0) {
      best = t;
      bi = i;
    }
  }
  // 石桥
  const bc = track.bridgeCircles;
  let bridgeT = Infinity;
  for (let k = 0; k < bc.length; k += 3) {
    const fx = bc[k]! - ox, fy = bc[k + 1]! - oy, r = bc[k + 2]! + CONFIG.ball.D / 2;
    const proj = fx * dx + fy * dy;
    if (proj < 0) continue;
    const perp2 = fx * fx + fy * fy - proj * proj;
    if (perp2 > r * r) continue;
    const t = proj - Math.sqrt(r * r - perp2);
    if (t < bridgeT) bridgeT = t;
  }
  if (bridgeT < best) {
    out.id = -1;
    out.index = -1;
    out.t = bridgeT;
    out.x = ox + dx * bridgeT;
    out.y = oy + dy * bridgeT;
    return false;
  }
  if (bi < 0) {
    out.id = -2;
    out.index = -1;
    out.t = maxT;
    out.x = ox + dx * maxT;
    out.y = oy + dy * maxT;
    return false;
  }
  const b = balls[bi]!;
  const p = track.posAt(b.s, tmp);
  out.id = b.id;
  out.index = bi;
  out.t = best;
  out.x = ox + dx * best;
  out.y = oy + dy * best;
  out.bx = p.x;
  out.by = p.y;
  out.side = sideOf(chain, b.s, p.x, p.y, out.x, out.y);
  return true;
}

export interface Projectile {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  level: number;
  wild: boolean;
  lockId: number;
  lockSide: 0 | 1;
  cid: number;
  age: number;
}
