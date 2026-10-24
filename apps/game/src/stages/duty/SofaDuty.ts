/**
 * «Переставить мебель» (concept «Наряды»): the main duty and the game's main comedy. Two soldiers carry a
 * heavy sofa under the general's spoken orders, as muddled as in the tunnel: «на два шага влево»,
 * «отставить», «на место». A peaceful training for the striker: orders come as words, the player acts on
 * keys, and the partner at the other end does it his own way, a moment late. Out of step, the sofa strains
 * and drops. In the end everything goes back «на место».
 */
import { Container, Graphics, Text } from 'pixi.js';
import { smooth } from '../../core/rng.ts';
import { SOLDIERS } from '../../content/soldiers.ts';
import { BattleSound } from '../../engine/spatial.ts';
import { POSTER, TRUTH } from '../../render/palette.ts';
import type { Hole } from '../../render/tears.ts';
import { h, isTyping } from '../../ui/dom.ts';
import { Carrier, CarrierTrio, HOLD } from './carrier.ts';
import { DutyScene, finish, lamp, rgb, type Layers } from './scene.ts';
import { SofaModel, type Action, type Order, type SofaEvent } from './sofaModel.ts';
import { registerAgent } from '../../agent/hooks.ts';
import type { DutyContext, DutyResult } from './types.ts';
import { hintFor } from '../../engine/keys.ts';

const FLOOR = 470;
const STEP = 64;
/** Where the carriers stand with the sofa «на месте»: the player at the left end, the partner at the right. */
const HOME_P = 440;
const HOME_Q = 840;
const CARRIER_SCALE = 1.7;
/** The sofa, scaled from the prototype's cut-out: back, seat, two arms. */
const SOFA_SCALE = 2.2;
const SOFA_W = 146 * SOFA_SCALE;
const SOFA_H = 44 * SOFA_SCALE;
/** How high the sofa rides when carried. */
const LIFT = 46;

/** A dropped sofa rocks: one end jumps, then the other, then it settles. */
const BOUNCE = [0.06, -0.035, 0.015];

/** Carrier poses: arms on the armrests, or holding the sofa up. */
const ARMS_DOWN = HOLD + 0.38;
const ARMS_UP = HOLD - 0.12;

const KEYS: Record<string, Action> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'lift',
  ArrowUp: 'lift',
  KeyS: 'lower',
  ArrowDown: 'lower',
};

/** The poster frays at the edges first; the sofa goes last. */
const HOLES: readonly Hole[] = [
  { x: 1250, y: 300, start: 0.04, max: 140 },
  { x: 40, y: 610, start: 0.07, max: 120 },
  { x: 300, y: 70, start: 0.12, max: 420 },
  { x: 1120, y: 520, start: 0.2, max: 520 },
  { x: 640, y: 250, start: 0.35, max: 640 },
  { x: 120, y: 420, start: 0.42, max: 560 },
  { x: 920, y: 60, start: 0.5, max: 600 },
];

const POSTER_COLORS = { body: POSTER.black, seam: POSTER.cream, eye: POSTER.cream };
const TRUTH_COLORS = { body: TRUTH.cut, seam: 0x1b1815, eye: TRUTH.eye };
const SHADOW_COLORS = { body: 0x000000, seam: 0x000000, eye: 0x000000 };

/** The general's lines. Dry formulas; they repeat on purpose. */
const SAY = {
  intro: 'Наряд: переставить мебель. Диван.',
  pair: (name: string) => `Двое. ${name} — правый край. Второй — левый.`,
  lift: 'Поднять.',
  left2: 'Диван — на два шага влево.',
  cancel: 'Отставить.',
  right1: 'Диван — на шаг вправо.',
  back2: 'Отставить. На два шага влево. Как было сказано.',
  lower: 'Опустить.',
  think: 'Так.',
  home: 'На место.',
  long: 'Долго.',
  drop: ['Уронили. Поднять.', 'Диван — не тварь. Его не давят. Поднять.', 'Поднять. Молча.'],
  early: 'Без команды не ходить.',
  drag: 'Не волочь. Нести.',
  done: 'Диван — на месте. Наряд — выполнен.',
  good: 'Удовлетворительно.',
  fair: 'Удовлетворительно. С натяжкой.',
  bad: 'Отставить диван. Отставить вас.',
};

