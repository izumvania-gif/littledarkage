/**
 * A rat as a jointed paper puppet, like real perekladka: body, head, arms, feet and tail on pins.
 * Drawn at about 100 units tall with the feet at (0, 0), facing right. Poses are a few angles,
 * and motion steps at 12 frames a second (see Puppet.step), which is the look of cut-out animation.
 * A look (content/looks.ts) adds what tells the soldiers apart: a cap or a bald crown, a beard, a braid,
 * a moustache, a book, an instrument, a stoop, a rounder coat.
 */
import { Container, Graphics } from 'pixi.js';

export interface PuppetColors {
  body: number;
  /** Line between overlapping parts (the arm over the coat), so they read as separate pieces. */
  seam: number;
  eye: number;
  /** Light details: a beard, glasses, a ribbon, a moustache. Defaults to the seam colour. */
  light?: number;
  /** A coloured detail: the book's cover, a guitar's deck. Defaults to the body colour. */
  accent?: number;
}

export type Pose = 'rest' | 'attention' | 'speak' | 'walk' | 'sit' | 'carry' | 'clap' | 'play' | 'point';

export interface PuppetLook {
  hat?: 'pilotka' | 'cap' | 'none';
  /** A huge white beard (Крыпоткин). */
  beard?: boolean;
  /** Round glasses on a cord. */
  glasses?: boolean;
  /** A book under the arm. */
  book?: boolean;
  /** A braid from under the pilotka, with a ribbon. */
  braid?: boolean;
  /** A drooping moustache. */
  moustache?: boolean;
  /** Leaning forward, radians; old soldiers stoop. */
  stoop?: number;
  /** Width of the coat; a round soldier is wider. */
  girth?: number;
  instrument?: 'guitar' | 'bass' | 'drum';
}

interface Angles {
  head: number;
  arm: number;
  back: number;
  tail: number;
  body: number;
}

const POSES: Record<Exclude<Pose, 'walk' | 'sit' | 'clap' | 'play'>, Angles> = {
  rest: { head: 0, arm: 0.14, back: 0.1, tail: 0, body: 0 },
  attention: { head: -0.07, arm: 0, back: 0, tail: -0.28, body: 0 },
  speak: { head: -0.12, arm: -0.35, back: 0.1, tail: 0.05, body: 0 },
  carry: { head: 0.06, arm: -1.45, back: -1.4, tail: 0.1, body: 0.04 },
  point: { head: -0.1, arm: -1.8, back: 0.1, tail: -0.1, body: 0 },
};

/** Small head nods for idling, one per 12 fps frame; each puppet starts at its own offset. */
const IDLE = [0, 0, 0.02, 0.03, 0.03, 0.02, 0, 0, -0.01, -0.015, -0.01, 0];

/** Four frames of a step: where each foot is and how high the body rides. Feet A and B swap halfway. */
const WALK = [
  { a: [12, 1], b: [-14, 1], bob: 0, arm: -0.25 },
  { a: [4, 1], b: [-4, -3], bob: -2, arm: 0 },
  { a: [-14, 1], b: [12, 1], bob: 0, arm: 0.35 },
  { a: [-4, -3], b: [4, 1], bob: -2, arm: 0 },
] as const;

export class Puppet {
  readonly root = new Container();
  private readonly body = new Container();
  private readonly head = new Container();
  private readonly arm = new Container();
  private readonly backArm = new Container();
  private readonly tail = new Container();
  private readonly footA = new Graphics();
  private readonly footB = new Graphics();
  private readonly legs = new Graphics();
  private readonly instrument = new Container();
  private pose: Pose = 'rest';
  /** Sitting and talking: a lifted hand, the head up. */
  private talking = false;
  private readonly phase: number;
  private readonly look: PuppetLook;
  private readonly stoop: number;

