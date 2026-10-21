/**
 * «Закрасить листочки и уложить в ряд» (concept «Наряды»): shade a sheet evenly with a pencil without going
 * over the edge, lay it in the row straight, and the general checks the row with a ruler. He always finds a
 * millimetre. The sheet is the same ragged paper the creatures are cut from in battle; nobody says so.
 */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { seededRng, smooth } from '../../core/rng.ts';
import { BattleSound } from '../../engine/spatial.ts';
import { glowTexture } from '../../render/kit.ts';
import { POSTER, TRUTH } from '../../render/palette.ts';
import type { Hole } from '../../render/tears.ts';
import { h, isTyping } from '../../ui/dom.ts';
import { leavesScore, Shading, straightness, type Pt } from './leavesModel.ts';
import { DutyScene, finish, rgb, type Layers } from './scene.ts';
import type { DutyContext, DutyResult } from './types.ts';

/** The sheet being shaded, big, on the left; the row on the right; the gap at its end. */
const BIG = { x: 330, y: 300, scale: 13 };
const ROW = { x0: 690, dx: 100, y: 300, scale: 4, count: 5 };
const GAP_X = ROW.x0 + ROW.dx * ROW.count;
/** The ruler is laid along the row's bottom edge. */
const RULER_Y = ROW.y + 50;
const LEAD = 10;
/** Stroke canvases cover the sheet plus this much table around it, in big-sheet pixels. */
const MARGIN = 60;

const HOLES: readonly Hole[] = [
  { x: 1250, y: 80, start: 0.04, max: 150 },
  { x: 30, y: 520, start: 0.08, max: 140 },
  { x: 760, y: 60, start: 0.14, max: 420 },
  { x: 120, y: 120, start: 0.22, max: 460 },
  { x: 1100, y: 520, start: 0.3, max: 560 },
  { x: 560, y: 470, start: 0.4, max: 600 },
  { x: 330, y: 300, start: 0.55, max: 700 },
];

const SAY = {
  intro: 'Наряд: закрасить листки и уложить в ряд.',
  rule: 'Карандашом. Ровно. За край не выходить.',
  edge: 'За край не выходить.',
  hurry: 'Быстрее. Но ровно.',
  enough: 'Достаточно.',
  thin: 'Не закрашено. Ладно.',
  lay: 'Уложить в ряд. Ровно.',
  check: 'Проверим.',
  mm: 'Миллиметр.',
  good: 'Вот. Удовлетворительно.',
  fair: 'Удовлетворительно. С натяжкой.',
  bad: 'Отставить листок. Сам поправлю.',
  done: 'Листок к листку. Наряд — выполнен.',
};

/** The ragged sheet: eight corners, jittered once per seed (the same cut as a creature in the flashes). */
function sheetShape(seed: number): Pt[] {
  const r = seededRng(seed);
  return (
    [
      [-10, -12],
      [0, -13],
      [10, -11],
      [12, 0],
      [11, 12],
      [0, 11],
      [-11, 10],
      [-12, 0],
    ] as const
  ).map(([x, y]) => [x + (r() - 0.5) * 3, y + (r() - 0.5) * 3] as const);
}

export async function runLeaves(ctx: DutyContext): Promise<DutyResult> {
  const duty = new Leaves(ctx);
  try {
    return await duty.run();
  } finally {
    duty.destroy();
  }
}

/** A sheet drawn in both layers: its paper, and over it the pencil (a white canvas tinted per layer). */
interface SheetPair {
  poster: Container;
  truth: Container;
  shadow: Graphics;
}