/** How the partner's end goes: a careful soldier is a little later than the rest. */
function paceOf(partner: string): { react: number; step: number } {
  return partner === 'norkin' ? { react: 0.65, step: 0.55 } : { react: 0.45, step: 0.5 };
}

/** `name` is what the partner goes by now (a face keeps its puppet after a new name: Сырков's is Пышкин's). */
export async function runSofa(ctx: DutyContext, partner: string, name?: string): Promise<DutyResult> {
  const duty = new Sofa(ctx, partner, name);
  try {
    return await duty.run();
  } finally {
    duty.destroy();
  }
}

/** One end of the sofa as drawn: where its carrier stands and how high it holds, both moving in cut-out steps. */
interface End {
  x: number;
  lift: number;
  /** The shuffle of the feet while stepping: 0 still, ±1 mid-step. */
  step: number;
}

class Sofa {
  private readonly ctx: DutyContext;
  private readonly scene: DutyScene;
  private readonly model: SofaModel;
  private readonly sound: BattleSound;
  private readonly name: string;
  private readonly player: CarrierTrio;
  private readonly partner: CarrierTrio;
  private readonly sofas: Container[] = [];
  private readonly pEnd: End = { x: HOME_P, lift: 0, step: 0 };
  private readonly qEnd: End = { x: HOME_Q, lift: 0, step: 0 };
  private dropLine = 0;
  private said = { early: false, drag: false };
  private partnerBarked = false;
  /** Frame of the rocking after a drop (BOUNCE.length when still). */
  private bounce = BOUNCE.length;
  private readonly onKey = (e: KeyboardEvent) => this.key(e);
  private readonly offAgent: () => void;
  /** Agent mode: carry the sofa for the player, following the partner's end. */
  private auto = false;
  private autoAt = 0;

  constructor(ctx: DutyContext, partner: string, name?: string) {
    this.ctx = ctx;
    this.name = name ?? SOLDIERS[partner]?.name ?? partner;
    this.model = new SofaModel(paceOf(partner), ctx.settings.noTimer);
    this.sound = new BattleSound(ctx.audio);
    this.scene = new DutyScene(ctx, HOLES);
    const L = this.scene.layers;
    buildRoom(L, ctx.t);
    // The sofa goes in before the carriers, so their hands lie over the armrests.
    this.sofas.push(sofaCut(POSTER.red, POSTER.black, true), sofaCut(sofaTruth(ctx.t), 0x2a1f1a, false), sofaCut(0x000000, 0x000000, false));
    L.poster.addChild(this.sofas[0]!);
    L.truth.addChild(this.sofas[1]!);
    L.shadows.addChild(this.sofas[2]!);
    this.player = trio(L, HOME_P, true);
    this.partner = trio(L, HOME_Q, false);
    finish(L, FLOOR, 21);

    this.scene.plate(
      'duty-keys',
      h('p', { class: 'who', text: 'Ты — левый край дивана.' }),
      h('p', {}, h('kbd', { text: hintFor('KeyA') }), ' ', h('kbd', { text: hintFor('KeyD') }), ' или ', h('kbd', { text: '←' }), ' ', h('kbd', { text: '→' }), ' — шаг'),
      h('p', {}, h('kbd', { text: hintFor('KeyW') }), ' или ', h('kbd', { text: '↑' }), ' — поднять, ', h('kbd', { text: hintFor('KeyS') }), ' или ', h('kbd', { text: '↓' }), ' — опустить'),
    );
    this.scene.onTick((dt) => this.handle(this.model.tick(dt)));
    this.scene.onFrame(() => this.animate());
    this.animate();
    window.addEventListener('keydown', this.onKey);
    // For the dev page's robot (stripped from the build).
    if (import.meta.env.DEV) Reflect.set(window, '__sofa', this.model);
    this.offAgent = this.agent();
  }

