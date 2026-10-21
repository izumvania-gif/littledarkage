/**
 * A rat who carries things: the barracks puppet (render/puppet.ts) with both arms on pins, so they can hold
 * a sofa end, and feet that shuffle when it steps. Same proportions, about 100 units tall, feet at (0, 0),
 * facing right. Drawn three times like every cut-out: poster, truth and the truth's blurred shadow.
 */
import { Container, Graphics } from 'pixi.js';
import type { PuppetColors } from '../../render/puppet.ts';

/** Where the hands are when holding: the arm swung forward and a little up, at the shoulder (5, -53). */
export const HOLD = -1.35;
const SHOULDER = { x: 5, y: -53 };
const ARM = 28;

/** The hand's point in the carrier's own units for an arm angle (0 hangs straight down). */
export function handAt(angle: number): { x: number; y: number } {
  return { x: SHOULDER.x - ARM * Math.sin(angle), y: SHOULDER.y + ARM * Math.cos(angle) };
}

export class Carrier {
  readonly root = new Container();
  private readonly lean = new Container();
  private readonly near = new Container();
  private readonly far = new Container();
  private readonly head = new Container();
  private readonly feet = new Graphics();
  private readonly colors: PuppetColors;

  constructor(colors: PuppetColors) {
    this.colors = colors;
    const c = colors;
    const tail = new Graphics().moveTo(-14, -6).quadraticCurveTo(-34, 0, -44, -16).stroke({ width: 3.2, color: c.body, cap: 'round' });
    const body = new Graphics().moveTo(-17, 0).lineTo(17, 0).lineTo(12, -56).quadraticCurveTo(0, -66, -12, -56).closePath().fill(c.body);
    const head = new Graphics()
      .moveTo(-9, 0).quadraticCurveTo(6, 0, 24, -13).quadraticCurveTo(6, -28, -7, -26).quadraticCurveTo(-15, -16, -9, 0).closePath().fill(c.body)
      .circle(-4, -30, 7).fill(c.body)
      .poly([-13, -24, 7, -27, 1, -35, -11, -33]).fill(c.body)
      .circle(10, -16, 1.9).fill(c.eye);
    this.head.addChild(head);
    this.head.position.set(0, -60);
    const arm = (seam: boolean) => {
      const g = new Graphics().roundRect(-3.2, -1, 6.4, ARM, 3).fill(c.body);
      if (seam) g.stroke({ width: 1.2, color: c.seam });
      return g.circle(0, ARM, 3.6).fill(c.body);
    };
    this.far.addChild(arm(false));
    this.far.position.set(SHOULDER.x - 4, SHOULDER.y + 1);
    this.near.addChild(arm(true));
    this.near.position.set(SHOULDER.x, SHOULDER.y);
    this.lean.addChild(this.far, tail, body, this.head, this.near);
    this.root.addChild(this.feet, this.lean);
    this.drawFeet(0);
    this.set({ arms: 0.14, lean: 0, step: 0 });
  }

  /** Arms' angle (HOLD to carry), body lean in radians (back is negative), and which shuffle of the feet. */
  set(p: { arms: number; lean: number; step: number }): void {
    this.near.rotation = p.arms;
    this.far.rotation = p.arms + 0.08;
    this.lean.rotation = p.lean;
    this.head.rotation = -p.lean * 0.6;
    this.drawFeet(p.step);
  }

  /** Feet: together, or one forward and one back mid-step. */
  private drawFeet(step: number): void {
    const s = step === 0 ? 0 : step > 0 ? 5 : -5;
    this.feet.clear().ellipse(-8 - s, 1, 7, 3).fill(this.colors.body).ellipse(9 + s, 1, 8, 3).fill(this.colors.body);
  }
}

/** A carrier in all three layers, moved and posed together. */
export class CarrierTrio {
  readonly parts: Carrier[];
  x = 0;
  private readonly floor: number;
  private readonly scale: number;
  private readonly faceRight: boolean;

  constructor(parts: Carrier[], x: number, floor: number, scale: number, faceRight: boolean) {
    this.parts = parts;
    this.floor = floor;
    this.scale = scale;
    this.faceRight = faceRight;
    this.place(x, 0);
  }

  place(x: number, bob: number): void {
    this.x = x;
    this.parts.forEach((p, i) => {
      // The shadow (third) sits a little off, as a cut-out lifted from the wall would cast it.
      const off = i === 2 ? 6 : 0;
      p.root.position.set(x + off, this.floor - bob + off);
      p.root.scale.set(this.faceRight ? this.scale : -this.scale, this.scale);
    });
  }

  set(p: { arms: number; lean: number; step: number }): void {
    for (const part of this.parts) part.set(p);
  }

  /** The hands in the room's coordinates for an arm angle. */
  hands(angle: number): { x: number; y: number } {
    const h = handAt(angle);
    return { x: this.x + (this.faceRight ? h.x : -h.x) * this.scale, y: this.floor + h.y * this.scale };
  }
}