class Leaves {
  private readonly ctx: DutyContext;
  private readonly scene: DutyScene;
  private readonly sound: BattleSound;
  private readonly shape: Pt[] = sheetShape(31);
  /** The sheet's outline in big-sheet pixels around its centre. */
  private readonly poly: Pt[];
  private readonly shading: Shading;
  private readonly sheet: SheetPair;
  /** Pencil marks: on the sheet and on the table, each in the poster's ink and the truth's graphite. */
  private readonly marks: { g: CanvasRenderingContext2D; tex: Texture; clip: 'in' | 'out'; poster: boolean }[] = [];
  private readonly clipIn: Path2D;
  private readonly clipOut: Path2D;
  private readonly pencil = new Graphics();
  private readonly ruler: Container[] = [];
  private readonly done: HTMLElement;
  private readonly keysPlate: HTMLElement;
  private phase: 'shade' | 'lay' | 'check' | 'over' = 'shade';
  private pen: [number, number] = [BIG.x + 40, BIG.y - 40];
  private pressed = false;
  private keyDraw = false;
  private readonly held = new Set<string>();
  private dirty = false;
  private warned = false;
  private finishShade = false;
  private finishLay = false;
  /** Where the sheet lies in the gap: off the row's line, and turned. */
  private dy = 0;
  private angle = 0;
  private readonly onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
    if (e.code === 'Space') this.keyDraw = false;
  };
  private readonly onPointer = (e: PointerEvent) => this.pointer(e);
  private readonly onWheel = (e: WheelEvent) => this.wheel(e);

  constructor(ctx: DutyContext) {
    this.ctx = ctx;
    this.sound = new BattleSound(ctx.audio);
    this.scene = new DutyScene(ctx, HOLES);
    this.poly = this.shape.map(([x, y]) => [x * BIG.scale, y * BIG.scale] as const);
    this.shading = new Shading(this.poly, 10, MARGIN);
    this.clipIn = path(this.poly, 0);
    this.clipOut = path(this.poly, MARGIN + 30);

    const L = this.scene.layers;
    buildTable(L, ctx.t);
    for (let i = 0; i < ROW.count; i++) rowSheet(L, ROW.x0 + i * ROW.dx, ROW.y + [0, 1, -1, 0, 1][i]!, 41 + i);

    // Pencil on the table stays where it fell; pencil on the sheet travels with the sheet.
    const size = Math.ceil(26 * BIG.scale + 2 * MARGIN);
    const layer = (clip: 'in' | 'out', poster: boolean, tint: number) => {
      const [c, g] = canvas(size);
      const tex = Texture.from(c);
      this.marks.push({ g, tex, clip, poster });
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.tint = tint;
      return sprite;
    };
    const tablePoster = layer('out', true, POSTER.black);
    const tableTruth = layer('out', false, 0x2b2927);
    tablePoster.position.set(BIG.x, BIG.y);
    tableTruth.position.set(BIG.x, BIG.y);
    L.poster.addChild(tablePoster);
    L.truth.addChild(tableTruth);
    this.sheet = this.makeSheet(L, layer('in', true, POSTER.black), layer('in', false, 0x34312e));
    this.placeSheet(BIG.x, BIG.y, 1, 0);
    finish(L, 520, 33);

    this.drawPencil();
    this.scene.overlay.addChild(this.pencil);
    this.keysPlate = this.scene.plate('duty-keys');
    this.done = this.scene.plate('duty-done');
    const btn = h('button', { attrs: { type: 'button' } }, 'Готово', h('kbd', { text: 'Enter' }));
    btn.addEventListener('click', () => this.finishPhase());
    this.done.append(btn);
    this.showKeys();

    this.scene.onTick((dt) => this.tick(dt));
    this.scene.onFrame(() => this.flush());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('pointermove', this.onPointer);
    window.addEventListener('pointerup', this.onPointer);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    ctx.stage.app.canvas.style.cursor = 'none';
    // For the dev page's robot (stripped from the build).
    if (import.meta.env.DEV) Reflect.set(window, '__leaves', this);
  }

  async run(): Promise<DutyResult> {
    const s = this.scene;
    const timed = !this.ctx.settings.noTimer;
    await s.talk(SAY.intro);
    void s.talk(SAY.rule, { timeoutMs: 2200 });

    // Shade: until it's full, «Готово», or (timed) half a minute.
    const start = s.now;
    let hurried = false;
    await s.until(() => {
      if (timed && !hurried && s.now - start > 15 && this.shading.coverage() < 0.4) {
        hurried = true;
        void s.talk(SAY.hurry, { timeoutMs: 1600 });
      }
      return this.finishShade || this.shading.coverage() >= 0.93 || (timed && s.now - start > 30);
    });
    const coverage = this.shading.coverage();
    this.pressed = false;
    this.keyDraw = false;
    this.pencil.visible = false;
    this.ctx.stage.app.canvas.style.cursor = '';
    void s.talk(coverage < 0.5 ? SAY.thin : SAY.enough, { timeoutMs: 1300 });

    // Lay it in the row: the sheet goes into the gap a little crooked, the player straightens it.
    this.phase = 'lay';
    this.showKeys();
    const r = seededRng(Math.floor(s.now * 1000));
    const dy0 = (r() < 0.5 ? -1 : 1) * (10 + r() * 10);
    const a0 = (r() < 0.5 ? -1 : 1) * (0.1 + r() * 0.08);
    await this.fly(dy0, a0);
    void s.talk(SAY.lay, { timeoutMs: 1600 });
    const layStart = s.now;
    await s.until(() => this.finishLay || (timed && s.now - layStart > 15));
    const straight = straightness(this.dy, this.angle);

    // The ruler: it always finds a millimetre.
    this.phase = 'check';
    this.done.hidden = true;
    this.showKeys();
    await s.talk(SAY.check, { timeoutMs: 1200 });
    await this.measure();
    this.sound.paper();
    await s.talk(SAY.mm, { timeoutMs: 1400 });
    const overrun = this.shading.overrun();
    const score = leavesScore(coverage, overrun, straight);
    // The general's finger puts it right, whatever it was: after his verdict if it was bad, before it if not.
    if (score < 0.5) {
      await s.talk(SAY.bad);
      await this.straighten();
    } else {
      await this.straighten();
      await s.talk(score >= 0.8 ? SAY.good : SAY.fair);
    }
    await s.talk(SAY.done);
    this.phase = 'over';
    return {
      score,
      notes: { coverage: round(coverage), overrun: round(overrun), straight: round(straight), seconds: Math.round(s.now) },
    };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerup', this.onPointer);
    window.removeEventListener('wheel', this.onWheel);
    this.ctx.stage.app.canvas.style.cursor = '';
    this.scene.destroy();
    for (const m of this.marks) m.tex.destroy(true);
  }

  // ---------- drawing ----------

  private makeSheet(L: Layers, posterMarks: Sprite, truthMarks: Sprite): SheetPair {
    posterMarks.alpha = 0.92;
    truthMarks.alpha = 0.85;
    const flat = this.shape.flatMap(([x, y]) => [x * BIG.scale, y * BIG.scale]);
    const poster = new Container();
    poster.addChild(new Graphics().poly(flat).fill(POSTER.cream), posterMarks, new Graphics().poly(flat).stroke({ width: 4, color: POSTER.black, join: 'round' }));
    const truth = new Container();
    truth.addChild(new Graphics().poly(flat).fill(0xd9d0bd), truthMarks, new Graphics().poly(flat).stroke({ width: 1.5, color: 0x9a907e }));
    const shadow = new Graphics().poly(flat).fill(0x000000);
    L.shadows.addChild(shadow);
    L.poster.addChild(poster);
    L.truth.addChild(truth);
    return { poster, truth, shadow };
  }

  /** The sheet at (x, y), scaled from its big size, turned by a. */
  private placeSheet(x: number, y: number, k: number, a: number): void {
    for (const c of [this.sheet.poster, this.sheet.truth]) {
      c.position.set(x, y);
      c.scale.set(k);
      c.rotation = a;
    }
    this.sheet.shadow.position.set(x + 6 * k + 2, y + 7 * k + 2);
    this.sheet.shadow.scale.set(k);
    this.sheet.shadow.rotation = a;
  }

  private drawPencil(): void {
    // Tip at (0, 0), the pencil leaning up and to the right, as a right hand holds it.
    this.pencil
      .poly([0, 0, 10, -14, 18, -8])
      .fill(0xd9c49a)
      .poly([0, 0, 4, -5.6, 7.2, -3.2])
      .fill(0x1c1a18)
      .poly([10, -14, 18, -8, 92, -110, 84, -116])
      .fill(POSTER.red)
      .stroke({ width: 2, color: POSTER.black })
      .poly([84, -116, 92, -110, 98, -118, 90, -124])
      .fill(0x8a8a86);
    this.pencil.position.set(...this.pen);
  }

  /** Pencil marks reach the textures once per screen frame. */
  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    for (const m of this.marks) m.tex.source.update();
  }

  /** A stroke on the big sheet, in room pixels: shaded where it's on the paper, a smudge where it's not. */
  private stroke(a: [number, number], b: [number, number]): void {
    const la: Pt = [a[0] - BIG.x, a[1] - BIG.y];
    const lb: Pt = [b[0] - BIG.x, b[1] - BIG.y];
    const { overran } = this.shading.stroke(la, lb, LEAD);
    // A soft lead leaves parallel grooves: four thin lines across the stroke, solid ink on the poster, faint graphite in the truth.
    const len = Math.hypot(lb[0] - la[0], lb[1] - la[1]) || 1;
    const nx = -(lb[1] - la[1]) / len;
    const ny = (lb[0] - la[0]) / len;
    for (const m of this.marks) {
      const g = m.g;
      const half = g.canvas.width / 2;
      g.save();
      g.translate(half, half);
      g.clip(m.clip === 'in' ? this.clipIn : this.clipOut, 'evenodd');
      g.strokeStyle = m.poster ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)';
      g.lineWidth = m.poster ? 3.4 : 2.6;
      g.lineCap = 'round';
      g.beginPath();
      for (const o of [-7.5, -2.5, 2.5, 7.5]) {
        const j = (Math.random() - 0.5) * 1.6;
        g.moveTo(la[0] + nx * (o + j), la[1] + ny * (o + j));
        g.lineTo(lb[0] + nx * (o + j), lb[1] + ny * (o + j));
      }
      g.stroke();
      g.restore();
    }
    this.dirty = true;
    if (overran > 0 && !this.warned) {
      this.warned = true;
      void this.scene.talk(SAY.edge, { timeoutMs: 1500 });
    }
    if (Math.hypot(lb[0] - la[0], lb[1] - la[1]) > 6 && Math.random() < 0.25) this.sound.noise({ dur: 0.06, filter: 'bandpass', freq: 3200, q: 2, gain: 0.05 });
  }

  // ---------- phases ----------

  /** The sheet shrinks into the gap at the row's end, in cut-out steps. */
  private async fly(dy: number, a: number): Promise<void> {
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      this.placeSheet(BIG.x + (GAP_X - BIG.x) * k, BIG.y + (ROW.y + dy - BIG.y) * k, 1 + (ROW.scale / BIG.scale - 1) * k, a * k);
      await this.scene.sleep(1 / 12);
    }
    this.dy = dy;
    this.angle = a;
    this.sound.paper();
  }

  private lay(): void {
    this.placeSheet(GAP_X, ROW.y + this.dy, ROW.scale / BIG.scale, this.angle);
  }

  /** The general's ruler slides along the row and stops at the new sheet. */
  private async measure(): Promise<void> {
    const L = this.scene.layers;
    const make = (wood: number, line: number, poster: boolean) => {
      const c = new Container();
      const g = new Graphics().rect(0, 0, 640, 26).fill(wood);
      if (poster) g.stroke({ width: 3, color: line });
      for (let i = 0; i <= 64; i++) g.moveTo(i * 10, 0).lineTo(i * 10, i % 5 ? 7 : 13).stroke({ width: 1.5, color: line });
      c.addChild(g);
      return c;
    };
    this.ruler.push(make(POSTER.cream, POSTER.black, true), make(0xb59a6a, 0x3a2e22, false));
    L.poster.addChild(this.ruler[0]!);
    L.truth.addChild(this.ruler[1]!);
    for (let i = 0; i <= 10; i++) {
      for (const r of this.ruler) r.position.set(210 + i * 40, RULER_Y);
      await this.scene.sleep(1 / 12);
    }
  }

  private async straighten(): Promise<void> {
    for (let i = 3; i >= 0; i--) {
      this.dy = (this.dy * i) / 4;
      this.angle = (this.angle * i) / 4;
      this.lay();
      await this.scene.sleep(1 / 12);
    }
  }

  private finishPhase(): void {
    if (this.phase === 'shade') this.finishShade = true;
    else if (this.phase === 'lay') this.finishLay = true;
  }

  private showKeys(): void {
    const k = (t: string) => h('kbd', { text: t });
    const p = this.keysPlate;
    if (this.phase === 'shade') {
      p.replaceChildren(
        h('p', { class: 'who', text: 'Закрасить листок ровно, не за край.' }),
        h('p', {}, 'Мышь — вести карандаш с нажатой кнопкой.'),
        h('p', {}, 'Или ', k('←'), ' ', k('↑'), ' ', k('→'), ' ', k('↓'), ' — вести, ', k('Пробел'), ' — нажимать.'),
      );
    } else if (this.phase === 'lay') {
      p.replaceChildren(
        h('p', { class: 'who', text: 'Уложить листок в ряд ровно.' }),
        h('p', {}, k('↑'), ' ', k('↓'), ' — выше, ниже; ', k('←'), ' ', k('→'), ' — повернуть.'),
        h('p', {}, 'Или мышью: тянуть — сдвинуть, колесо — повернуть.'),
      );
    } else p.hidden = true;
  }

  // ---------- input ----------

  private tick(dt: number): void {
    if (this.phase === 'shade') {
      const v = 320 * dt;
      let dx = 0;
      let dy = 0;
      if (this.held.has('ArrowLeft')) dx -= v;
      if (this.held.has('ArrowRight')) dx += v;
      if (this.held.has('ArrowUp')) dy -= v;
      if (this.held.has('ArrowDown')) dy += v;
      if (dx || dy) this.moveTo([this.pen[0] + dx, this.pen[1] + dy], this.keyDraw);
    } else if (this.phase === 'lay') {
      let changed = false;
      if (this.held.has('ArrowUp')) (this.dy -= 30 * dt), (changed = true);
      if (this.held.has('ArrowDown')) (this.dy += 30 * dt), (changed = true);
      if (this.held.has('ArrowLeft')) (this.angle -= 0.25 * dt), (changed = true);
      if (this.held.has('ArrowRight')) (this.angle += 0.25 * dt), (changed = true);
      if (changed) this.clampLay();
    }
  }

  private clampLay(): void {
    this.dy = Math.max(-40, Math.min(40, this.dy));
    this.angle = Math.max(-0.4, Math.min(0.4, this.angle));
    this.lay();
  }

  private moveTo(p: [number, number], draw: boolean): void {
    const next: [number, number] = [Math.max(20, Math.min(1260, p[0])), Math.max(20, Math.min(520, p[1]))];
    if (draw) this.stroke(this.pen, next);
    this.pen = next;
    this.pencil.position.set(...next);
  }

  private keyDown(e: KeyboardEvent): void {
    if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (this.phase === 'shade' || this.phase === 'lay') {
        e.preventDefault();
        this.finishPhase();
      }
      return;
    }
    if (e.code === 'Space' && this.phase === 'shade') {
      e.preventDefault();
      this.keyDraw = true;
      return;
    }
    if (e.code.startsWith('Arrow') && (this.phase === 'shade' || this.phase === 'lay')) {
      e.preventDefault();
      this.held.add(e.code);
    }
  }

  private pointer(e: PointerEvent): void {
    const target = e.target as Element | null;
    if (target?.closest?.('.duty-plate')) return;
    const [x, y] = this.scene.toRef(e.clientX, e.clientY);
    if (this.phase === 'shade') {
      if (e.type === 'pointerdown' && e.button === 0) this.pressed = true;
      if (e.type === 'pointerup') this.pressed = false;
      this.moveTo([x, y], this.pressed && e.type === 'pointermove');
    } else if (this.phase === 'lay') {
      if (e.type === 'pointerdown' && e.button === 0) this.pressed = true;
      if (e.type === 'pointerup') this.pressed = false;
      if (e.type === 'pointermove' && this.pressed) {
        this.dy = y - ROW.y;
        this.clampLay();
      }
    }
  }

  private wheel(e: WheelEvent): void {
    if (this.phase !== 'lay') return;
    e.preventDefault();
    this.angle += Math.sign(e.deltaY) * 0.02;
    this.clampLay();
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

/** The sheet's outline as a clip path; with `around`, the table around it (a ring for the even–odd rule). */
function path(poly: readonly Pt[], around: number): Path2D {
  const p = new Path2D();
  if (around) {
    const r = 13 * BIG.scale + around;
    p.rect(-r, -r, 2 * r, 2 * r);
  }
  poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

/** The table from above: the poster's red cloth and slogan, the truth's dark wood under the lamp. */
function buildTable(L: Layers, t: number): void {
  const { poster, truth, shadows } = L;
  poster.addChild(new Graphics().rect(0, 0, 1280, 720).fill(POSTER.cream));
  const cloth = new Graphics().rect(30, 30, 1220, 500).fill(POSTER.red);
  cloth.position.set(3, 2);
  poster.addChild(cloth, new Graphics().rect(30, 30, 1220, 500).stroke({ width: 6, color: POSTER.black }));
  const big = { fontFamily: 'Rubik Mono One, Arial Black, sans-serif', fontSize: 30, fill: POSTER.cream, letterSpacing: 1 };
  const one = new Text({ text: 'ЛИСТОК К ЛИСТКУ —', style: big });
  one.position.set(660, 92);
  const two = new Text({ text: 'РЯД К РЯДУ!', style: { ...big, fill: POSTER.black } });
  two.position.set(660, 134);
  poster.addChild(one, two);

  const wood = new Graphics().rect(0, 0, 1280, 720).fill(0x3b2d22);
  const r = seededRng(9);
  for (let i = 0; i < 46; i++) {
    const y = r() * 540;
    wood.moveTo(0, y).bezierCurveTo(400, y + (r() - 0.5) * 30, 900, y + (r() - 0.5) * 30, 1280, y + (r() - 0.5) * 20).stroke({ width: 1 + r() * 2, color: 0x2a1f17, alpha: 0.5 });
  }
  truth.addChild(wood);
  const glow = new Sprite(glowTexture(256));
  glow.anchor.set(0.5);
  glow.position.set(560, 220);
  glow.width = 1500;
  glow.height = 1000;
  glow.tint = rgb(TRUTH.lamp);
  glow.alpha = 0.36 - 0.12 * smooth(0.5, 1, t);
  truth.addChild(glow);
  truth.addChild(shadows);
}

/** One sheet already shaded and laid by someone else: black in the poster, graphite in the truth. */
function rowSheet(L: Layers, x: number, y: number, seed: number): void {
  const flat = sheetShape(seed).flatMap(([px, py]) => [px * ROW.scale, py * ROW.scale]);
  const at = (g: Graphics, dx = 0, dy = 0) => {
    g.position.set(x + dx, y + dy);
    return g;
  };
  L.poster.addChild(at(new Graphics().poly(flat).fill(POSTER.black).stroke({ width: 3, color: POSTER.cream })));
  L.shadows.addChild(at(new Graphics().poly(flat).fill(0x000000), 5, 6));
  // Shaded already: graphite over the paper, a few strokes showing through.
  const g = at(new Graphics().poly(flat).fill(0xcfc6b2).poly(flat).fill({ color: 0x4f4b46, alpha: 0.55 }));
  const r = seededRng(seed * 7);
  for (let i = 0; i < 9; i++) {
    const yy = -30 + i * 7.5;
    g.moveTo(-28 + r() * 6, yy).lineTo(28 - r() * 6, yy + (r() - 0.5) * 3);
  }
  g.stroke({ width: 3, color: 0x3a3733, alpha: 0.5 });
  L.truth.addChild(g);
}