  /** Agent mode (agent/hooks.ts): the order and both ends in words; steps as actions, or the whole carry. */
  private agent(): () => void {
    const m = this.model;
    const what = (o: Order | null) => (!o ? 'нет' : o.kind === 'lift' ? 'поднять' : o.kind === 'lower' ? 'опустить' : o.to === 0 ? 'на место' : `${Math.abs(o.to)} ${Math.abs(o.to) === 1 ? 'шаг' : 'шага'} ${o.to < 0 ? 'влево' : 'вправо'} от места`);
    const end = (step: number, up: boolean) => `${step === 0 ? 'на месте' : `${Math.abs(step)} ${step < 0 ? 'влево' : 'вправо'}`}, ${up ? 'поднят' : 'стоит на полу'}`;
    const mine = () => {
      const o = m.order;
      return !o || (o.kind === 'lift' ? m.lp : o.kind === 'lower' ? !m.lp : m.p === o.to && m.lp);
    };
    const act = (a: Action) => this.handle(m.act(a));
    return registerAgent({
      name: 'Наряд: переставить диван',
      describe: () => [`Приказ генерала: ${what(m.order)}.`, `Ваш левый край: ${end(m.p, m.lp)}. Правый край, ${this.name}: ${end(m.q, m.lq)}.`, 'Несут вдвоём: поднимать, шагать и опускать надо вместе с напарником, иначе диван перекосит или уронят.'],
      actions: () =>
        m.order && !this.auto
          ? [
              { id: 'lift', label: 'Поднять свой край' },
              { id: 'lower', label: 'Опустить свой край' },
              { id: 'left', label: 'Шаг влево' },
              { id: 'right', label: 'Шаг вправо' },
              { id: 'auto', label: 'Нести, как велит генерал, до конца наряда (подстраиваясь под напарника)' },
            ]
          : [],
      perform: (id) => {
        if (id === 'auto') return ((this.auto = true), 'Несёте диван вместе с напарником.');
        if (id === 'lift' || id === 'lower' || id === 'left' || id === 'right') return (act(id), 'Сделано.');
        return null;
      },
      busy: () => this.auto && m.order !== null,
      waiting: () => !this.auto && m.order !== null && !mine(),
      poll: () => {
        if (!this.auto || !m.order || performance.now() < this.autoAt) return;
        this.autoAt = performance.now() + 180;
        // Follow the partner's end: up when he is up, a step his way; the order itself once he has done it.
        const o = m.order;
        if (m.lq !== m.lp) act(m.lq ? 'lift' : 'lower');
        else if (m.q < m.p) act('left');
        else if (m.q > m.p) act('right');
        else if (!mine()) {
          if (o.kind === 'lift') act('lift');
          else if (o.kind === 'lower') act('lower');
          else if (!m.lp) act('lift');
          else act(o.to < m.p ? 'left' : 'right');
        }
      },
    });
  }

  async run(): Promise<DutyResult> {
    const s = this.scene;
    await s.talk(SAY.intro);
    await s.talk(SAY.pair(this.name));
    await this.order({ kind: 'lift' }, SAY.lift);
    // The twist: halfway into «два шага влево» the general changes his mind.
    await this.order({ kind: 'move', to: -2 }, SAY.left2, { at: () => this.model.q <= -1, order: { kind: 'move', to: 0 }, line: SAY.cancel });
    await this.order({ kind: 'move', to: 1 }, SAY.right1);
    await this.order({ kind: 'move', to: -2 }, SAY.back2);
    await this.order({ kind: 'lower' }, SAY.lower);
    await s.sleep(0.8);
    await s.talk(SAY.think, { timeoutMs: 1200 });
    await this.order({ kind: 'lift' }, SAY.lift);
    await this.order({ kind: 'move', to: 0 }, SAY.home);
    await this.order({ kind: 'lower' }, SAY.lower);
    this.model.order = null;
    await s.until(() => this.settled(), 2);

    const m = this.model;
    const score = m.score();
    await s.talk(SAY.done);
    await s.talk(m.drops === 0 && score >= 0.85 ? SAY.good : score >= 0.5 ? SAY.fair : SAY.bad);
    return {
      score,
      notes: { drops: m.drops, early: m.early, led: m.led, followed: m.followed, strained: Math.round(m.strained * 10) / 10, seconds: Math.round(s.now) },
    };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.offAgent();
    this.scene.destroy();
  }

