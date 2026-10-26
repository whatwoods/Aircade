// Fullscreen background shader: gradient, drifting nebula, twinkling stars, synthwave perspective grid that
// scrolls one cell per advance, boss tint, darkened playfield, and desktop side decoration (docs §4.4, §6.10).
import type { GLContext } from './gl';

const FS = `
precision highp float;
varying vec2 vS;
uniform vec2 uRes;
uniform vec3 uMap;      // world left px, world top px, px per unit
uniform float uTime;
uniform float uGrid;    // grid scroll in cells
uniform float uBoss;    // 0..1 boss tint
uniform float uField;   // 0..1 playfield darkening
uniform float uSides;   // 0..1 side decoration
uniform float uHorizon; // world y of the vanishing line
uniform float uGridAmt; // grid visibility
uniform sampler2D uNeb;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 px = vec2(vS.x * uRes.x, (1.0 - vS.y) * uRes.y);
  vec2 w = (px - uMap.xy) / uMap.z;
  float ppu = uMap.z;
  // 1. vertical gradient
  float gy = clamp(w.y / 844.0, -0.2, 1.2);
  vec3 cVoid = vec3(0.020, 0.012, 0.043);
  vec3 cDeep = mix(vec3(0.047, 0.027, 0.125), vec3(0.102, 0.027, 0.086), uBoss);
  vec3 cViol = mix(vec3(0.106, 0.059, 0.227), vec3(0.165, 0.039, 0.133), uBoss);
  vec3 col = gy < 0.5 ? mix(cVoid, cDeep, smoothstep(0.0, 0.5, gy)) : mix(cDeep, cViol, smoothstep(0.5, 1.0, gy));
  // 2. nebula
  vec2 nuv = vec2(w.x / 520.0 + uTime * 0.004, w.y / 900.0 - uTime * 0.0025);
  vec4 nb = texture2D(uNeb, nuv);
  vec3 neb = nb.r * mix(vec3(1.0, 0.18, 0.82), vec3(1.0, 0.2, 0.3), uBoss) + nb.g * vec3(0.30, 0.22, 1.0);
  col += neb * 0.12;
  // 3. stars (above the horizon)
  vec2 cell = floor(w / 26.0);
  float h = hash(cell);
  if (h > 0.84 && w.y < uHorizon - 8.0) {
    vec2 sp = (cell + vec2(hash(cell + 3.1), hash(cell + 7.7))) * 26.0;
    float d = length(w - sp) * ppu;
    float tw = 0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    float sz = 0.6 + 1.2 * fract(h * 13.0);
    col += vec3(0.85, 0.82, 1.0) * smoothstep(sz + 1.0, 0.0, d) * tw * 0.75;
  }
  // 4. perspective grid floor
  float dy = w.y - uHorizon;
  if (dy > 0.5) {
    float K = 900.0;
    float v = K / dy + uGrid;
    float dv = K / (dy * dy) / ppu;               // v per pixel
    float lv = abs(fract(v) - 0.5);
    float hLine = 1.0 - smoothstep(0.0, 1.2, (0.5 - lv) / max(dv, 1e-4));
    float u = (w.x - 195.0) / dy * 2.2;
    float du = 2.2 / dy / ppu;
    float lu = abs(fract(u) - 0.5);
    float vLine = 1.0 - smoothstep(0.0, 1.1, (0.5 - lu) / max(du, 1e-4));
    float fade = smoothstep(0.0, 70.0, dy);
    vec3 gcol = mix(vec3(0.227, 0.141, 0.439), vec3(0.42, 0.06, 0.16), uBoss);
    float g = max(hLine, vLine) * fade * uGridAmt;
    col += gcol * g * 0.9;
    // horizon glow
    col += gcol * exp(-dy * 0.06) * 0.35 * uGridAmt;
  } else {
    col += mix(vec3(0.227, 0.141, 0.439), vec3(0.42, 0.06, 0.16), uBoss) * exp(dy * 0.08) * 0.22 * uGridAmt;
  }
  // 5. playfield darkening (void 35%)
  float inField = step(8.0, w.x) * step(w.x, 382.0) * step(68.0, w.y) * step(w.y, 792.0);
  col = mix(col, cVoid, 0.35 * inField * uField);
  // desktop side decoration: neon pillars 12px outside the column + falling data glyphs
  if (uSides > 0.0) {
    float dl = abs(px.x - (uMap.x - 14.0));
    float dr = abs(px.x - (uMap.x + 390.0 * ppu + 14.0));
    float pulse = 0.6 + 0.4 * sin(uTime * 1.3 + w.y * 0.01);
    vec3 pc = mix(vec3(0.55, 0.36, 1.0), vec3(1.0, 0.2, 0.33), uBoss);
    float pil = exp(-dl * 0.35) + exp(-dr * 0.35);
    float outside = 1.0 - step(uMap.x - 4.0, px.x) * step(px.x, uMap.x + 390.0 * ppu + 4.0);
    col += pc * pil * pulse * 0.55 * uSides * outside;
    // data columns
    float colW = 14.0;
    float ci = floor(px.x / colW);
    float speed = 18.0 + hash(vec2(ci, 1.0)) * 30.0;
    float yy = px.y + uTime * speed + hash(vec2(ci, 2.0)) * 900.0;
    float ri = floor(yy / 18.0);
    vec2 cp = vec2(fract(px.x / colW), fract(yy / 18.0));
    vec2 bit = floor(cp * vec2(4.0, 6.0));
    float on = step(0.5, hash(vec2(ci * 7.0 + bit.x, ri * 13.0 + bit.y)));
    float inGlyph = step(0.5, bit.x) * step(bit.x, 2.5) * step(0.5, bit.y) * step(bit.y, 4.5);
    float trail = fract(-ri * 0.07 + hash(vec2(ci, 5.0)));
    float act = step(0.6, hash(vec2(ci, 9.0)));
    float sideMask = outside * smoothstep(30.0, 90.0, min(abs(px.x - uMap.x), abs(px.x - uMap.x - 390.0 * ppu)));
    col += vec3(0.55, 0.45, 1.0) * on * inGlyph * trail * act * 0.08 * uSides * sideMask;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const VS = `
