// High tier: scene FBO → 1/4-res bright pass → separable blur → one composite pass (bloom, vignette, scanlines,
// chromatic aberration, flash, shockwave warp, desaturation, grain). Mid/low: a blended overlay pass that adds
// vignette / scanlines / flash without reading the scene (docs §2.3, §4.4).
import type { GLContext } from './gl';
import { fullscreenTriangle } from './background';

const VS = `
attribute vec2 aPos;
uniform float uFlip;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos.x, aPos.y * uFlip, 0.0, 1.0);
}`;

const BRIGHT_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float knee = 0.25;
  float t = 0.6;
  float soft = clamp(l - t + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, l - t) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const BLUR_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.2270270270;
  c += texture2D(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uBloomAmt;
uniform float uVig;
uniform vec3 uVigCol;
uniform float uScan;
uniform float uScanOff;
uniform float uCA;
uniform vec4 uFlash;
uniform vec4 uShock;   // centre uv.xy, radius (uv units of height), strength
uniform float uDesat;
uniform float uDim;
uniform float uGrain;
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  if (uShock.w > 0.0) {
    vec2 d = uv - uShock.xy;
    d.x *= aspect;
    float r = length(d);
    float band = r - uShock.z;
    float k = exp(-band * band * 900.0) * uShock.w;
    uv -= (d / max(r, 1e-4)) * vec2(1.0 / aspect, 1.0) * k * 0.025;
  }
  vec3 c;
  if (uCA > 0.0) {
    vec2 off = (uv - 0.5) * uCA / uRes.x * 2.0;
    c.r = texture2D(uScene, uv + off).r;
    c.g = texture2D(uScene, uv).g;
    c.b = texture2D(uScene, uv - off).b;
  } else {
    c = texture2D(uScene, uv).rgb;
  }
  c += texture2D(uBloom, uv).rgb * uBloomAmt;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(l), uDesat);
  c *= 1.0 - uDim;
  // vignette
  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float v = smoothstep(0.35, 1.05, length(q) * 1.25);
  c = mix(c, uVigCol * l * 0.6 + uVigCol * 0.08 * step(0.001, uVigCol.r), v * uVig);
  // scanlines every 3 physical px
  float sl = mod(gl_FragCoord.y + uScanOff, 3.0);
  c *= 1.0 - uScan * step(2.0, sl);
  // flash
  c = mix(c, uFlash.rgb, uFlash.a);
  // grain
  c += (hash(vUv * uRes + uTime) - 0.5) * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;