  /**
   * Gives an order and waits until both have carried it out (or, timed, until it took too long).
   * `twist`: once its condition holds, the general takes it back and gives another order instead.
   */
  private async order(order: Order, line: string, twist?: { at: () => boolean; order: Order; line: string }): Promise<void> {
    const s = this.scene;
    const timed = !this.ctx.settings.noTimer;
    this.model.give(order);
    void s.talk(line, { timeoutMs: 1700 });
    if (twist) {
      const turned = await s.until(() => twist.at() || this.model.done(), timed ? 10 : Infinity);
      if (turned && !this.model.done()) {
        this.model.give(twist.order);
        void s.talk(twist.line, { timeoutMs: 1400 });
      }
    }
    const ok = await s.until(() => this.model.done() && this.settled(), timed ? 10 : Infinity);
    if (!ok) {
      // Too slow: the general says so, and the sofa is where it was meant to be anyway.
      await s.talk(SAY.long, { timeoutMs: 1200 });
      this.force(this.model.order ?? order);
    }
  }

  /** Puts the model where the order wanted it, for an order that took too long. */
  private force(o: Order): void {
    const m = this.model;
    if (o.kind === 'move') {
      m.p = m.q = o.to;
      m.lp = m.lq = true;
    } else m.lp = m.lq = o.kind === 'lift';
  }

  /** The drawn ends have caught up with the model. */
  private settled(): boolean {
    const m = this.model;
    return this.pEnd.x === HOME_P + m.p * STEP && this.qEnd.x === HOME_Q + m.q * STEP && this.pEnd.lift === (m.lp ? 1 : 0) && this.qEnd.lift === (m.lq ? 1 : 0);
  }

