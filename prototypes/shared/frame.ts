/**
 * A Canvas 2D stage: the canvas fills the window, the 1280×720 reference frame is letterboxed in it,
 * and DOM plates are placed with the same transform. Greybox on purpose: no Pixi in the prototypes.
 */
export const REF_W = 1280;
export const REF_H = 720;

export interface Fit {
  scale: number;
  x: number;
  y: number;
}

export interface Frame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ui: HTMLElement;
  fit: Fit;
  /** Resets the transform to the reference frame (call at the start of every draw). */
  begin(): void;
  /** Reference coordinates to CSS pixels, for DOM plates. */
  toScreen(x: number, y: number): { x: number; y: number };
  /** CSS pixels (e.g. a mouse event) to reference coordinates. */
  toRef(x: number, y: number): { x: number; y: number };
  onResize(cb: () => void): void;
}

export function createFrame(): Frame {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const listeners: (() => void)[] = [];
  let dpr = 1;
  const frame: Frame = {
    canvas,
    ctx,
    ui,
    fit: { scale: 1, x: 0, y: 0 },
    begin() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0f0e0d';
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      const f = frame.fit;
      ctx.setTransform(f.scale * dpr, 0, 0, f.scale * dpr, f.x * dpr, f.y * dpr);
    },
    toScreen(x, y) {
      return { x: frame.fit.x + x * frame.fit.scale, y: frame.fit.y + y * frame.fit.scale };
    },
    toRef(x, y) {
      return { x: (x - frame.fit.x) / frame.fit.scale, y: (y - frame.fit.y) / frame.fit.scale };
    },
    onResize(cb) {
      listeners.push(cb);
    },
  };
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const scale = Math.min(w / REF_W, h / REF_H);
    frame.fit = { scale, x: (w - REF_W * scale) / 2, y: (h - REF_H * scale) / 2 };
    document.documentElement.style.setProperty('--u', `${scale}px`);
    for (const cb of listeners) cb();
  };
  window.addEventListener('resize', resize);
  resize();
  return frame;
}

/** Places an absolutely positioned element at reference coordinates (its anchor point given as fractions). */
export function place(frame: Frame, el: HTMLElement, x: number, y: number, ax = 0, ay = 0): void {
  const p = frame.toScreen(x, y);
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.style.transform = ax || ay ? `translate(${-ax * 100}%, ${-ay * 100}%)` : '';
}

/** Trauma shake (game-feel): add trauma on impact, read a smooth offset that decays by itself. */
export class Shake {
  trauma = 0;
  private t = 0;
  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  offset(dt: number, max = 14): { x: number; y: number; r: number } {
    if (this.trauma <= 0) return { x: 0, y: 0, r: 0 };
    this.trauma = Math.max(0, this.trauma - 1.6 * dt);
    this.t += dt * 30;
    const k = this.trauma * this.trauma;
    return { x: max * k * Math.sin(this.t * 1.7), y: max * 0.7 * k * Math.sin(this.t * 2.3), r: 0.02 * k * Math.sin(this.t * 1.1) };
  }
}