const OVERLAY_FS = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uVig;
uniform vec3 uVigCol;
uniform float uScan;
uniform float uScanOff;
uniform vec4 uFlash;
uniform float uDim;
void main() {
  float aspect = uRes.x / uRes.y;
  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float v = smoothstep(0.35, 1.05, length(q) * 1.25) * uVig;
  float sl = mod(gl_FragCoord.y + uScanOff, 3.0);
  float s = uScan * step(2.0, sl);
  float dark = 1.0 - (1.0 - v) * (1.0 - s) * (1.0 - uDim);
  // premultiplied: darkening is alpha over black (+ tint), flash is additive on top
  vec3 tint = uVigCol * v * 0.18;
  gl_FragColor = vec4(tint + uFlash.rgb * uFlash.a, dark);
}`;

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class Post {
  enabled = false;
  private tri!: WebGLBuffer;
  private pBright!: WebGLProgram;
  private pBlur!: WebGLProgram;
  private pComp!: WebGLProgram;
  private pOver!: WebGLProgram;
  private uB: Record<string, WebGLUniformLocation | null> = {};
  private uBl: Record<string, WebGLUniformLocation | null> = {};
  private uC: Record<string, WebGLUniformLocation | null> = {};
  private uO: Record<string, WebGLUniformLocation | null> = {};
  private scene: Target | null = null;
  private bloomA: Target | null = null;
  private bloomB: Target | null = null;
  // parameters (set each frame by the app)
  bloom = 0.8;
  vig = 0.55;
  vigR = 0;
  vigG = 0;
  vigB = 0;
  scan = 0.06;
  scanOff = 0;
  ca = 0;
  flashR = 1;
  flashG = 1;
  flashB = 1;
  flashA = 0;
  shockX = 0.5;
  shockY = 0.5;
  shockR = 0;
  shockS = 0;
  desat = 0;
  dim = 0;
  grain = 0.02;
  time = 0;

  constructor(private ctx: GLContext) {
    ctx.managed(() => this.init());
  }

  private init(): void {
    const gl = this.ctx.gl;
    this.scene = this.bloomA = this.bloomB = null;
    this.tri = fullscreenTriangle(gl);
    this.pBright = this.ctx.compile(VS, BRIGHT_FS);
    this.pBlur = this.ctx.compile(VS, BLUR_FS);
    this.pComp = this.ctx.compile(VS, COMPOSITE_FS);
    this.pOver = this.ctx.compile(VS, OVERLAY_FS);
    const get = (p: WebGLProgram, names: string[], out: Record<string, WebGLUniformLocation | null>): void => {
      for (const n of names) out[n] = gl.getUniformLocation(p, n);
    };
    get(this.pBright, ['uFlip', 'uTex', 'uTexel'], this.uB);
    get(this.pBlur, ['uFlip', 'uTex', 'uDir'], this.uBl);
    get(this.pComp, ['uFlip', 'uScene', 'uBloom', 'uRes', 'uBloomAmt', 'uVig', 'uVigCol', 'uScan', 'uScanOff', 'uCA', 'uFlash', 'uShock', 'uDesat', 'uDim', 'uGrain', 'uTime'], this.uC);
    get(this.pOver, ['uFlip', 'uRes', 'uVig', 'uVigCol', 'uScan', 'uScanOff', 'uFlash', 'uDim'], this.uO);
  }

  private makeTarget(w: number, h: number, old: Target | null): Target {
    const gl = this.ctx.gl;
    if (old && old.w === w && old.h === h) return old;
    if (old) {
      gl.deleteFramebuffer(old.fb);
      gl.deleteTexture(old.tex);
    }
    const tex = this.ctx.texture(null, w, h, true);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }

  /** bind the target the world should render into; returns true when post is active */
  begin(): boolean {
    const gl = this.ctx.gl;
    const w = this.ctx.width;
    const h = this.ctx.height;
    if (!this.enabled) {
      this.ctx.bindScreen(0.02, 0.012, 0.043);
      return false;
    }
    this.scene = this.makeTarget(w, h, this.scene);
    const bw = Math.max(1, Math.floor(w / 4));
    const bh = Math.max(1, Math.floor(h / 4));
    this.bloomA = this.makeTarget(bw, bh, this.bloomA);
    this.bloomB = this.makeTarget(bw, bh, this.bloomB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, w, h);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0.02, 0.012, 0.043, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return true;
  }

  private bindTri(): void {
    const gl = this.ctx.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
  }

  /** finish the frame: composite (high) or overlay (mid/low) into the default framebuffer */
  end(flip: number): void {
    const gl = this.ctx.gl;
    this.bindTri();
    if (this.enabled && this.scene && this.bloomA && this.bloomB) {
      gl.disable(gl.BLEND);
      // bright pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fb);
      gl.viewport(0, 0, this.bloomA.w, this.bloomA.h);
      gl.useProgram(this.pBright);
      gl.uniform1f(this.uB.uFlip!, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      gl.uniform1i(this.uB.uTex!, 0);
      gl.uniform2f(this.uB.uTexel!, 1 / this.scene.w, 1 / this.scene.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // blur H
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.fb);
      gl.useProgram(this.pBlur);
      gl.uniform1f(this.uBl.uFlip!, 1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
      gl.uniform1i(this.uBl.uTex!, 0);
      gl.uniform2f(this.uBl.uDir!, 1 / this.bloomA.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // blur V
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fb);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
      gl.uniform2f(this.uBl.uDir!, 0, 1 / this.bloomA.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // composite
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.ctx.width, this.ctx.height);
      gl.colorMask(true, true, true, true);
      gl.useProgram(this.pComp);
      const u = this.uC;
      gl.uniform1f(u.uFlip!, flip);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
      gl.uniform1i(u.uScene!, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
      gl.uniform1i(u.uBloom!, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(u.uRes!, this.ctx.width, this.ctx.height);
      gl.uniform1f(u.uBloomAmt!, this.bloom);
      gl.uniform1f(u.uVig!, this.vig);
      gl.uniform3f(u.uVigCol!, this.vigR, this.vigG, this.vigB);
      gl.uniform1f(u.uScan!, this.scan);
      gl.uniform1f(u.uScanOff!, this.scanOff);
      gl.uniform1f(u.uCA!, this.ca);
      gl.uniform4f(u.uFlash!, this.flashR, this.flashG, this.flashB, this.flashA);
      gl.uniform4f(u.uShock!, this.shockX, this.shockY, this.shockR, this.shockS);
      gl.uniform1f(u.uDesat!, this.desat);
      gl.uniform1f(u.uDim!, this.dim);
      gl.uniform1f(u.uGrain!, this.grain);
      gl.uniform1f(u.uTime!, this.time % 100);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.pOver);
      const u = this.uO;
      gl.uniform1f(u.uFlip!, flip);
      gl.uniform2f(u.uRes!, this.ctx.width, this.ctx.height);
      gl.uniform1f(u.uVig!, this.vig);
      gl.uniform3f(u.uVigCol!, this.vigR, this.vigG, this.vigB);
      gl.uniform1f(u.uScan!, this.scan);
      gl.uniform1f(u.uScanOff!, this.scanOff);
      gl.uniform4f(u.uFlash!, this.flashR, this.flashG, this.flashB, this.flashA);
      gl.uniform1f(u.uDim!, this.dim);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
}