  private key(e: KeyboardEvent): void {
    const a = KEYS[e.code];
    if (!a || e.repeat || isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    this.handle(this.model.act(a));
  }

  private handle(ev: readonly SofaEvent[]): void {
    for (const e of ev) {
      switch (e.t) {
        case 'step':
          this.sound.step(undefined, e.who === 'player' ? 0.26 : 0.18);
          break;
        case 'lift':
          this.creak(true);
          break;
        case 'lower':
          this.creak(false);
          break;
        case 'blocked':
          this.sound.noise({ dur: 0.25, freq: 240, gain: 0.25 });
          if (!this.said.drag) {
            this.said.drag = true;
            void this.scene.talk(SAY.drag, { timeoutMs: 1500 });
          }
          break;
        case 'early':
          if (!this.said.early) {
            this.said.early = true;
            void this.scene.talk(SAY.early, { timeoutMs: 1500 });
          }
          break;
        case 'drop':
          this.drop();
          break;
      }
    }
  }

  private drop(): void {
    // Both ends land at once: snap the drawing to the floor, then thud.
    this.pEnd.lift = 0;
    this.qEnd.lift = 0;
    this.sound.thud();
    this.sound.sag();
    this.scene.shake(0.55);
    this.bounce = 0;
    this.draw();
    if (!this.partnerBarked) {
      this.partnerBarked = true;
      void this.scene.talk('Ничего. Поднимаем.', { speaker: this.name, timeoutMs: 1500 });
    }
    void this.scene.talk(SAY.drop[this.dropLine++ % SAY.drop.length]!, { timeoutMs: 1800 });
  }

  /** The springs: up a little, down a little. */
  private creak(up: boolean): void {
    this.sound.tone({ freq: up ? 280 : 360, to: up ? 420 : 240, type: 'triangle', dur: 0.22, gain: 0.05 });
  }

  /** One 12 fps frame: each end moves toward the model by a cut-out step, and the sofa follows the hands. */
  private animate(): void {
    const m = this.model;
    if (this.bounce < BOUNCE.length) this.bounce++;
    const move = (end: End, x: number, up: boolean) => {
      const dx = x - end.x;
      end.step = dx === 0 ? 0 : end.step === 1 ? -1 : 1;
      end.x += Math.sign(dx) * Math.min(Math.abs(dx), 16);
      const lift = up ? 1 : 0;
      end.lift = Math.abs(lift - end.lift) < 0.34 ? lift : end.lift + Math.sign(lift - end.lift) * 0.34;
    };
    move(this.pEnd, HOME_P + m.p * STEP, m.lp);
    move(this.qEnd, HOME_Q + m.q * STEP, m.lq);
    this.draw();
  }

  /** Puts the carriers and the sofa where the ends are; a dropped sofa rocks on the floor for a few frames. */
  private draw(): void {
    // Out of step, the one pulled along leans toward the other, the one pulling leans back.
    const strain = Math.sign(this.qEnd.x - HOME_Q - (this.pEnd.x - HOME_P));
    const arms = (end: End) => ARMS_DOWN + (ARMS_UP - ARMS_DOWN) * end.lift;
    this.player.place(this.pEnd.x, this.pEnd.step ? 3 : 0);
    this.player.set({ arms: arms(this.pEnd), lean: 0.12 * strain, step: this.pEnd.step });
    this.partner.place(this.qEnd.x, this.qEnd.step ? 3 : 0);
    this.partner.set({ arms: arms(this.qEnd), lean: -0.12 * strain, step: this.qEnd.step });

    const yl = FLOOR - LIFT * this.pEnd.lift;
    const yr = FLOOR - LIFT * this.qEnd.lift;
    const cx = (this.pEnd.x + this.qEnd.x) / 2;
    const tilt = Math.atan2(yr - yl, SOFA_W) + 0.05 * strain + (BOUNCE[this.bounce] ?? 0);
    this.sofas.forEach((sofa, i) => {
      const off = i === 2 ? 6 : 0;
      sofa.position.set(cx + off, (yl + yr) / 2 + off);
      sofa.rotation = tilt;
    });
  }
}

/** The sofa as a cut-out, pivoting at the middle of its bottom edge. The poster prints its red a little off register. */
function sofaCut(fill: number, line: number, poster: boolean): Container {
  const c = new Container();
  const w = SOFA_W;
  const s = SOFA_SCALE;
  const shape = (g: Graphics) =>
    g
      .rect(8 * s, 0, 130 * s, 24 * s)
      .rect(8 * s, 22 * s, 130 * s, 20 * s)
      .rect(0, 10 * s, 14 * s, 34 * s)
      .rect(132 * s, 10 * s, 14 * s, 34 * s);
  if (poster) {
    const red = shape(new Graphics()).fill(fill);
    red.position.set(3, 2);
    c.addChild(red, shape(new Graphics()).stroke({ width: 4, color: line }));
    // Buttons on the back, cushion seam: what makes it a sofa at a glance.
    c.addChild(new Graphics().moveTo(8 * s, 22 * s).lineTo(138 * s, 22 * s).stroke({ width: 3, color: line }));
  } else {
    c.addChild(shape(new Graphics()).fill(fill));
    if (line !== 0x000000) {
      const seams = new Graphics().moveTo(8 * s, 22 * s).lineTo(138 * s, 22 * s).moveTo(73 * s, 22 * s).lineTo(73 * s, 42 * s).stroke({ width: 2, color: line, alpha: 0.6 });
      for (let i = 1; i < 5; i++) seams.circle(8 * s + (130 * s * i) / 5, 11 * s, 2.2).fill({ color: line, alpha: 0.7 });
      c.addChild(seams);
    }
  }
  for (const g of c.children) g.position.x -= w / 2;
  for (const g of c.children) g.position.y -= SOFA_H;
  return c;
}

/** The sofa's cloth: brick red at first, greying as the poster comes off (as in red-glasses.html). */
function sofaTruth(t: number): number {
  const k = smooth(0.25, 0.9, t);
  const a = [122, 59, 48] as const;
  const b = [86, 78, 72] as const;
  return rgb([Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)]);
}

function trio(L: Layers, x: number, faceRight: boolean): CarrierTrio {
  const parts = [new Carrier(POSTER_COLORS), new Carrier(TRUTH_COLORS), new Carrier(SHADOW_COLORS)];
  L.poster.addChild(parts[0]!.root);
  L.truth.addChild(parts[1]!.root);
  L.shadows.addChild(parts[2]!.root);
  return new CarrierTrio(parts, x, FLOOR, CARRIER_SCALE, faceRight);
}

