// Premultiplied-alpha quad batcher. One blend mode (ONE, ONE_MINUS_SRC_ALPHA) for normal + additive:
// vertex alpha 1 = normal, 0 = additive, in between = soft-additive (docs §2.3).
// Vertex: pos 2f + uv 2f + color 4ub = 20 bytes. Static index buffer, bufferSubData of the used range only.
import type { GLContext } from './gl';
import type { Frame } from './atlas';

const MAX_QUADS = 8192;
const FLOATS_PER_VERT = 5;
const BYTES_PER_QUAD = 4 * FLOATS_PER_VERT * 4;

const VS = `
attribute vec2 aPos;
attribute vec2 aUv;
attribute vec4 aCol;
uniform vec4 uM;
uniform vec2 uT;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = aUv;
  vCol = aCol;
  gl_Position = vec4(uM.x * aPos.x + uM.z * aPos.y + uT.x, uM.y * aPos.x + uM.w * aPos.y + uT.y, 0.0, 1.0);
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  gl_FragColor = texture2D(uTex, vUv) * vCol;
}`;

/** pack a 0xRRGGBB color with intensity `a` (0..1) and additive factor `add` (0 normal .. 1 additive) */
export function col(hex: number, a = 1, add = 0): number {
  if (a <= 0) return 0;
  if (a > 1) a = 1;
  const r = ((hex >> 16) & 255) * a;
  const g = ((hex >> 8) & 255) * a;
  const b = (hex & 255) * a;
  const al = 255 * a * (1 - add);
  return ((r | 0) | ((g | 0) << 8) | ((b | 0) << 16) | ((al | 0) << 24)) >>> 0;
}

/** linear mix of two 0xRRGGBB colors */
export function mixHex(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t;
  const g = ag + (((b >> 8) & 255) - ag) * t;
  const bb = ab + ((b & 255) - ab) * t;
  return ((r | 0) << 16) | ((g | 0) << 8) | (bb | 0);
}

export class Batcher {
  private prog!: WebGLProgram;
  private vbo!: WebGLBuffer;
  private ibo!: WebGLBuffer;
  private uM!: WebGLUniformLocation | null;
  private uT!: WebGLUniformLocation | null;
  private uTex!: WebGLUniformLocation | null;
  private readonly buf = new ArrayBuffer(MAX_QUADS * BYTES_PER_QUAD);
  private readonly f32 = new Float32Array(this.buf);
  private readonly u32 = new Uint32Array(this.buf);
  private n = 0;
  private tex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  // matrix world → clip
  m0 = 1;
  m1 = 0;
  m2 = 0;
  m3 = 1;
  tx = 0;
  ty = 0;
  drawCalls = 0;
  quads = 0;

  constructor(private ctx: GLContext) {
    ctx.managed(() => this.init());
  }