attribute vec2 aPos;
uniform float uFlip;
varying vec2 vS;
void main() {
  vS = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos.x, aPos.y * uFlip, 0.0, 1.0);
}`;

export class Background {
  private prog!: WebGLProgram;
  private tri!: WebGLBuffer;
  private neb!: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private nebCanvas: HTMLCanvasElement;
  grid = 0;
  gridTarget = 0;
  boss = 0;
  bossTarget = 0;
  field = 1;
  sides = 0;
  gridAmt = 1;
  horizon = 560;

  constructor(private ctx: GLContext) {
    this.nebCanvas = makeNebula();
    ctx.managed(() => this.init());
  }

  private init(): void {
    const gl = this.ctx.gl;
    this.prog = this.ctx.compile(VS, FS);
    for (const n of ['uFlip', 'uRes', 'uMap', 'uTime', 'uGrid', 'uBoss', 'uField', 'uSides', 'uHorizon', 'uGridAmt', 'uNeb']) {
      this.u[n] = gl.getUniformLocation(this.prog, n);
    }
    this.tri = fullscreenTriangle(gl);
    this.neb = this.ctx.texture(this.nebCanvas, 256, 512, true, true);
  }

  update(dt: number): void {
    this.grid += (this.gridTarget - this.grid) * (1 - Math.exp(-10 * dt));
    this.boss += (this.bossTarget - this.boss) * Math.min(1, dt / 1.0 * 3);
  }

  draw(time: number, mapL: number, mapT: number, ppu: number): void {
    const gl = this.ctx.gl;
    gl.useProgram(this.prog);
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.neb);
    const u = this.u;
    gl.uniform1i(u.uNeb!, 0);
    gl.uniform1f(u.uFlip!, this.flip);
    gl.uniform2f(u.uRes!, this.w, this.h);
    gl.uniform3f(u.uMap!, mapL, mapT, ppu);
    gl.uniform1f(u.uTime!, time);
    gl.uniform1f(u.uGrid!, this.grid);
    gl.uniform1f(u.uBoss!, this.boss);
    gl.uniform1f(u.uField!, this.field);
    gl.uniform1f(u.uSides!, this.sides);
    gl.uniform1f(u.uHorizon!, this.horizon);
    gl.uniform1f(u.uGridAmt!, this.gridAmt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  flip = 1;
  w = 1;
  h = 1;
}

export function fullscreenTriangle(gl: WebGLRenderingContext | WebGL2RenderingContext): WebGLBuffer {
  const b = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return b;
}

/** 256×512 tileable value-noise fbm: R = magenta cloud, G = indigo cloud (baked once) */
function makeNebula(): HTMLCanvasElement {
  const W = 256;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const cx = c.getContext('2d')!;
  const img = cx.createImageData(W, H);
  const lattice = (seed: number, gw: number, gh: number): Float32Array => {
    const a = new Float32Array(gw * gh);
    let s = seed;
    for (let i = 0; i < a.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      a[i] = s / 4294967296;
    }
    return a;
  };
  const octave = (lat: Float32Array, gw: number, gh: number, x: number, y: number): number => {
    const fx = (x / W) * gw;
    const fy = (y / H) * gh;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const g = (ix: number, iy: number): number => lat[((iy % gh) + gh) % gh * gw + (((ix % gw) + gw) % gw)]!;
    const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx;
    const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
  const layers: [number, number, Float32Array][] = [];
  for (let o = 0; o < 4; o++) {
    const gw = 4 << o;
    const gh = 8 << o;
    layers.push([gw, gh, lattice(97 + o * 31, gw, gh)]);
  }
  const layers2: [number, number, Float32Array][] = [];
  for (let o = 0; o < 4; o++) {
    const gw = 3 << o;
    const gh = 6 << o;
    layers2.push([gw, gh, lattice(531 + o * 17, gw, gh)]);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n1 = 0;
      let n2 = 0;
      let amp = 0.5;
      for (let o = 0; o < 4; o++) {
        const l1 = layers[o]!;
        const l2 = layers2[o]!;
        n1 += octave(l1[2], l1[0], l1[1], x, y) * amp;
        n2 += octave(l2[2], l2[0], l2[1], x, y) * amp;
        amp *= 0.5;
      }
      const r = Math.max(0, n1 - 0.45) * 2.6;
      const g = Math.max(0, n2 - 0.42) * 2.3;
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, r * r * 255);
      img.data[i + 1] = Math.min(255, g * g * 255);
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}