/** The bedroom end of the barracks: a bunk on the left, the doorway and the tape recorder on the right, the lamp. */
function buildRoom(L: Layers, t: number): void {
  const { poster, truth, shadows } = L;
  const bunk = (g: Graphics, line: number, mats: number, stroke: boolean) => {
    const x = 40;
    const w = 240;
    const top = FLOOR - 246;
    g.rect(x, top, 9, 246).rect(x + w - 9, top, 9, 246).rect(x, top + 54, w, 14).rect(x, top + 166, w, 14).rect(x, top - 3, w, 8);
    if (stroke) g.stroke({ width: 5, color: line });
    else g.fill(line);
    g.rect(x + 10, top + 36, w - 20, 18).rect(x + 10, top + 148, w - 20, 18).fill(mats);
    if (stroke) g.rect(x + 10, top + 36, w - 20, 18).rect(x + 10, top + 148, w - 20, 18).stroke({ width: 3, color: line });
    return g;
  };
  const door = (g: Graphics, frame: number, dark: number) => g.rect(1060, FLOOR - 270, 150, 270).fill(frame).rect(1076, FLOOR - 254, 118, 254).fill(dark);
  const stand = (g: Graphics, wood: number, deck: number) =>
    g.rect(952, FLOOR - 70, 70, 70).fill(wood).rect(946, FLOOR - 108, 82, 38).fill(deck).rect(966, FLOOR - 116, 42, 8).fill(deck);

  // ---- poster: cream, a red wedge of lamp light, black outlines, a slogan ----
  poster.addChild(new Graphics().rect(0, 0, 1280, 720).fill(POSTER.cream));
  const wedge = new Graphics().poly([520, 4, 760, 4, 900, FLOOR]).fill(POSTER.red);
  wedge.position.set(3, 2);
  poster.addChild(wedge);
  poster.addChild(new Graphics().rect(0, FLOOR, 1280, 26).fill(POSTER.black));
  poster.addChild(bunk(new Graphics(), POSTER.black, POSTER.cream, true));
  poster.addChild(door(new Graphics(), POSTER.black, POSTER.red));
  poster.addChild(stand(new Graphics(), POSTER.black, POSTER.black));
  poster.addChild(new Graphics().circle(974, FLOOR - 89, 9).circle(1000, FLOOR - 89, 9).fill(POSTER.cream));
  // The slogan sits clear of the lamp's wedge and the HUD, over the doorway.
  const big = { fontFamily: 'Rubik Mono One, Arial Black, sans-serif', fontSize: 26, fill: POSTER.black, letterSpacing: 1 };
  const one = new Text({ text: 'ДИВАН —', style: big });
  one.position.set(806, 46);
  const two = new Text({ text: 'НА ДВА ШАГА ВЛЕВО!', style: { ...big, fill: POSTER.red } });
  two.position.set(806, 84);
  poster.addChild(one, two);

  // ---- truth: a warm wall in strips, the same furniture as dark wood ----
  truth.addChild(new Graphics().rect(0, 0, 1280, 720).fill(0x3f3a36));
  truth.addChild(new Graphics().rect(0, 0, 1280, FLOOR).fill({ color: 0x5a4a3c, alpha: 0.55 }));
  const strips = new Graphics();
  for (let i = 0; i < 9; i++) strips.rect(i * 150 - 20 + ((i * 37) % 13), 0, 136, FLOOR).fill({ color: TRUTH.strip, alpha: i % 2 ? 0.16 : 0.1 });
  truth.addChild(strips);
  lamp(L, 640);
  truth.addChild(new Graphics().rect(0, FLOOR + 2, 1280, 720 - FLOOR).fill(TRUTH.floor));
  truth.addChild(shadows);
  shadows.addChild(bunk(new Graphics(), 0x000000, 0x000000, false).rect(1060, FLOOR - 270, 150, 270).fill(0x000000).rect(952, FLOOR - 108, 82, 108).fill(0x000000));
  for (const s of shadows.children) s.position.set(6, 6);
  truth.addChild(bunk(new Graphics(), 0x4a3a2e, 0x7d6c58, false));
  truth.addChild(door(new Graphics(), 0x4a3a2e, 0x1c1916));
  truth.addChild(stand(new Graphics(), 0x5b4636, 0x2f3033));
  truth.addChild(new Graphics().circle(974, FLOOR - 89, 8).circle(1000, FLOOR - 89, 8).fill(0xc9c2b4));
  // A greying of the light as the poster comes off.
  if (t > 0.5) truth.addChild(new Graphics().rect(0, 0, 1280, 720).fill({ color: 0x2c3440, alpha: 0.18 * smooth(0.5, 1, t) }));
}
