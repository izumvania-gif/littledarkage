/**
 * Agent mode runs in a headless browser on a software GPU (SwiftShader), where Pixi's batch shaders — one branch
 * per texture unit, 32 of them there — take many seconds each to link. The agent reads words, not pixels, so the
 * page reports a few texture units: batches break more often and every shader links at once.
 */
export function fewTextureUnits(units = 4): void {
  for (const C of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext]) {
    if (!C) continue;
    const real = C.prototype.getParameter;
    C.prototype.getParameter = function (this: WebGLRenderingContext, p: GLenum) {
      const v = real.call(this, p);
      return p === this.MAX_TEXTURE_IMAGE_UNITS ? Math.min(Number(v), units) : v;
    };
  }
}
