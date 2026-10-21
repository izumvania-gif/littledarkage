/**
 * A rat as a jointed paper puppet, like real perekladka: body, head, arm and tail on pins.
 * Drawn at about 100 units tall with the feet at (0, 0), facing right. Poses are a few angles,
 * and idle motion steps at 12 frames a second (see Puppet.step), which is the look of cut-out animation.
 */
import { Container, Graphics } from 'pixi.js';

export interface PuppetColors {
  body: number;
  /** Line between overlapping parts (the arm over the coat), so they read as separate pieces. */
  seam: number;
  eye: number;
}

export type Pose = 'rest' | 'attention' | 'speak';

const POSES: Record<Pose, { head: number; arm: number; tail: number }> = {
  rest: { head: 0, arm: 0.14, tail: 0 },
  attention: { head: -0.07, arm: 0, tail: -0.28 },
  speak: { head: -0.12, arm: -0.35, tail: 0.05 },
};

/** Small head nods for idling, one per 12 fps frame; each puppet starts at its own offset. */
const IDLE = [0, 0, 0.02, 0.03, 0.03, 0.02, 0, 0, -0.01, -0.015, -0.01, 0];

export class Puppet {
  readonly root = new Container();
  private readonly head = new Container();
  private readonly arm = new Container();
  private readonly tail = new Container();
  private pose: Pose = 'rest';
  private readonly phase: number;

  constructor(colors: PuppetColors, opts: { general?: boolean; phase?: number } = {}) {
    this.phase = opts.phase ?? 0;
    const c = colors;

    const tail = new Graphics().moveTo(0, 0).quadraticCurveTo(-20, 6, -30, -10).stroke({ width: 3.2, color: c.body, cap: 'round' });
    this.tail.addChild(tail);
    this.tail.position.set(-14, -6);

    const body = new Graphics()
      .moveTo(-17, 0).lineTo(17, 0).lineTo(12, -56).quadraticCurveTo(0, -66, -12, -56).closePath().fill(c.body)
      .ellipse(-8, 1, 7, 3).fill(c.body)
      .ellipse(9, 1, 8, 3).fill(c.body);

    const head = new Graphics()
      .moveTo(-9, 0).quadraticCurveTo(6, 0, 24, -13).quadraticCurveTo(6, -28, -7, -26).quadraticCurveTo(-15, -16, -9, 0).closePath().fill(c.body)
      .circle(-4, -30, 7).fill(c.body);
    if (opts.general) {
      // Peaked cap: band, crown and visor.
      head.poly([-14, -22, 9, -25, 9, -30, -13, -28]).fill(c.body)
        .ellipse(-3, -31, 14, 5).fill(c.body)
        .poly([8, -25, 21, -21, 8, -22]).fill(c.body)
        .moveTo(-13, -24).lineTo(8, -27).stroke({ width: 1.2, color: c.seam });
    } else {
      // Side cap (pilotka).
      head.poly([-13, -24, 7, -27, 1, -35, -11, -33]).fill(c.body);
    }
    head.circle(10, -16, 1.9).fill(c.eye);
    this.head.addChild(head);
    this.head.position.set(0, -60);

    const arm = new Graphics()
      .roundRect(-3.2, -1, 6.4, 28, 3).fill(c.body).stroke({ width: 1.2, color: c.seam })
      .circle(0, 28, 3.6).fill(c.body);
    this.arm.addChild(arm);
    this.arm.position.set(5, -53);

    this.root.addChild(this.tail, body, this.head, this.arm);
    this.apply(0);
  }

  setPose(p: Pose): void {
    this.pose = p;
    this.apply(0);
  }

  /** One 12 fps frame of idling. Only the resting pose idles: at attention nobody moves. */
  step(frame: number): void {
    this.apply(this.pose === 'rest' ? IDLE[(frame + this.phase) % IDLE.length] ?? 0 : 0);
  }

  private apply(nod: number): void {
    const p = POSES[this.pose];
    this.head.rotation = p.head + nod;
    this.arm.rotation = p.arm;
    this.tail.rotation = p.tail;
  }
}
