/**
 * What both duties share: a section of the barracks in «Красные очки» (poster over perekladka, composited by
 * RedGlasses), a clock of its own that stops with the tab, cut-out animation at 12 frames a second, a short
 * shake for a thud, the HUD box over the frame, and the general's lines queued one after another.
 */
import { BlurFilter, Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { seededRng } from '../../core/rng.ts';
import { glowTexture, grainTexture, speckleTexture, vignetteTexture } from '../../render/kit.ts';
import { CAPTION_TOP, POSTER, REF_H, REF_W, TRUTH } from '../../render/palette.ts';
import { RedGlasses } from '../../render/redGlasses.ts';
import type { Fit } from '../../render/stage.ts';
import type { Hole } from '../../render/tears.ts';
import { h } from '../../ui/dom.ts';
import type { DutyContext } from './types.ts';
import './duty.css';

/** Cut-out animation steps at 12 frames a second, as everywhere in the barracks. */
export const FRAME = 1 / 12;

export const rgb = (c: readonly [number, number, number]): number => (c[0] << 16) | (c[1] << 8) | c[2];

/** The layers a duty draws into: the poster, the truth under it, and the truth's soft shadows. */
export interface Layers {
  poster: Container;
  truth: Container;
  shadows: Container;
}

export class DutyScene {
  readonly ctx: DutyContext;
  readonly layers: Layers;
  /** Above the composite: things that move every screen frame (the pencil). */
  readonly overlay = new Container();
  /** DOM over the frame; children are placed in reference pixels times --u (see duty.css). */
  readonly hud: HTMLElement;
  /** Shakes and hit-stops off: reduced motion or «без вспышек». */
  readonly calm: boolean;
  private readonly view = new Container();
  private readonly glasses: RedGlasses;
  private readonly offLayout: () => void;
  private clockNow = 0;
  private last = performance.now();
  private acc = 0;
  private frameNo = 0;
  private trauma = 0;
  private shakeT = 0;
  private dead = false;
  private voice: Promise<void> = Promise.resolve();
  private readonly frames: ((frame: number) => void)[] = [];
  private readonly ticks: ((dt: number) => void)[] = [];
  private readonly timers: { at: number; done: () => void }[] = [];
  private readonly tick = () => this.update();
  private readonly onVisible = () => {
    this.last = performance.now();
  };

  constructor(ctx: DutyContext, holes: readonly Hole[]) {
    this.ctx = ctx;
    this.calm = ctx.reduced || ctx.settings.reduceFlashes;
    const shadows = new Container();
    shadows.filters = [new BlurFilter({ strength: 6, quality: 3 })];
    shadows.alpha = 0.55;
    this.layers = { poster: new Container(), truth: new Container(), shadows };
    const renderer = ctx.stage.app.renderer;
    this.glasses = new RedGlasses(renderer, this.layers.truth, this.layers.poster, holes, renderer.resolution * ctx.stage.fit.scale);
    this.glasses.setT(ctx.t);
    this.view.addChild(this.glasses.view, this.overlay);
    ctx.stage.root.addChild(this.view);
    this.hud = h('div', { class: 'duty' });
    ctx.ui.append(this.hud);
    this.offLayout = ctx.stage.onLayout((fit) => this.layout(fit));
    ctx.stage.app.ticker.add(this.tick);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  /** Seconds on the duty's own clock (it stops while the tab is hidden). */
  get now(): number {
    return this.clockNow;
  }

  onFrame(fn: (frame: number) => void): void {
    this.frames.push(fn);
  }

  onTick(fn: (dt: number) => void): void {
    this.ticks.push(fn);
  }

  sleep(seconds: number): Promise<void> {
    return new Promise((done) => this.timers.push({ at: this.clockNow + seconds, done }));
  }

  /** Waits until cond() holds, checked every tick; false if the time ran out first. */
  async until(cond: () => boolean, timeout = Infinity): Promise<boolean> {
    const end = this.clockNow + timeout;
    while (!this.dead) {
      if (cond()) return true;
      if (this.clockNow >= end) return false;
      await this.sleep(0);
    }
    return false;
  }

  /** The general (or `speaker`) says a line after whatever he is still saying. */
  talk(text: string, opts?: { speaker?: string; timeoutMs?: number }): Promise<void> {
    this.voice = this.voice.then(() => (this.dead ? undefined : this.ctx.say(text, opts)));
    return this.voice;
  }

  /** A thud: the frame jolts and settles (not with reduced motion). */
  shake(amount: number): void {
    if (!this.calm) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Something in the poster changed outside the 12 fps frames: bake it again. */
  invalidate(): void {
    this.glasses.invalidate();
  }

  plate(cls: string, ...children: (Node | string)[]): HTMLElement {
    const el = h('div', { class: `duty-plate ${cls}` }, ...children);
    this.hud.append(el);
    return el;
  }

  /** CSS pixels (a pointer event) to reference coordinates. */
  toRef(clientX: number, clientY: number): [number, number] {
    const f = this.ctx.stage.fit;
    return [(clientX - f.x) / f.scale, (clientY - f.y) / f.scale];
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.offLayout();
    this.ctx.stage.app.ticker.remove(this.tick);
    document.removeEventListener('visibilitychange', this.onVisible);
    for (const t of this.timers.splice(0)) t.done();
    this.hud.remove();
    this.view.removeFromParent();
    this.overlay.destroy({ children: true });
    this.glasses.view.destroy({ children: true, texture: true, textureSource: true });
    this.layers.poster.destroy({ children: true, texture: true, textureSource: true });
  }

  private layout(fit: Fit): void {
    const s = this.hud.style;
    s.setProperty('--u', `${fit.scale}px`);
    s.left = `${fit.x}px`;
    s.top = `${fit.y}px`;
    s.width = `${REF_W * fit.scale}px`;
    s.height = `${CAPTION_TOP * fit.scale}px`;
    this.glasses.setResolution(this.ctx.stage.app.renderer.resolution * fit.scale);
  }

  private update(): void {
    if (this.dead) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;
    this.clockNow += dt;
    for (const fn of this.ticks) fn(dt);
    this.acc += dt;
    while (this.acc >= FRAME) {
      this.acc -= FRAME;
      this.frameNo++;
      for (const fn of this.frames) fn(this.frameNo);
      this.glasses.invalidate();
    }
    // Shake: decaying trauma, squared, smooth (game-feel); the picture moves, never the model.
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 1.8 * dt);
      this.shakeT += dt * 30;
      const k = this.trauma * this.trauma;
      this.view.position.set(10 * k * Math.sin(this.shakeT * 1.7), 7 * k * Math.sin(this.shakeT * 2.3));
    } else this.view.position.set(0, 0);
    this.glasses.update();
    const due = this.timers.filter((t) => t.at <= this.clockNow);
    for (const t of due) {
      this.timers.splice(this.timers.indexOf(t), 1);
      t.done();
    }
  }
}

/**
 * The finish every section shares: the poster's caption band, print and frame; the truth's fog, vignette
 * and grain. (Each section adds layers.shadows to its truth itself, under its cut-outs.)
 */
export function finish(layers: Layers, floor: number, seed: number): void {
  const { poster, truth } = layers;
  poster.addChild(new Graphics().rect(0, CAPTION_TOP, REF_W, REF_H - CAPTION_TOP).fill(POSTER.cream).rect(0, CAPTION_TOP, REF_W, 6).fill(POSTER.black));
  poster.addChild(new Sprite(speckleTexture(REF_W, REF_H, seed)));
  poster.addChild(new Graphics().rect(5, 5, REF_W - 10, REF_H - 10).stroke({ width: 10, color: POSTER.black }));

  const fog = new Container();
  const r = seededRng(seed + 7);
  for (let i = 0; i < 6; i++) {
    const s = new Sprite(glowTexture(256));
    s.anchor.set(0.5);
    s.position.set(r() * REF_W, floor - 40 + r() * 150);
    s.width = 420 + r() * 380;
    s.height = s.width * 0.45;
    s.tint = rgb(TRUTH.fog);
    s.alpha = 0.07;
    fog.addChild(s);
  }
  truth.addChild(fog);
  truth.addChild(new Sprite(vignetteTexture(REF_W, REF_H, 0.6)));
  const grain = new TilingSprite({ texture: grainTexture(160, seed), width: REF_W, height: REF_H });
  grain.alpha = 0.12;
  truth.addChild(grain);
}

/** A lamp hanging from the ceiling at x: the poster's black shade with rays, the truth's warm bulb. */
export function lamp(layers: Layers, x: number, y = 60): void {
  const g = new Graphics()
    .moveTo(x, 0).lineTo(x, y - 26).stroke({ width: 3, color: POSTER.black })
    .poly([x - 16, y - 26, x + 16, y - 26, x + 28, y - 6, x - 28, y - 6]).fill(POSTER.black)
    .circle(x + 2, y + 1, 9).fill(POSTER.red);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.15 + i * 0.117);
    g.moveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18).lineTo(x + Math.cos(a) * 46, y + Math.sin(a) * 46);
  }
  g.stroke({ width: 6, color: POSTER.black });
  layers.poster.addChild(g);

  const glow = new Sprite(glowTexture(256));
  glow.anchor.set(0.5);
  glow.position.set(x, y + 40);
  glow.width = glow.height = 900;
  glow.tint = rgb(TRUTH.lamp);
  glow.alpha = 0.42;
  layers.truth.addChild(glow);
  layers.truth.addChild(new Graphics().moveTo(x, 0).lineTo(x, y - 26).stroke({ width: 2, color: 0x26221e }).poly([x - 16, y - 26, x + 16, y - 26, x + 28, y - 6, x - 28, y - 6]).fill(0x3a3029));
  const bulb = new Sprite(glowTexture(128));
  bulb.anchor.set(0.5);
  bulb.position.set(x, y);
  bulb.width = bulb.height = 70;
  bulb.tint = 0xffecbe;
  layers.truth.addChild(bulb);
}