  constructor(colors: PuppetColors, opts: { general?: boolean; phase?: number; look?: PuppetLook } = {}) {
    this.phase = opts.phase ?? 0;
    const look: PuppetLook = opts.look ?? { hat: opts.general ? 'cap' : 'pilotka' };
    this.look = look;
    this.stoop = look.stoop ?? 0;
    const c = colors;
    const light = c.light ?? c.seam;
    const accent = c.accent ?? c.body;
    const girth = look.girth ?? 1;

    const tail = new Graphics().moveTo(0, 0).quadraticCurveTo(-20, 6, -30, -10).stroke({ width: 3.2, color: c.body, cap: 'round' });
    this.tail.addChild(tail);
    this.tail.position.set(-14 * girth, -6);

    const backArm = new Graphics().roundRect(-3.2, -1, 6.4, 28, 3).fill(c.body).circle(0, 28, 3.6).fill(c.body);
    this.backArm.addChild(backArm);
    this.backArm.position.set(-1, -53);

    const coat = new Graphics().moveTo(-17, 0).lineTo(17, 0).lineTo(12, -56).quadraticCurveTo(0, -66, -12, -56).closePath().fill(c.body);
    coat.scale.x = girth;
    this.body.addChild(coat);
    if (look.book) {
      // His own book under the arm: «Взаимопомощь как фактор подземной эволюции».
      this.body.addChild(new Graphics().rect(-2, -44, 15, 20).fill(accent).rect(-2, -44, 2.5, 20).fill(c.body).rect(-2, -44, 15, 20).stroke({ width: 1, color: c.seam }));
    }

    this.footA.ellipse(0, 0, 8, 3).fill(c.body);
    this.footB.ellipse(0, 0, 7, 3).fill(c.body);
    // Sitting: thigh forward, shin down, foot.
    this.legs
      .roundRect(-2, -6, 26, 8, 4).fill(c.body)
      .roundRect(18, -4, 7, 30, 3.5).fill(c.body)
      .ellipse(25, 26, 8, 3).fill(c.body)
      .roundRect(-2, -6, 26, 8, 4).stroke({ width: 1.1, color: c.seam });
    this.legs.visible = false;

    const head = new Graphics()
      .moveTo(-9, 0).quadraticCurveTo(6, 0, 24, -13).quadraticCurveTo(6, -28, -7, -26).quadraticCurveTo(-15, -16, -9, 0).closePath().fill(c.body)
      .circle(-4, -30, 7).fill(c.body);
    const hat = look.hat ?? 'pilotka';
    if (hat === 'cap') {
      // Peaked cap: band, crown and visor.
      head.poly([-14, -22, 9, -25, 9, -30, -13, -28]).fill(c.body)
        .ellipse(-3, -31, 14, 5).fill(c.body)
        .poly([8, -25, 21, -21, 8, -22]).fill(c.body)
        .moveTo(-13, -24).lineTo(8, -27).stroke({ width: 1.2, color: c.seam });
    } else if (hat === 'pilotka') {
      // Side cap (pilotka).
      head.poly([-13, -24, 7, -27, 1, -35, -11, -33]).fill(c.body);
    } else {
      // A bald crown, a fringe of white hair over the ear.
      head.moveTo(-13, -20).quadraticCurveTo(-16, -12, -11, -6).stroke({ width: 3, color: light, cap: 'round' });
    }
    if (look.braid) {
      // The braid falls from under the pilotka, away from the back, with a ribbon at the end.
      const braid = new Graphics()
        .moveTo(-11, -24).quadraticCurveTo(-24, -14, -21, 6).stroke({ width: 5, color: c.body, cap: 'round' })
        .poly([-25, 6, -17, 6, -21, 11]).fill(light)
        .moveTo(-14, -18).lineTo(-19, -14).moveTo(-18, -8).lineTo(-23, -5).stroke({ width: 1, color: c.seam });
      head.addChild(braid);
    }
    head.circle(10, -16, 1.9).fill(c.eye);
    if (look.moustache) head.moveTo(17, -11).quadraticCurveTo(14, -3, 9, -1).stroke({ width: 2.6, color: light, cap: 'round' });
    if (look.glasses) {
      head.circle(11, -16, 4.2).stroke({ width: 1.4, color: light })
        .moveTo(7, -17).lineTo(-6, -20).stroke({ width: 1, color: light })
        // The cord loops down to the chest.
        .moveTo(-6, -20).quadraticCurveTo(-8, 6, 6, 10).stroke({ width: 0.9, color: light });
    }
    if (look.beard) {
      head.moveTo(-6, -4).quadraticCurveTo(4, 2, 19, -8).quadraticCurveTo(22, 4, 16, 16).quadraticCurveTo(10, 30, 0, 26)
        .quadraticCurveTo(-8, 22, -9, 8).quadraticCurveTo(-10, 0, -6, -4).closePath().fill(light)
        .moveTo(2, 4).lineTo(3, 18).moveTo(9, 2).lineTo(9, 14).stroke({ width: 0.8, color: c.seam });
    }
    this.head.addChild(head);
    this.head.position.set(0, -60);

    const arm = new Graphics()
      .roundRect(-3.2, -1, 6.4, 28, 3).fill(c.body).stroke({ width: 1.2, color: c.seam })
      .circle(0, 28, 3.6).fill(c.body);
    this.arm.addChild(arm);
    this.arm.position.set(5, -53);

    if (look.instrument) this.instrument.addChild(drawInstrument(look.instrument, c.body, light, accent));
    this.instrument.visible = false;

    this.root.addChild(this.backArm, this.tail, this.body, this.footB, this.footA, this.legs, this.head, this.instrument, this.arm);
    this.apply(0);
  }

