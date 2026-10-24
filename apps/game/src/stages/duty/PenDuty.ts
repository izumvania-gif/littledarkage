/**
 * «Собрать и разобрать ручку на время» (concept «Наряды»): an automatic ballpoint taken apart and put back
 * together on the general's stopwatch, part by part in order. The twist: unscrewing the tip lets the spring
 * jump onto the floor, and it has to be found. Blindfolded (cycle 2) the picture is black: the hand feels its
 * way along the pen and over the cloth, what it touches is described, never named, the spring is found by
 * where it rang, the general mixes the parts before they go back, and only the click says a part went in.
 * A peaceful training for the blind striker: touch, sound, an order learned by heart.
 */
import { Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js';
import { seededRng, smooth } from '../../core/rng.ts';
import { captionsOn } from '../../core/settings.ts';
import { BattleSound, where, type Spot } from '../../engine/spatial.ts';
import { glowTexture, grainTexture } from '../../render/kit.ts';
import { CAPTION_TOP, POSTER, REF_W, TRUTH } from '../../render/palette.ts';
import type { Hole } from '../../render/tears.ts';
import { h, isTyping } from '../../ui/dom.ts';
import { DIMS, drawPart, drawPaw, drawSleeve, EXPOSED, RETRACT, type Print } from './pen/penArt.ts';
import { ASSEMBLY, PART_FEEL, PART_NAMES, PEN_LIMIT, PEN_NORM, PenModel, penScore, secondsSaid, tableSpots, type PartId, type PenEvent } from './pen/penModel.ts';
import { DutyScene, finish, FRAME, rgb, type Layers } from './scene.ts';
import type { DutyContext, DutyResult } from './types.ts';
import './pen/pen.css';
import { registerAgent } from '../../agent/hooks.ts';
import { hintFor } from '../../engine/keys.ts';

/** The pen in the hand, lying across the cloth: its button end and its axis. */
const PEN = { x: 320, y: 180 };
/** The cloth, and the floor below the table's edge where the spring rolls. */
const TABLE = { x0: 40, x1: 1240, y0: 24, y1: 470 };
const FLOOR_SPOTS: readonly [number, number][] = [
  [150, 507],
  [1130, 511],
  [430, 513],
  [960, 505],
];
/** Where the parts lie in a row as they come off, and the long refill below them. */
const ROW_SMALL = { x0: 420, x1: 880, y0: 318, y1: 318 };
const REFILL_SPOT: [number, number] = [650, 426];
/** The general mixes the small parts over this much of the cloth. */
const MIXED = { x0: 290, x1: 1010, y0: 296, y1: 384 };
/** The hand: how fast the keys move it, and how close counts as touching. */
const HAND_SPEED = 420;
const TOUCH = 10;

const HOLES: readonly Hole[] = [
  { x: 1250, y: 470, start: 0.04, max: 150 },
  { x: 30, y: 60, start: 0.08, max: 140 },
  { x: 1180, y: 60, start: 0.13, max: 380 },
  { x: 90, y: 420, start: 0.2, max: 480 },
  { x: 640, y: 520, start: 0.3, max: 560 },
  { x: 860, y: 90, start: 0.4, max: 600 },
  { x: 640, y: 200, start: 0.55, max: 700 },
];

/** The general's lines: dry formulas, repeated on purpose. */
const SAY = {
  intro: 'Наряд: ручка. Разобрать и собрать. На время.',
  order: 'Разбирать — с наконечника. Собирать — с кнопки.',
  blindfold: 'Глаза — завязать.',
  byFeel: 'Разбирать — с наконечника. Собирать — с кнопки. На ощупь. По щелчкам.',
  go: 'Секундомер. Пошёл.',
  spring: 'Пружина — на полу. Найти.',
  mix: 'Детали перемешаю. Чтобы не по памяти.',
  together: 'Собрать.',
  check: 'Проверить. Щёлкнуть.',
  hurry: 'Быстрее.',
  ten: 'Десять секунд.',
  time: 'Время. Дай сюда.',
  took: 'Вот так.',
  unblind: 'Повязку — снять.',
  held: (by: PartId) => [`По порядку. Сначала — ${PART_NAMES[by]}.`, 'По порядку.', 'Не ломать.'],
  wrong: (want: PartId) => ['Не лезет — значит, не та.', `Сначала — ${PART_NAMES[want]}.`, 'По порядку.'],
  stop: (s: number) => `Стоп. ${secondsSaid(s)}.`,
  good: 'Удовлетворительно.',
  fair: 'Удовлетворительно. С натяжкой.',
  bad: (norm: number) => `Норматив — ${secondsSaid(norm)}. Учиться.`,
};

/** What the fingers find where there is no part. */
const FEEL_PLACE = {
  cloth: 'Сукно.',
  floor: 'Пол. Доски, пыль.',
  edge: 'Край стола.',
  empty: 'Пусто.',
  bodyHeld: 'Корпус. В руке.',
  stuck: 'Не поддаётся.',
  noFit: 'Не лезет.',
};

const KEYS_MOVE: Record<string, [number, number]> = {
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
};
const KEYS_TAKE = new Set(['KeyE', 'Space', 'Enter', 'NumpadEnter']);

export async function runPen(ctx: DutyContext, opts: { blind: boolean }): Promise<DutyResult> {
  const duty = new Pen(ctx, opts.blind);
  try {
    return await duty.run();
  } finally {
    duty.destroy();
  }
}

/** A part as drawn: three prints moving together, stepping toward where it should be at 12 fps. */
interface Cut {
  prints: Container[];
  x: number;
  y: number;
  rot: number;
  tween: { fx: number; fy: number; fr: number; tx: number; ty: number; tr: number; frames: number; i: number; arc: number } | null;
}

/** A place the hand can touch: a part's axis from a to b, so thick. */
interface Zone {
  part: PartId;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

const PARTS: readonly PartId[] = ['refill', 'spring', 'button', 'body', 'tip'];

class Pen {
  private readonly ctx: DutyContext;
  private readonly blind: boolean;
  private readonly scene: DutyScene;
  private readonly model = new PenModel();
  private readonly sound: BattleSound;
  private readonly cuts = new Map<PartId, Cut>();
  private readonly spots: Partial<Record<PartId, [number, number, number]>> = {};
  private readonly landing: [number, number, number];
  private readonly sleeves: Graphics[] = [];
  private readonly paws: Graphics[] = [];
  private readonly blindfold = new Container();
  private readonly outline = new Graphics();
  private readonly keysPlate: HTMLElement;
  private readonly orderLine: HTMLElement;
  private readonly watch: HTMLElement;
  private readonly touchPlate: HTMLElement;
  /** Where the hand is meant to be (pointer or keys) and where it is drawn (catching up in cut-out steps). */
  private hand: [number, number] = [640, 420];
  private drawn: [number, number] = [640, 420];
  private curl = 0;
  private clicked = false;
  private working = false;
  private busy = false;
  private t0 = 0;
  private lastSecond = -1;
  private felt = '';
  private barking = false;
  private nHeld = 0;
  private nWrong = 0;
  private said = { hurry: false, ten: false };
  private dark = 0;
  private readonly held = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent) => this.held.delete(e.code);
  private offAgent: () => void = () => undefined;
  /** Agent mode: take the parts in order for the player. */
  private auto = false;
  private readonly onPointer = (e: PointerEvent) => this.pointer(e);
  private readonly cursor: string;

  constructor(ctx: DutyContext, blind: boolean) {
    this.ctx = ctx;
    this.blind = blind;
    this.sound = new BattleSound(ctx.audio);
    this.scene = new DutyScene(ctx, HOLES);
    const rng = seededRng(blind ? 23 : 17);
    const land = FLOOR_SPOTS[Math.floor(Math.random() * FLOOR_SPOTS.length)]!;
    this.landing = [land[0], land[1], 0.4 + rng() * 1.6];

    const L = this.scene.layers;
    buildTable(L, ctx.t);
    // Parts, then the arm over them; poster and truth in the same places, the shadow under the truth.
    const layerOf = (print: Print) => (print === 'poster' ? L.poster : print === 'truth' ? L.truth : L.shadows);
    for (const part of PARTS) {
      const prints = (['poster', 'truth', 'shadow'] as const).map((print) => {
        const c = drawPart(part, print);
        if (print === 'shadow') c.position.set(6, 6);
        layerOf(print).addChild(c);
        return c;
      });
      const [x, y, rot] = this.target(part);
      this.cuts.set(part, { prints, x, y, rot, tween: null });
    }
    for (const print of ['poster', 'truth', 'shadow'] as const) {
      const sleeve = new Graphics();
      const paw = new Graphics();
      layerOf(print).addChild(sleeve, paw);
      this.sleeves.push(sleeve);
      this.paws.push(paw);
    }
    finish(L, TABLE.y1, 33);

    // The blindfold: black over the picture, and the outline of one's own hand.
    this.blindfold.addChild(new Graphics().rect(0, 0, REF_W, CAPTION_TOP).fill(0x050505));
    const weave = new TilingSprite({ texture: grainTexture(160, 41), width: REF_W, height: CAPTION_TOP });
    weave.alpha = 0.05;
    this.blindfold.addChild(weave, this.outline);
    this.blindfold.alpha = 0;
    this.blindfold.visible = false;
    this.scene.overlay.addChild(this.blindfold);

    this.orderLine = h('p', { class: 'pen-order', text: 'Разбирать — с наконечника. Собирать — с кнопки.' });
    this.keysPlate = this.scene.plate(
      'duty-keys',
      h('p', { class: 'who', text: blind ? 'Ручка. Глаза завязаны.' : 'Ручка. Разобрать и собрать.' }),
      h('p', {}, 'Мышь — рука, клик — взять. Или ', h('kbd', { text: '←' }), h('kbd', { text: '↑' }), h('kbd', { text: '↓' }), h('kbd', { text: '→' }), ' и ', h('kbd', { text: hintFor('KeyE') }), '.'),
      this.orderLine,
    );
    this.watch = this.scene.plate('duty-status', '00:00');
    this.watch.setAttribute('aria-hidden', 'true');
    this.watch.hidden = blind;
    this.touchPlate = this.scene.plate('pen-touch');
    this.touchPlate.setAttribute('aria-live', 'polite');

    this.scene.onTick((dt) => this.tick(dt));
    this.scene.onFrame(() => this.frame());
    this.frame();
    this.cursor = document.documentElement.style.cursor;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointermove', this.onPointer);
    window.addEventListener('pointerdown', this.onPointer);
    // For the dev page's robot (stripped from the build).
    if (import.meta.env.DEV) Reflect.set(window, '__pen', { model: this.model, aim: (p: PartId) => this.client(this.aim(p)), busy: () => this.busy || !this.working });
    this.offAgent = this.agent();
  }

  /** Agent mode (agent/hooks.ts): where the parts are, what the fingers feel; taking a part as an action. */
  private agent(): () => void {
    const parts = Object.keys(PART_NAMES) as PartId[];
    const at: Record<string, string> = { pen: 'в ручке', table: 'на столе', floor: 'на полу' };
    const takeAt = (part: PartId) => {
      const [x, y] = this.aim(part);
      this.moveHand(x, y);
      this.take();
    };
    return registerAgent({
      name: this.blind ? 'Наряд: ручка, с завязанными глазами' : 'Наряд: разобрать и собрать ручку',
      describe: () => [
        `Сейчас: ${this.model.phase === 'apart' ? 'разбирать (с наконечника)' : this.model.phase === 'together' ? 'собирать (с кнопки)' : this.model.phase === 'check' ? 'щёлкнуть кнопкой — проверить' : 'готово'}. Ошибок: ${this.model.mistakes}.`,
        this.blind ? `Пальцы: ${this.touchPlate.textContent || '—'}` : `Детали: ${parts.map((p) => `${PART_NAMES[p]} — ${at[this.model.where[p]] ?? this.model.where[p]}`).join('; ')}.`,
      ],
      actions: () =>
        this.working && !this.auto
          ? [...parts.map((p) => ({ id: `take:${p}`, label: `Взять: ${PART_NAMES[p]}` })), { id: 'auto', label: 'Разобрать и собрать по порядку до конца' }]
          : [],
      perform: (id) => {
        if (id === 'auto') return ((this.auto = true), 'Разбираете и собираете по порядку.');
        const part = id.startsWith('take:') ? (id.slice(5) as PartId) : null;
        if (!part || !parts.includes(part)) return null;
        if (!this.working) return 'Сейчас не время.';
        takeAt(part);
        return `Рука на детали: ${PART_NAMES[part]}.`;
      },
      busy: () => this.auto && this.working,
      waiting: () => !this.auto && this.working && !this.busy,
      poll: () => {
        if (!this.auto || !this.working || this.busy) return;
        const next = this.model.next();
        if (next) takeAt(next);
      },
    });
  }

  async run(): Promise<DutyResult> {
    const s = this.scene;
    const timed = !this.ctx.settings.noTimer;
    await s.talk(SAY.intro);
    if (this.blind) {
      await s.talk(SAY.blindfold);
      await this.cover(true);
      await s.talk(SAY.byFeel);
    } else await s.talk(SAY.order);
    void s.talk(SAY.go, { timeoutMs: 1300 });
    this.t0 = s.now;
    this.working = true;
    document.documentElement.style.cursor = 'none';

    const limit = this.blind ? PEN_LIMIT.blind : PEN_LIMIT.sighted;
    const done = await s.until(() => this.model.phase === 'done', timed ? limit : Infinity);
    this.working = false;
    document.documentElement.style.cursor = this.cursor;
    const seconds = Math.max(1, Math.round(s.now - this.t0));
    this.watch.textContent = clock(seconds);
    if (!done) {
      // Too slow: the general takes the pen and puts it together himself, in four moves.
      await s.talk(SAY.time, { timeoutMs: 1500 });
      this.model.finishForThem();
      for (const p of ASSEMBLY) this.fly(p, 5);
      this.sound.noise({ dur: 0.3, freq: 2400, filter: 'bandpass', gain: 0.08 });
      await s.sleep(0.7);
      this.clicked = true;
      this.fly('refill', 2);
      this.clickClack();
      await s.talk(SAY.took, { timeoutMs: 1200 });
    } else await s.talk(SAY.stop(seconds));
    if (this.blind) {
      await s.talk(SAY.unblind, { timeoutMs: 1300 });
      await this.cover(false);
    }
    const m = this.model;
    const score = penScore({ seconds, mistakes: m.mistakes, blind: this.blind, timedOut: !done });
    await s.talk(!done ? SAY.bad(this.blind ? PEN_NORM.blind : PEN_NORM.sighted) : score >= 0.8 ? SAY.good : score >= 0.5 ? SAY.fair : SAY.bad(this.blind ? PEN_NORM.blind : PEN_NORM.sighted));
    return { score, notes: { seconds, mistakes: m.mistakes, dropped: m.dropped, timedOut: !done, blind: this.blind } };
  }

  destroy(): void {
    this.offAgent();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerdown', this.onPointer);
    document.documentElement.style.cursor = this.cursor;
    if (import.meta.env.DEV) Reflect.deleteProperty(window, '__pen');
    this.scene.destroy();
  }

  // ---------- input ----------

  private keyDown(e: KeyboardEvent): void {
    if (!this.working || isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (KEYS_MOVE[e.code]) {
      e.preventDefault();
      this.held.add(e.code);
    } else if (KEYS_TAKE.has(e.code) && !e.repeat) {
      e.preventDefault();
      this.take();
    }
  }

  private pointer(e: PointerEvent): void {
    if (!this.working) return;
    const [x, y] = this.scene.toRef(e.clientX, e.clientY);
    if (y > CAPTION_TOP) return;
    this.moveHand(x, y);
    if (e.type === 'pointerdown' && e.button === 0) this.take();
  }

  private moveHand(x: number, y: number): void {
    this.hand = [Math.max(10, Math.min(REF_W - 10, x)), Math.max(10, Math.min(CAPTION_TOP - 6, y))];
    if (this.blind) this.feel();
  }

  /** The hand closes on whatever it is on. */
  private take(): void {
    if (this.busy) return;
    this.curl = 1;
    const part = this.hit(this.hand[0], this.hand[1]);
    if (!part) {
      if (this.blind) this.touch(this.place(), true);
      return;
    }
    this.handle(this.model.take(part));
  }

  private tick(dt: number): void {
    if (!this.working) return;
    let dx = 0;
    let dy = 0;
    for (const code of this.held) {
      const v = KEYS_MOVE[code];
      if (v) {
        dx += v[0];
        dy += v[1];
      }
    }
    if (dx || dy) {
      const k = HAND_SPEED * dt / Math.hypot(dx, dy);
      this.moveHand(this.hand[0] + dx * k, this.hand[1] + dy * k);
    }
    // The stopwatch: a tick a second, heard blindfolded too.
    const sec = Math.floor(this.scene.now - this.t0);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.watch.textContent = clock(sec);
      if (sec > 0) this.sound.tone({ freq: 3400, dur: 0.018, gain: 0.03, type: 'square' });
      if (!this.ctx.settings.noTimer) {
        const norm = this.blind ? PEN_NORM.blind : PEN_NORM.sighted;
        const limit = this.blind ? PEN_LIMIT.blind : PEN_LIMIT.sighted;
        if (!this.said.hurry && sec >= norm) {
          this.said.hurry = true;
          this.bark(SAY.hurry, 1200);
        }
        if (!this.said.ten && sec >= limit - 10) {
          this.said.ten = true;
          void this.scene.talk(SAY.ten, { timeoutMs: 1300 });
        }
      }
    }
  }

  // ---------- what happened ----------

  private handle(events: readonly PenEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'off':
          this.spots[e.part] = this.rowSpot(e.part);
          this.fly(e.part, 4, 0.25);
          this.offSound(e.part);
          break;
        case 'drop':
          this.drop();
          break;
        case 'found':
          this.spots[e.part] = this.rowSpot(e.part);
          this.fly(e.part, 4, 0.3);
          this.tinkle(this.spot(this.hand[0], this.hand[1]));
          if (this.blind) this.touch(PART_FEEL[e.part], true);
          break;
        case 'on':
          this.fly(e.part, 4, 0.2);
          this.onSound(e.part);
          break;
        case 'held':
          this.sound.noise({ dur: 0.18, freq: 420, gain: 0.12, spot: this.spot(this.hand[0], this.hand[1]) });
          this.bark(SAY.held(e.by)[this.nHeld++ % 3]!);
          if (this.blind) this.touch(FEEL_PLACE.stuck, true);
          break;
        case 'wrong':
          this.knock();
          this.bark(SAY.wrong(e.want)[this.nWrong++ % 3]!);
          if (this.blind) this.touch(FEEL_PLACE.noFit, true);
          break;
        case 'body':
          if (this.blind) this.touch(FEEL_PLACE.bodyHeld, true);
          break;
        case 'click':
          this.clicked = true;
          this.fly('refill', 2);
          this.clickClack();
          break;
        case 'phase':
          if (e.phase === 'together') void this.together();
          else if (e.phase === 'check') {
            this.orderLine.textContent = 'Проверить: щёлкнуть кнопкой.';
            void this.scene.talk(SAY.check, { timeoutMs: 1500 });
          }
          break;
      }
    }
  }

  /** All parts are off: blindfolded, the general mixes them first; then «Собрать». */
  private async together(): Promise<void> {
    this.orderLine.textContent = 'Собирать: кнопка → стержень → пружина → наконечник.';
    if (!this.blind) {
      void this.scene.talk(SAY.together, { timeoutMs: 1200 });
      return;
    }
    this.busy = true;
    await this.scene.talk(SAY.mix, { timeoutMs: 1700 });
    const rng = seededRng(Math.floor(Math.random() * 1e6));
    const small = (['tip', 'spring', 'button'] as const).filter((p) => this.model.where[p] === 'table');
    const mixed = tableSpots(small, rng, MIXED, 130);
    for (const p of small) this.spots[p] = [...mixed[p]!, (rng() - 0.5) * 1.4];
    this.spots.refill = [REFILL_SPOT[0] - 120 + rng() * 240, REFILL_SPOT[1] + 14, (rng() - 0.5) * 0.08];
    for (const p of [...small, 'refill' as const]) this.fly(p, 6, 0.15);
    for (let i = 0; i < 5; i++) this.sound.noise({ dur: 0.06, freq: 2600 + i * 300, filter: 'bandpass', gain: 0.1, at: this.sound.now + i * 0.09, spot: { x: (i - 2) * 0.8, z: 1.2 } });
    await this.scene.sleep(0.7);
    void this.scene.talk(SAY.together, { timeoutMs: 1200 });
    this.felt = '';
    this.busy = false;
  }

  /** The spring jumps out of the barrel, rings on the floor somewhere, and rolls still. */
  private drop(): void {
    const [x, y] = this.landing;
    const at = this.spot(x, y);
    this.fly('spring', 7, 1.4);
    this.sound.twang(this.spot(PEN.x + 530, PEN.y));
    this.sound.tone({ freq: 2100, to: 1700, type: 'triangle', dur: 0.08, gain: 0.12, at: this.sound.now + 0.55, spot: at });
    this.sound.tone({ freq: 2300, to: 1900, type: 'triangle', dur: 0.06, gain: 0.07, at: this.sound.now + 0.74, spot: at });
    this.sound.noise({ dur: 0.5, freq: 3200, filter: 'bandpass', gain: 0.03, at: this.sound.now + 0.8, spot: at });
    this.scene.shake(0.25);
    void this.scene.talk(SAY.spring, { timeoutMs: 1900 });
    if (this.blind || captionsOn(this.ctx.settings)) this.touch(`Звякнуло об пол — ${where(at).split(',')[0]}.`, true, 'Слух:');
  }

  // ---------- touch (blindfolded) ----------

  /** What the hand is on now, said once when it changes. */
  private feel(): void {
    const part = this.hit(this.hand[0], this.hand[1], this.model.where.spring === 'floor' ? 26 : 0);
    const text = part ? (part === 'body' ? FEEL_PLACE.bodyHeld : PART_FEEL[part]) : this.place();
    if (text === this.felt) return;
    this.felt = text;
    this.touch(text, false);
    if (part) this.sound.noise({ dur: 0.07, freq: part === 'spring' ? 5200 : 2600, filter: 'bandpass', gain: 0.05, spot: this.spot(this.hand[0], this.hand[1]) });
  }

  private place(): string {
    const [x, y] = this.hand;
    if (y > TABLE.y1 + 6) return FEEL_PLACE.floor;
    if (y > TABLE.y1 - 10 || x < TABLE.x0 + 8 || x > TABLE.x1 - 8) return FEEL_PLACE.edge;
    return FEEL_PLACE.cloth;
  }

  private touch(text: string, force: boolean, label = 'Пальцы:'): void {
    if (force) this.felt = text;
    this.touchPlate.replaceChildren(h('span', { class: 'what', text: label }), text);
  }

  // ---------- where things are ----------

  /** Where a part should be drawn now: on the pen, on its spot on the cloth, or on the floor. */
  private target(part: PartId): [number, number, number] {
    const at = this.model.where[part];
    if (at === 'floor') return this.landing;
    if (at === 'table') return this.spots[part] ?? this.rowSpot(part);
    const back = part === 'refill' && !this.clicked ? RETRACT : 0;
    return [PEN.x + DIMS[part].center - back, PEN.y, 0];
  }

  /** The part's place in the row it is laid out in as it comes off. */
  private rowSpot(part: PartId): [number, number, number] {
    if (part === 'refill') return [...REFILL_SPOT, 0.02];
    const row = tableSpots(['tip', 'spring', 'button'], null, ROW_SMALL);
    const tilt: Record<string, number> = { tip: -0.12, spring: 0.18, button: 0.32 };
    return [...row[part]!, tilt[part] ?? 0];
  }

  /** Every place the hand can take something from, given where the parts are. */
  private zones(extra: number): Zone[] {
    const out: Zone[] = [];
    const m = this.model;
    const onPen = (p: PartId) => m.where[p] === 'pen';
    for (const p of ['button', 'body', 'tip', 'refill', 'spring'] as const) {
      const at = m.where[p];
      if (at === 'pen') {
        // Inside parts show only once the tip is off.
        if ((p === 'refill' || p === 'spring') && onPen('tip')) continue;
        const [a, b] = EXPOSED[p];
        const back = p === 'refill' && !this.clicked ? RETRACT : 0;
        out.push({ part: p, ax: PEN.x + a, ay: PEN.y, bx: PEN.x + b - back, by: PEN.y, r: p === 'tip' ? 15 : DIMS[p].r });
      } else {
        const c = this.cuts.get(p)!;
        const half = DIMS[p].len / 2;
        const cx = Math.cos(c.rot) * half;
        const sy = Math.sin(c.rot) * half;
        out.push({ part: p, ax: c.x - cx, ay: c.y - sy, bx: c.x + cx, by: c.y + sy, r: DIMS[p].r + (at === 'floor' ? 8 + extra : 0) });
      }
    }
    return out;
  }

  /** The part under the hand, nearest first; spring before refill where they overlap. */
  private hit(x: number, y: number, extra = 0): PartId | null {
    let best: PartId | null = null;
    let bestD = TOUCH;
    for (const z of this.zones(extra)) {
      const d = segDist(x, y, z) - z.r - (z.part === 'spring' ? 4 : 0);
      if (d < bestD) {
        best = z.part;
        bestD = d;
      }
    }
    return best;
  }

  /** Where to click to take a part, for the dev page's robot: the middle of what shows of it. */
  private aim(part: PartId): [number, number] {
    const z = this.zones(0).find((q) => q.part === part);
    if (!z) return [this.target(part)[0], this.target(part)[1]];
    return [(z.ax + z.bx) / 2, (z.ay + z.by) / 2];
  }

  private client([x, y]: [number, number]): [number, number] {
    const f = this.ctx.stage.fit;
    return [f.x + x * f.scale, f.y + y * f.scale];
  }

  /** A point of the table as a spot around the listener: the hand is near, the far edge ahead. */
  private spot(x: number, y: number): Spot {
    return { x: (x - 640) / 200, z: (TABLE.y1 - y) / 160 + 0.6 };
  }

  // ---------- drawing ----------

  /** Sends a part to where it should be now over a few cut-out frames, lifted on an arc. */
  private fly(part: PartId, frames: number, arc = 0): void {
    const c = this.cuts.get(part)!;
    const [tx, ty, tr] = this.target(part);
    c.tween = { fx: c.x, fy: c.y, fr: c.rot, tx, ty, tr, frames, i: 0, arc: arc * Math.min(160, 30 + Math.hypot(tx - c.x, ty - c.y) * 0.35) };
  }

  /** One 12 fps frame: parts step along their flights, the hand catches up, the blindfold fades. */
  private frame(): void {
    for (const [part, c] of this.cuts) {
      const tw = c.tween;
      if (tw) {
        tw.i++;
        const k = tw.i / tw.frames;
        c.x = tw.fx + (tw.tx - tw.fx) * k;
        c.y = tw.fy + (tw.ty - tw.fy) * k - Math.sin(Math.PI * k) * tw.arc;
        c.rot = tw.fr + (tw.tr - tw.fr) * k + (part === 'spring' && tw.arc > 60 ? k * Math.PI * 4 : 0);
        if (tw.i >= tw.frames) c.tween = null;
      }
      for (const p of c.prints) {
        p.position.set(c.x + (p === c.prints[2] ? 6 : 0), c.y + (p === c.prints[2] ? 6 : 0));
        p.rotation = c.rot;
      }
    }
    // The hand: most of the way each frame, so it moves in visible steps.
    const [hx, hy] = this.hand;
    const [dx, dy] = [hx - this.drawn[0], hy - this.drawn[1]];
    this.drawn = Math.hypot(dx, dy) < 4 ? [hx, hy] : [this.drawn[0] + dx * 0.6, this.drawn[1] + dy * 0.6];
    if (this.curl > 0) this.curl = Math.max(0, this.curl - 0.34);
    this.drawHand();
    if (this.blindfold.visible) this.blindfold.alpha = this.dark;
  }

  private drawHand(): void {
    const [x, y] = this.drawn;
    const base: [number, number] = [x * 0.6 + 560, CAPTION_TOP + 100];
    const a = Math.atan2(y - base[1], x - base[0]) + Math.PI / 2;
    const wrist: [number, number] = [x - Math.sin(a) * 26, y + Math.cos(a) * 26];
    (['poster', 'truth', 'shadow'] as const).forEach((print, i) => {
      const off = print === 'shadow' ? 7 : 0;
      drawSleeve(this.sleeves[i]!, print, [base[0] + off, base[1] + off], [wrist[0] + off, wrist[1] + off]);
      const paw = this.paws[i]!;
      drawPaw(paw, print, this.curl);
      paw.position.set(x + off, y + off);
      paw.rotation = a;
    });
    if (this.blindfold.visible) {
      drawPaw(this.outline, 'outline', this.curl);
      this.outline.position.set(x, y);
      this.outline.rotation = a;
    }
  }

  /** The blindfold goes on or comes off, in three cut-out steps (at once with reduced motion). */
  private async cover(on: boolean): Promise<void> {
    this.blindfold.visible = true;
    this.sound.noise({ dur: 0.35, freq: 900, filter: 'bandpass', gain: 0.08 });
    const steps = this.scene.calm ? [on ? 1 : 0] : on ? [0.4, 0.75, 1] : [0.6, 0.25, 0];
    for (const k of steps) {
      this.dark = k;
      await this.scene.sleep(FRAME * 2);
    }
    this.dark = on ? 1 : 0;
    this.blindfold.alpha = this.dark;
    this.blindfold.visible = on;
    this.touchPlate.hidden = !on;
    this.watch.hidden = on;
    this.keysPlate.querySelector('.who')!.textContent = on ? 'Ручка. Глаза завязаны.' : 'Ручка.';
  }

  // ---------- sounds ----------

  private bark(text: string, ms = 1600): void {
    if (this.barking) return;
    this.barking = true;
    void this.scene.talk(text, { timeoutMs: ms }).then(() => (this.barking = false));
  }

  private offSound(part: PartId): void {
    const at = this.spot(this.hand[0], this.hand[1]);
    const now = this.sound.now;
    if (part === 'tip') for (let i = 0; i < 3; i++) this.sound.noise({ dur: 0.025, freq: 4200, filter: 'highpass', gain: 0.14, at: now + i * 0.07, spot: at });
    else if (part === 'refill') this.sound.noise({ dur: 0.22, freq: 1800, to: 3200, filter: 'bandpass', gain: 0.08, spot: at });
    else this.sound.tone({ freq: 2600, dur: 0.03, gain: 0.12, type: 'square', spot: at });
  }

  /** Each part goes in with its own click: that is how a blindfolded hand knows. */
  private onSound(part: PartId): void {
    const at = this.spot(PEN.x + DIMS[part].center, PEN.y);
    const now = this.sound.now;
    if (part === 'refill') {
      this.sound.noise({ dur: 0.2, freq: 3000, to: 1700, filter: 'bandpass', gain: 0.08, spot: at });
      this.sound.tone({ freq: 2200, dur: 0.03, gain: 0.14, type: 'square', at: now + 0.2, spot: at });
    } else if (part === 'spring') this.tinkle(at);
    else if (part === 'tip') {
      for (let i = 0; i < 4; i++) this.sound.noise({ dur: 0.025, freq: 4200, filter: 'highpass', gain: 0.12, at: now + i * 0.07, spot: at });
      this.sound.tone({ freq: 1900, dur: 0.04, gain: 0.16, type: 'square', at: now + 0.3, spot: at });
    } else this.sound.tone({ freq: 2600, dur: 0.035, gain: 0.16, type: 'square', spot: at });
  }

  private tinkle(at: Spot): void {
    this.sound.tone({ freq: 3300, to: 2800, type: 'triangle', dur: 0.14, gain: 0.08, spot: at });
    this.sound.tone({ freq: 4100, to: 3600, type: 'triangle', dur: 0.1, gain: 0.05, at: this.sound.now + 0.05, spot: at });
  }

  private knock(): void {
    const at = this.spot(this.hand[0], this.hand[1]);
    this.sound.noise({ dur: 0.1, freq: 260, gain: 0.2, spot: at });
    this.sound.tone({ freq: 150, to: 110, dur: 0.09, gain: 0.12, spot: at });
  }

  private clickClack(): void {
    const at = this.spot(PEN.x, PEN.y);
    this.sound.tone({ freq: 2500, dur: 0.025, gain: 0.18, type: 'square', spot: at });
    this.sound.tone({ freq: 2000, dur: 0.025, gain: 0.14, type: 'square', at: this.sound.now + 0.16, spot: at });
  }
}

