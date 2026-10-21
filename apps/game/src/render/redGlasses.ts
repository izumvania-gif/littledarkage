/**
 * «Красные очки»: the poster layer is baked into a texture with the tears erased out of it, over the truth layer.
 * The bake runs only when something changed: the point of the game (t) moved, a puppet stepped, or the size changed.
 */
import { BlurFilter, Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import { smooth } from '../core/rng.ts';
import { POSTER, REF_H, REF_W } from './palette.ts';
import { holeRadius, tearPoints, tearShape, type Hole } from './tears.ts';

export class RedGlasses {
  readonly view = new Container();
  private rt: RenderTexture;
  private readonly posterSprite: Sprite;
  private readonly shadow: Sprite;
  private readonly holesLayer = new Container();
  private readonly rim = new Graphics();
  private readonly erase = new Graphics();
  private readonly shapes: number[][];
  private readonly renderer: Renderer;
  private readonly poster: Container;
  private readonly holes: readonly Hole[];
  private t = 0;
  private dirty = true;

  constructor(renderer: Renderer, truth: Container, poster: Container, holes: readonly Hole[], resolution: number) {
    this.renderer = renderer;
    this.poster = poster;
    this.holes = holes;
    this.shapes = holes.map((_, i) => tearShape(900 + i * 17));
    this.rt = RenderTexture.create({ width: REF_W, height: REF_H, resolution });
    this.posterSprite = new Sprite(this.rt);
    this.shadow = new Sprite(this.rt);
    this.shadow.tint = 0x000000;
    this.shadow.alpha = 0.5;
    this.shadow.position.set(4, 6);
    this.shadow.filters = [new BlurFilter({ strength: 8, quality: 3 })];
    this.erase.blendMode = 'erase';
    this.holesLayer.addChild(this.rim, this.erase);
    this.view.addChild(truth, this.shadow, this.posterSprite);
  }

  get point(): number {
    return this.t;
  }

  /** Where in the game we are: 0 is the pristine poster of the prologue, 1 the final with no poster left. */
  setT(t: number): void {
    if (Math.abs(t - this.t) > 0.002) {
      this.t = t;
      this.dirty = true;
    }
  }

  setResolution(resolution: number): void {
    if (Math.abs(this.rt.source.resolution - resolution) < 0.01) return;
    this.rt.destroy(true);
    this.rt = RenderTexture.create({ width: REF_W, height: REF_H, resolution });
    this.posterSprite.texture = this.rt;
    this.shadow.texture = this.rt;
    this.dirty = true;
  }

  /** A puppet moved: the poster has to be baked again. */
  invalidate(): void {
    this.dirty = true;
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render({ container: this.poster, target: this.rt, clear: true });
    this.rim.clear();
    this.erase.clear();
    let open = false;
    this.holes.forEach((h, i) => {
      const r = holeRadius(this.t, h);
      if (r <= 0) return;
      open = true;
      const pts = tearPoints(h, r, this.shapes[i] ?? [], i * 1.7);
      this.rim.poly(pts).stroke({ width: 5, color: POSTER.rim, join: 'round' });
      this.erase.poly(pts).fill(0x000000);
    });
    if (open) this.renderer.render({ container: this.holesLayer, target: this.rt, clear: false });
    const fade = 1 - smooth(0.84, 0.97, this.t);
    this.posterSprite.alpha = fade;
    this.shadow.alpha = 0.5 * fade;
    this.shadow.visible = open && fade > 0;
  }
}