  setPose(p: Pose): void {
    this.pose = p;
    this.apply(0);
  }

  get current(): Pose {
    return this.pose;
  }

  setTalking(v: boolean): void {
    this.talking = v;
    this.apply(0);
  }

  /** One 12 fps frame. Resting and sitting puppets idle; walkers step; players play; at attention nobody moves. */
  step(frame: number): void {
    const f = frame + this.phase;
    if (this.pose === 'rest' || this.pose === 'sit') this.apply(IDLE[f % IDLE.length] ?? 0, f);
    else this.apply(0, f);
  }

  private apply(nod: number, frame = 0): void {
    const look = this.look;
    let a: Angles;
    let bob = 0;
    let feet: { a: readonly number[]; b: readonly number[] } = { a: [9, 1], b: [-8, 1] };
    const sitting = this.pose === 'sit';
    switch (this.pose) {
      case 'walk': {
        const w = WALK[frame % WALK.length]!;
        a = { head: 0.03, arm: w.arm, back: -w.arm, tail: 0.12, body: 0.03 };
        feet = w;
        bob = w.bob;
        break;
      }
      case 'sit':
        a = this.talking ? { head: -0.1, arm: -0.75, back: -0.2, tail: 0.25, body: -0.05 } : { head: 0.02, arm: -0.25, back: -0.2, tail: 0.25, body: -0.05 };
        break;
      case 'clap': {
        const open = frame % 4 < 2;
        a = { head: -0.06, arm: open ? -1.25 : -0.95, back: open ? -0.8 : -1.1, tail: 0.05, body: 0 };
        break;
      }
      case 'play': {
        const beat = frame % 4 < 2;
        if (look.instrument === 'drum') a = { head: 0.05, arm: beat ? -1.0 : -0.45, back: beat ? -0.45 : -1.0, tail: 0.1, body: 0.05 };
        else a = { head: 0.08, arm: beat ? -0.15 : 0.2, back: -1.35, tail: 0.1, body: 0.02 };
        break;
      }
      default:
        a = POSES[this.pose];
    }
    this.head.rotation = a.head + nod;
    this.head.y = -60 + bob + (this.stoop ? 4 : 0);
    this.head.x = this.stoop ? 4 : 0;
    this.arm.rotation = a.arm;
    this.arm.y = -53 + bob;
    this.backArm.rotation = a.back;
    this.backArm.y = -53 + bob;
    this.tail.rotation = a.tail;
    this.body.rotation = a.body + this.stoop;
    this.body.y = bob;
    this.footA.position.set(feet.a[0] ?? 0, feet.a[1] ?? 0);
    this.footB.position.set(feet.b[0] ?? 0, feet.b[1] ?? 0);
    this.footA.visible = this.footB.visible = !sitting;
    this.legs.visible = sitting;
    this.instrument.visible = this.pose === 'play';
  }
}

/** Instruments of the barracks band, held in front of the body. */
function drawInstrument(kind: 'guitar' | 'bass' | 'drum', body: number, light: number, accent: number): Graphics {
  const g = new Graphics();
  if (kind === 'drum') {
    // A snare on a stand in front of the drummer.
    g.rect(26, -36, 34, 18).fill(accent).rect(26, -36, 34, 4).fill(light).rect(26, -36, 34, 18).stroke({ width: 1.4, color: body })
      .moveTo(43, -18).lineTo(36, 0).moveTo(43, -18).lineTo(50, 0).stroke({ width: 2, color: body });
    return g;
  }
  const neck = kind === 'bass' ? 46 : 36;
  g.moveTo(14, -36).lineTo(14 + neck, -36 - neck * 0.55).stroke({ width: 3.2, color: body, cap: 'round' })
    .ellipse(8, -28, 13, 10).fill(accent).ellipse(8, -28, 13, 10).stroke({ width: 1.3, color: body })
    .circle(10, -29, 3.2).fill(body)
    .rect(10 + neck, -40 - neck * 0.55, 8, 5).fill(body);
  return g;
}
