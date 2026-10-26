// WebGL context: webgl2 → webgl fallback, shader helpers, context loss, and the software-GPU presenter.
//
// Software rasterisers (SwiftShader / llvmpipe) emit driver warnings ("GPU stall due to ReadPixels") whenever a
// visible WebGL canvas is composited. On those renderers we keep the GL canvas off-DOM, read each frame back
// through an async pixel-pack buffer + fence, and blit it into a visible 2D canvas. Real GPUs present directly.

export type GL = WebGLRenderingContext | WebGL2RenderingContext;

export interface GLInfo {
  webgl2: boolean;
  software: boolean;
  renderer: string;
}

const ATTRS: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

export class SoftwarePresenter {
  private pbo: WebGLBuffer | null = null;
  private fence: WebGLSync | null = null;
  private img: ImageData | null = null;
  private u8: Uint8Array | null = null;
  private w = 0;
  private h = 0;
  private fenceT = 0;
  constructor(
    private gl: WebGL2RenderingContext,
    private ctx2d: CanvasRenderingContext2D,
  ) {}

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h && this.pbo) return;
    const gl = this.gl;
    this.dropFence();
    if (this.pbo) gl.deleteBuffer(this.pbo);
    this.w = w;
    this.h = h;
    this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.DYNAMIC_COPY);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.img = this.ctx2d.createImageData(w, h);
    this.u8 = new Uint8Array(this.img.data.buffer);
  }

  private dropFence(): void {
    if (this.fence) {
      this.gl.deleteSync(this.fence);
      this.fence = null;
    }
  }

  /**
   * Backpressure for the software path: a software rasteriser cannot keep up with 60 Hz at full resolution and,
   * with no visible GL canvas, nothing throttles requestAnimationFrame — the GPU queue would grow without bound.
   * Returns true when the previous readback has landed (and was blitted) so a new frame may be rendered.
   */
  poll(now: number): boolean {
    const gl = this.gl;
    if (!this.fence || !this.img || !this.u8) return true;
    if (gl.getSyncParameter(this.fence, gl.SYNC_STATUS) !== gl.SIGNALED) {
      if (now - this.fenceT < 2000) return false;
      // watchdog: a fence that never signals must not freeze the screen forever
      this.dropFence();
      return true;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.u8);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.dropFence();
    this.ctx2d.putImageData(this.img, 0, 0);
    return true;
  }

  /** call after the frame has been rendered (flipped) into the default framebuffer */
  present(now: number): void {
    const gl = this.gl;
    if (!this.pbo || !this.img || !this.u8 || this.fence) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.fenceT = now;
    gl.flush();
  }

  invalidate(): void {
    this.fence = null;
    this.pbo = null;
    this.w = this.h = 0;
  }
}

export class GLContext {
  gl!: GL;
  info: GLInfo = { webgl2: false, software: false, renderer: '' };
  /** canvas that holds the GL context (off-DOM in software mode) */
  glCanvas: HTMLCanvasElement;
  /** canvas inserted in the page */
  view: HTMLCanvasElement;
  presenter: SoftwarePresenter | null = null;
  width = 1;
  height = 1;
  lost = false;
  onLost: (() => void) | null = null;
  onRestored: (() => void) | null = null;
  private restoreFns: (() => void)[] = [];

  private constructor(glCanvas: HTMLCanvasElement, view: HTMLCanvasElement) {
    this.glCanvas = glCanvas;
    this.view = view;
  }

  /** returns null when WebGL is unavailable */
  static create(): GLContext | null {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    let gl: GL | null = null;
    let webgl2 = false;
    try {
      gl = c.getContext('webgl2', ATTRS);
      webgl2 = !!gl;
      if (!gl) gl = c.getContext('webgl', ATTRS) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
    if (!gl) return null;
    const renderer = detectRenderer(gl);
    const software = /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
    let view = c;
    const ctx = new GLContext(c, view);
    ctx.gl = gl;
    ctx.info = { webgl2, software, renderer };
    if (software && webgl2) {
      view = document.createElement('canvas');
      const c2d = view.getContext('2d', { alpha: false });
      if (c2d) {
        ctx.view = view;
        ctx.presenter = new SoftwarePresenter(gl as WebGL2RenderingContext, c2d);
      }
    }
    c.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      ctx.lost = true;
      ctx.presenter?.invalidate();
      ctx.onLost?.();
    });
    c.addEventListener('webglcontextrestored', () => {
      ctx.lost = false;
      for (const f of ctx.restoreFns) f();
      ctx.onRestored?.();
    });
    return ctx;
  }

  /** register a resource (re)creation callback; it runs immediately and again after context restore */
  managed(fn: () => void): void {
    this.restoreFns.push(fn);
    fn();
  }

  /** flip Y when the frame is read back through the software presenter */
  get flipY(): boolean {
    return this.presenter !== null;
  }

  resize(w: number, h: number): void {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    this.width = w;
    this.height = h;
    if (this.glCanvas.width !== w || this.glCanvas.height !== h) {
      this.glCanvas.width = w;
      this.glCanvas.height = h;
    }
    if (this.view !== this.glCanvas && (this.view.width !== w || this.view.height !== h)) {
      this.view.width = w;
      this.view.height = h;
    }
    this.presenter?.resize(w, h);
  }

  /** false while the software presenter is still waiting for the previous frame (skip rendering this tick) */
  frameReady(now: number): boolean {
    if (this.lost) return false;
    return this.presenter ? this.presenter.poll(now) : true;
  }

  present(now: number): void {
    if (this.lost) return;
    this.presenter?.present(now);
  }

  compile(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const mk = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error('shader: ' + (gl.getShaderInfoLog(s) ?? ''));
      }
      return s;
    };
    const p = gl.createProgram()!;
    const v = mk(gl.VERTEX_SHADER, vs);
    const f = mk(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.bindAttribLocation(p, 1, 'aUv');
    gl.bindAttribLocation(p, 2, 'aCol');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('link: ' + (gl.getProgramInfoLog(p) ?? ''));
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
  }

  texture(src: TexImageSource | null, w: number, h: number, linear: boolean, repeat = false): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  /** begin drawing into the default framebuffer: opaque clear, alpha writes masked */
  bindScreen(r: number, g: number, b: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.colorMask(true, true, true, true);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.colorMask(true, true, true, false);
  }
}

function detectRenderer(gl: GL): string {
  let r = '';
  try {
    r = String(gl.getParameter(gl.RENDERER) ?? '');
    // Chromium masks RENDERER as "WebKit WebGL"; the debug extension is not deprecated there.
    if (/webkit webgl/i.test(r) && /chrome|chromium|edg/i.test(navigator.userAgent)) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) r = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? r);
    }
  } catch {
    /* ignore */
  }
  return r;
}

/** fullscreen-triangle vertex shader shared by passes: vUv in [0,1], y down when uFlip = -1 */
export const FULLSCREEN_VS = `
attribute vec2 aPos;
uniform float uFlip;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos.x, aPos.y * uFlip, 0.0, 1.0);
}`;