/** The stopwatch's face: 01:07. */
function clock(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** Distance from a point to a zone's axis. */
function segDist(x: number, y: number, z: Zone): number {
  const vx = z.bx - z.ax;
  const vy = z.by - z.ay;
  const len2 = vx * vx + vy * vy;
  const k = len2 ? Math.max(0, Math.min(1, ((x - z.ax) * vx + (y - z.ay) * vy) / len2)) : 0;
  return Math.hypot(x - (z.ax + vx * k), y - (z.ay + vy * k));
}

/** The general's table from above: army cloth under the lamp, the wooden edge, the floorboards below. */
function buildTable(L: Layers, t: number): void {
  const { poster, truth, shadows } = L;
  const { x0, x1, y0, y1 } = TABLE;

  // ---- poster: cream cloth, a red band across, black edge and floor, a slogan ----
  poster.addChild(new Graphics().rect(0, 0, REF_W, CAPTION_TOP).fill(POSTER.black));
  poster.addChild(new Graphics().rect(x0, y0, x1 - x0, y1 - y0).fill(POSTER.cream));
  const band = new Graphics().poly([x0, 250, x1, 90, x1, 200, x0, 360]).fill(POSTER.red);
  band.position.set(3, 2);
  poster.addChild(band);
  poster.addChild(new Graphics().rect(x0, y1 - 8, x1 - x0, 10).fill(POSTER.black));
  for (let i = 0; i < 6; i++) poster.addChild(new Graphics().rect(0, y1 + 14 + i * 12, REF_W, 3).fill({ color: POSTER.cream, alpha: 0.18 }));
  const big = { fontFamily: 'Rubik Mono One, Arial Black, sans-serif', fontSize: 26, fill: POSTER.black, letterSpacing: 1 };
  const one = new Text({ text: 'РАЗОБРАЛ —', style: big });
  one.position.set(966, 214);
  const two = new Text({ text: 'СОБЕРИ!', style: { ...big, fill: POSTER.red } });
  two.position.set(1040, 252);
  poster.addChild(one, two);

  // ---- truth: green cloth under the lamp, wood, boards ----
  truth.addChild(new Graphics().rect(0, 0, REF_W, CAPTION_TOP).fill(TRUTH.floor));
  const boards = new Graphics();
  for (let i = 0; i < 7; i++) boards.rect(0, y1 + 10 + i * 11, REF_W, 2).fill({ color: 0x1d1712, alpha: 0.6 });
  truth.addChild(boards);
  truth.addChild(new Graphics().rect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 24).fill(0x4a3a2e));
  const cloth = smooth(0.3, 0.95, t);
  const green = rgb([Math.round(46 + (60 - 46) * cloth), Math.round(62 + (64 - 62) * cloth), Math.round(44 + (58 - 44) * cloth)]);
  truth.addChild(new Graphics().rect(x0, y0, x1 - x0, y1 - y0).fill(green));
  const nap = new TilingSprite({ texture: grainTexture(160, 29), width: x1 - x0, height: y1 - y0 });
  nap.position.set(x0, y0);
  nap.alpha = 0.16;
  truth.addChild(nap);
  // An old ink stain and a worn patch where elbows rest.
  truth.addChild(new Graphics().ellipse(1120, 400, 34, 20).fill({ color: 0x1a2340, alpha: 0.5 }).ellipse(640, 440, 220, 26).fill({ color: 0x5b6a52, alpha: 0.18 }));
  truth.addChild(shadows);
  const glow = new Sprite(glowTexture(256));
  glow.anchor.set(0.5);
  glow.position.set(640, 200);
  glow.width = 1400;
  glow.height = 760;
  glow.tint = rgb(TRUTH.lamp);
  glow.alpha = 0.16;
  truth.addChild(glow);
  if (t > 0.5) truth.addChild(new Graphics().rect(0, 0, REF_W, CAPTION_TOP).fill({ color: 0x2c3440, alpha: 0.16 * smooth(0.5, 1, t) }));
}