  private init(): void {
    const gl = this.ctx.gl;
    this.prog = this.ctx.compile(VS, FS);
    this.uM = gl.getUniformLocation(this.prog, 'uM');
    this.uT = gl.getUniformLocation(this.prog, 'uT');
    this.uTex = gl.getUniformLocation(this.prog, 'uTex');
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.buf.byteLength, gl.DYNAMIC_DRAW);
    const idx = new Uint16Array(MAX_QUADS * 6);
    for (let i = 0, v = 0; i < idx.length; i += 6, v += 4) {
      idx[i] = v;
      idx[i + 1] = v + 1;
      idx[i + 2] = v + 2;
      idx[i + 3] = v;
      idx[i + 4] = v + 2;
      idx[i + 5] = v + 3;
    }
    this.ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.vao = null;
    if (this.ctx.info.webgl2) {
      const g2 = gl as WebGL2RenderingContext;
      this.vao = g2.createVertexArray();
      g2.bindVertexArray(this.vao);
      this.setupAttribs();
      g2.bindVertexArray(null);
    }
  }

  private setupAttribs(): void {
    const gl = this.ctx.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, stride, 16);
  }

  /** set the world→clip transform; flushes pending quads */
  setMatrix(m0: number, m1: number, m2: number, m3: number, tx: number, ty: number): void {
    if (this.n > 0) this.flush();
    this.m0 = m0;
    this.m1 = m1;
    this.m2 = m2;
    this.m3 = m3;
    this.tx = tx;
    this.ty = ty;
  }

  setTexture(t: WebGLTexture): void {
    if (t === this.tex) return;
    if (this.n > 0) this.flush();
    this.tex = t;
  }

  resetStats(): void {
    this.drawCalls = 0;
    this.quads = 0;
  }

  flush(): void {
    if (this.n === 0 || this.ctx.lost) {
      this.n = 0;
      return;
    }
    const gl = this.ctx.gl;
    gl.useProgram(this.prog);
    if (this.vao) (gl as WebGL2RenderingContext).bindVertexArray(this.vao);
    else this.setupAttribs();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.f32, 0, this.n * 4 * FLOATS_PER_VERT);
    gl.uniform4f(this.uM, this.m0, this.m1, this.m2, this.m3);
    gl.uniform2f(this.uT, this.tx, this.ty);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uTex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, this.n * 6, gl.UNSIGNED_SHORT, 0);
    if (this.vao) (gl as WebGL2RenderingContext).bindVertexArray(null);
    this.drawCalls++;
    this.quads += this.n;
    this.n = 0;
  }

  /** raw quad, vertices in order TL, TR, BR, BL */
  quad(
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
    u0: number, v0: number, u1: number, v1: number, c: number,
  ): void {
    if (this.n >= MAX_QUADS) this.flush();
    const f = this.f32;
    const u = this.u32;
    let o = this.n * 20;
    f[o] = x0; f[o + 1] = y0; f[o + 2] = u0; f[o + 3] = v0; u[o + 4] = c; o += 5;
    f[o] = x1; f[o + 1] = y1; f[o + 2] = u1; f[o + 3] = v0; u[o + 4] = c; o += 5;
    f[o] = x2; f[o + 1] = y2; f[o + 2] = u1; f[o + 3] = v1; u[o + 4] = c; o += 5;
    f[o] = x3; f[o + 1] = y3; f[o + 2] = u0; f[o + 3] = v1; u[o + 4] = c;
    this.n++;
  }

  /** quad with per-vertex colours and explicit uvs (trail strips) */
  quad4(
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
    u0: number, v0: number, u1: number, v1: number, c0: number, c1: number, c2: number, c3: number,
  ): void {
    if (this.n >= MAX_QUADS) this.flush();
    const f = this.f32;
    const u = this.u32;
    let o = this.n * 20;
    f[o] = x0; f[o + 1] = y0; f[o + 2] = u0; f[o + 3] = v0; u[o + 4] = c0; o += 5;
    f[o] = x1; f[o + 1] = y1; f[o + 2] = u1; f[o + 3] = v0; u[o + 4] = c1; o += 5;
    f[o] = x2; f[o + 1] = y2; f[o + 2] = u1; f[o + 3] = v1; u[o + 4] = c2; o += 5;
    f[o] = x3; f[o + 1] = y3; f[o + 2] = u0; f[o + 3] = v1; u[o + 4] = c3;
    this.n++;
  }

  /** sprite centred at (x, y) drawn at frame size × (sx, sy), rotated by rot radians */
  sprite(fr: Frame, x: number, y: number, sx: number, sy: number, rot: number, c: number): void {
    if (c === 0) return;
    const hw = fr.w * 0.5 * sx;
    const hh = fr.h * 0.5 * sy;
    if (rot === 0) {
      this.quad(x - hw, y - hh, x + hw, y - hh, x + hw, y + hh, x - hw, y + hh, fr.u0, fr.v0, fr.u1, fr.v1, c);
      return;
    }
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const ax = cs * hw;
    const ay = sn * hw;
    const bx = -sn * hh;
    const by = cs * hh;
    this.quad(
      x - ax - bx, y - ay - by,
      x + ax - bx, y + ay - by,
      x + ax + bx, y + ay + by,
      x - ax + bx, y - ay + by,
      fr.u0, fr.v0, fr.u1, fr.v1, c,
    );
  }

  /** sprite sized by the frame's reference unit (radius / half height) */
  spriteR(fr: Frame, x: number, y: number, r: number, rot: number, c: number): void {
    const s = r / fr.unit;
    this.sprite(fr, x, y, s, s, rot, c);
  }

  /** stretch a frame into an axis-aligned rect (world units) */
  rect(fr: Frame, x: number, y: number, w: number, h: number, c: number): void {
    if (c === 0) return;
    this.quad(x, y, x + w, y, x + w, y + h, x, y + h, fr.u0, fr.v0, fr.u1, fr.v1, c);
  }

  /** a thick line segment textured by a frame (u across, v along) */
  line(fr: Frame, x0: number, y0: number, x1: number, y1: number, w: number, c: number): void {
    if (c === 0) return;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-4) return;
    const nx = (-dy / len) * w * 0.5;
    const ny = (dx / len) * w * 0.5;
    this.quad(x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny, fr.u0, fr.v0, fr.u1, fr.v1, c);
  }
}
