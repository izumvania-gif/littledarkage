/**
 * The barracks as a stage: the room of render/barracks.ts under «Красные очки», the people in it as
 * puppets stepping at 12 fps, the lights (warm, the disco of Krypotkin's welcome, dark, the alarm), and the
 * player walking to whatever there is to do. The scene runner moves people and asks for a choice with roam();
 * every place in roam() is also a DOM button, so the barracks works from the keyboard without walking.
 */
import './barracks.css';
import { ColorMatrixFilter, Container, Graphics, Sprite } from 'pixi.js';
import type { Settings } from '../../core/settings.ts';
import { look } from '../../content/looks.ts';
import { PLAYER_ID } from '../../content/soldiers.ts';
import type { AudioEngine } from '../../engine/audio.ts';
import { ALARM, BARRACKS_HOLES, buildRoom, FIGURE_SCALE, FLOOR, LAMP, SPOTS, WALK_MAX, WALK_MIN, type Room } from '../../render/barracks.ts';
import { glowTexture } from '../../render/kit.ts';
import { CAPTION_TOP, POSTER, REF_W, TRUTH } from '../../render/palette.ts';
import { Puppet, type Pose, type PuppetColors } from '../../render/puppet.ts';
import { RedGlasses } from '../../render/redGlasses.ts';
import type { Fit, Stage } from '../../render/stage.ts';
import { h, isTyping } from '../../ui/dom.ts';
import { hintFor } from '../../engine/keys.ts';

export type Spot = string;
export type Light = 'warm' | 'disco' | 'dark' | 'alarm';
export type BPose = Pose;

export interface Hotspot {
  id: string;
  label: string;
  /** A spot, or a character id (the place is wherever he stands). */
  at: Spot | string;
}

const FRAME_MS = 1000 / 12;
/** How close the player must stand to use a place (reference pixels). */
const NEAR = 64;
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const USE = ['KeyE', 'Enter', 'NumpadEnter'];

const POSTER_COLORS: PuppetColors = { body: POSTER.black, seam: POSTER.cream, eye: POSTER.cream, light: POSTER.cream, accent: POSTER.red };
const SHADOW_COLORS: PuppetColors = { body: 0x000000, seam: 0x000000, eye: 0x000000, light: 0x000000, accent: 0x000000 };
const truthColors = (paper: number): PuppetColors => ({ body: paper, seam: 0x1b1815, eye: TRUTH.eye, light: 0xd8cbb0, accent: 0x6b3a30 });

/** One person drawn three times: on the poster, as a paper cut-out in the truth layer, and as its shadow. */
class Figure {
  readonly id: string;
  readonly poster: Puppet;
  readonly truth: Puppet;
  readonly shadow: Puppet;
  readonly size: number;
  readonly pace: number;
  x = 640;
  y = FLOOR;
  facing: 'left' | 'right' = 'right';
  /** The pose he returns to after talking or walking. */
  base: Pose = 'rest';
  talking = false;
  target: number | null = null;
  arrive: { y: number; pose: Pose; facing: 'left' | 'right' | null } | null = null;
  done: (() => void) | null = null;

  constructor(id: string, phase: number, capped = false) {
    this.id = id;
    // The new general wears the general's cap.
    const l = capped ? { ...look(id), hat: 'cap' as const } : look(id);
    this.size = l.size;
    this.pace = l.pace;
    this.poster = new Puppet(POSTER_COLORS, { look: l, phase });
    this.truth = new Puppet(truthColors(l.paper ?? 0x3a3430), { look: l, phase });
    this.shadow = new Puppet(SHADOW_COLORS, { look: l, phase });
  }

  set visible(v: boolean) {
    this.poster.root.visible = this.truth.root.visible = this.shadow.root.visible = v;
  }

  get visible(): boolean {
    return this.poster.root.visible;
  }

  setPose(p: Pose): void {
    for (const pp of [this.poster, this.truth, this.shadow]) pp.setPose(p);
  }

  get pose(): Pose {
    return this.poster.current;
  }

  step(frame: number): void {
    for (const pp of [this.poster, this.truth, this.shadow]) pp.step(frame);
  }

  /** Puts the three puppets where the figure is. The truth cut-out is a little smaller («ниже и тише»). */
  apply(): void {
    const s = FIGURE_SCALE * this.size;
    const f = this.facing === 'right' ? 1 : -1;
    this.poster.root.position.set(this.x, this.y);
    this.poster.root.scale.set(s * f, s);
    this.truth.root.position.set(this.x, this.y);
    this.truth.root.scale.set(s * 0.96 * f, s * 0.96);
    this.shadow.root.position.set(this.x + 6, this.y + 5);
    this.shadow.root.scale.set(s * 0.96 * f, s * 0.96);
  }
}

export class BarracksStage {
  private readonly stage: Stage;
  private readonly ui: HTMLElement;
  private readonly reduced: boolean;
  private readonly settings: Settings;
  /** «Без вспышек» (or reduced motion): read live, so the settings panel takes effect at once. */
  private get calm(): boolean {
    return this.reduced || this.settings.reduceFlashes;
  }
  private readonly view = new Container();
  private readonly room: Room;
  private readonly glasses: RedGlasses;
  private readonly figures = new Map<string, Figure>();
  private readonly offLayout: () => void;
  private readonly box: HTMLElement;
  /** The crate with the creature taken alive in battle 2 (cycle 3), on the poster and as a cut-out. */
  private crate: { poster: Graphics; truth: Graphics; lid: Graphics[] } | null = null;
  // Lights.
  private light: Light = 'warm';
  private readonly dim = new Graphics().rect(0, 0, REF_W, CAPTION_TOP).fill(0x050404);
  private readonly wash = new Graphics().rect(0, 0, REF_W, CAPTION_TOP).fill(0x8a1208);
  private readonly alarmGlow = new Sprite(glowTexture(256));
  private readonly disco = new Container();
  private readonly hue = new ColorMatrixFilter();
  private lightTime = 0;
  // Time.
  private acc = 0;
  private frame = 0;
  private dead = false;
  // Roaming.
  private held = 0;
  private roaming: { spots: readonly Hotspot[]; bar: HTMLElement; buttons: Map<string, HTMLButtonElement>; hint: HTMLElement; pick: (id: string) => void; auto: boolean } | null = null;

  constructor(stage: Stage, ui: HTMLElement, _audio: AudioEngine, settings: Settings, reduced: boolean) {
    this.stage = stage;
    this.ui = ui;
    this.reduced = reduced;
    this.settings = settings;
    this.room = buildRoom();
    this.glasses = new RedGlasses(stage.app.renderer, this.room.truth, this.room.poster, BARRACKS_HOLES, stage.app.renderer.resolution);
    this.view.addChild(this.glasses.view);

    // Lights over the picture (not over the caption band).
    this.dim.alpha = 0;
    this.wash.alpha = 0;
    this.alarmGlow.anchor.set(0.5);
    this.alarmGlow.position.set(ALARM.x, ALARM.y);
    this.alarmGlow.width = this.alarmGlow.height = 340;
    this.alarmGlow.tint = 0xff3a22;
    this.alarmGlow.blendMode = 'add';
    this.alarmGlow.alpha = 0;
    this.buildDisco();
    this.disco.visible = false;
    this.view.addChild(this.dim, this.wash, this.alarmGlow, this.disco);
    stage.root.addChild(this.view);

    this.box = h('div', { class: 'bk', attrs: { 'aria-label': 'Казарма' } });
    ui.append(this.box);
    this.offLayout = stage.onLayout((fit) => this.layout(fit));
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    stage.app.ticker.add(this.tick);
  }

  // ---------- the room ----------

  setT(t: number): void {
    this.glasses.setT(t);
  }

  setLight(l: Light): void {
    this.light = l;
    this.lightTime = 0;
    this.room.poster.filters = l === 'disco' ? [this.hue] : [];
    this.disco.visible = l === 'disco';
    this.room.lampGlow.alpha = l === 'warm' ? 1 : l === 'disco' ? 0.45 : 0;
    this.room.bulb.visible = l === 'warm' || l === 'disco';
    this.applyLight();
    this.glasses.invalidate();
  }

  setVisible(v: boolean): void {
    this.view.visible = v;
    this.box.hidden = !v;
  }

  // ---------- people ----------

  private figure(id: string): Figure {
    let f = this.figures.get(id);
    if (!f) {
      f = new Figure(id, (this.figures.size * 5) % 12);
      f.visible = false;
      this.figures.set(id, f);
      this.room.posterFigures.addChild(f.poster.root);
      this.room.truthFigures.addChild(f.truth.root);
      this.room.shadowFigures.addChild(f.shadow.root);
      f.apply();
    }
    return f;
  }

  /** Puts the general's cap on someone (the new general), keeping where he stands and how. */
  cap(id: string): void {
    const old = this.figures.get(id);
    const f = new Figure(id, (this.figures.size * 5) % 12, true);
    if (old) {
      for (const p of [old.poster, old.truth, old.shadow]) p.root.destroy({ children: true });
      Object.assign(f, { x: old.x, y: old.y, facing: old.facing, base: old.base });
      f.visible = old.visible;
    } else f.visible = false;
    this.figures.set(id, f);
    this.room.posterFigures.addChild(f.poster.root);
    this.room.truthFigures.addChild(f.truth.root);
    this.room.shadowFigures.addChild(f.shadow.root);
    f.setPose(f.base);
    f.apply();
    this.glasses.invalidate();
  }

  /**
   * The crate in the middle of the floor. Nothing of what is inside shows: a dark slit under the lid, and the lid
   * lifting by a hair now and then, as if something breathed or shifted.
   */
  setBox(on: boolean): void {
    if (!on) {
      if (this.crate) for (const g of [this.crate.poster, this.crate.truth]) g.destroy({ children: true });
      this.crate = null;
      this.glasses.invalidate();
      return;
    }
    if (this.crate) return;
    const draw = (ink: { wood: number; dark: number; line: number | null }) => {
      const g = new Graphics();
      const w = 96;
      const hh = 58;
      g.rect(-w / 2, -hh, w, hh).fill(ink.wood);
      if (ink.line !== null) g.rect(-w / 2, -hh, w, hh).stroke({ width: 3, color: ink.line });
      for (const y of [-hh * 0.66, -hh * 0.33]) g.moveTo(-w / 2 + 4, y).lineTo(w / 2 - 4, y).stroke({ width: 2, color: ink.dark });
      g.moveTo(-w / 2 + 6, -6).lineTo(w / 2 - 6, -hh + 6).stroke({ width: 3, color: ink.dark });
      // The slit under the lid.
      g.rect(-w / 2 + 6, -hh - 4, w - 12, 4).fill(0x070606);
      const lid = new Graphics().rect(-w / 2 - 4, -8, w + 8, 8).fill(ink.wood);
      if (ink.line !== null) lid.rect(-w / 2 - 4, -8, w + 8, 8).stroke({ width: 3, color: ink.line });
      lid.position.set(0, -hh - 4);
      g.addChild(lid);
      g.position.set(SPOTS.center!.x - 70, FLOOR + 6);
      return { g, lid };
    };
    const p = draw({ wood: POSTER.black, dark: POSTER.cream, line: POSTER.cream });
    const t = draw({ wood: 0x4a3a2e, dark: 0x2b2420, line: null });
    this.room.posterFigures.addChildAt(p.g, 0);
    this.room.truthFigures.addChildAt(t.g, 0);
    this.crate = { poster: p.g, truth: t.g, lid: [p.lid, t.lid] };
    this.glasses.invalidate();
  }

  show(ids: readonly string[]): void {
    for (const id of ids) this.figure(id);
    for (const [id, f] of this.figures) f.visible = ids.includes(id);
    this.glasses.invalidate();
  }

  place(id: string, at: Spot | number, opts: { facing?: 'left' | 'right'; pose?: BPose } = {}): void {
    const f = this.figure(id);
    const spot = typeof at === 'string' ? SPOTS[at] : undefined;
    this.halt(f);
    f.x = spot?.x ?? (typeof at === 'number' ? at : f.x);
    f.y = spot?.y ?? FLOOR;
    f.facing = opts.facing ?? spot?.facing ?? f.facing;
    f.base = opts.pose ?? (spot?.seat ? 'sit' : 'rest');
    f.talking = false;
    f.setPose(f.base);
    f.apply();
    this.glasses.invalidate();
  }

  walk(id: string, to: Spot | number): Promise<void> {
    const f = this.figure(id);
    const spot = typeof to === 'string' ? SPOTS[to] : undefined;
    const x = Math.max(WALK_MIN, Math.min(WALK_MAX, spot?.x ?? (typeof to === 'number' ? to : f.x)));
    this.halt(f);
    // A sitter stands up first: cut-out puppets just jump to their feet.
    f.y = FLOOR;
    f.target = x;
    f.arrive = { y: spot?.y ?? FLOOR, pose: spot?.seat ? 'sit' : 'rest', facing: spot?.facing ?? null };
    f.talking = false;
    if (Math.abs(x - f.x) < 1) {
      this.land(f);
      return Promise.resolve();
    }
    f.facing = x > f.x ? 'right' : 'left';
    f.setPose('walk');
    f.apply();
    return new Promise((resolve) => (f.done = resolve));
  }

  pose(id: string, pose: BPose): void {
    const f = this.figure(id);
    f.base = pose;
    f.talking = false;
    f.setPose(pose);
    this.glasses.invalidate();
  }

  face(id: string, facing: 'left' | 'right'): void {
    const f = this.figure(id);
    f.facing = facing;
    f.apply();
    this.glasses.invalidate();
  }

  /** Who is talking: standing he gestures, sitting he lifts a hand; a player or a carrier goes on with it. */
  speaking(id: string | null): void {
    for (const f of this.figures.values()) {
      const talk = f.id === id;
      if (talk === f.talking || f.target !== null) continue;
      f.talking = talk;
      if (f.base === 'rest' || f.base === 'attention') f.setPose(talk ? 'speak' : f.base);
      else if (f.base === 'sit') for (const p of [f.poster, f.truth, f.shadow]) p.setTalking(talk);
    }
    this.glasses.invalidate();
  }

  /** Where a hotspot is now. */
  private where(h: Hotspot): number | null {
    const spot = SPOTS[h.at];
    if (spot) return spot.x;
    const f = this.figures.get(h.at);
    return f?.visible ? f.x : null;
  }

  // ---------- walking about ----------

  roam(hotspots: readonly Hotspot[]): Promise<string> {
    const me = this.figure(PLAYER_ID);
    if (!me.visible) {
      me.visible = true;
      if (me.y !== FLOOR) this.place(PLAYER_ID, me.x);
    }
    if (me.base === 'sit') {
      me.y = FLOOR;
      me.base = 'rest';
      me.setPose('rest');
      me.apply();
    }
    this.cancelRoam();
    return new Promise((resolve) => {
      const buttons = new Map<string, HTMLButtonElement>();
      const bar = h('nav', { class: 'bk-bar', attrs: { 'aria-label': 'Куда подойти' } });
      for (const spot of hotspots) {
        const b = h('button', { class: 'bk-go', text: spot.label, attrs: { type: 'button', 'data-spot': spot.id } });
        b.addEventListener('click', () => void this.goTo(spot));
        buttons.set(spot.id, b);
        bar.append(b);
      }
      bar.append(h('p', { class: 'bk-keys' }, h('kbd', { text: hintFor('KeyA') }), ' ', h('kbd', { text: hintFor('KeyD') }), ' — идти, ', h('kbd', { text: hintFor('KeyE') }), ' — подойти'));
      const hint = h('p', { class: 'bk-hint', attrs: { 'aria-live': 'polite' } });
      hint.hidden = true;
      this.box.append(bar, hint);
      this.roaming = {
        spots: hotspots,
        bar,
        buttons,
        hint,
        auto: false,
        pick: (id: string) => {
          this.cancelRoam();
          resolve(id);
        },
      };
      this.updateHint();
    });
  }

  /** A click on a place: the player walks there, then it counts as chosen. */
  private async goTo(spot: Hotspot): Promise<void> {
    const r = this.roaming;
    if (!r || r.auto) return;
    const me = this.figure(PLAYER_ID);
    const x = this.where(spot);
    if (x === null) return;
    r.auto = true;
    // Walking there: the places wait (an agent's clock keeps running until the pick).
    r.bar.setAttribute('aria-busy', 'true');
    this.held = 0;
    // Stop beside a person, on a place.
    const isPerson = !SPOTS[spot.at];
    const stand = isPerson ? x + (me.x < x ? -46 : 46) : x;
    await this.walk(PLAYER_ID, stand);
    if (isPerson) this.face(PLAYER_ID, x > me.x ? 'right' : 'left');
    if (this.roaming === r) r.pick(spot.id);
  }

  private nearest(): Hotspot | null {
    const r = this.roaming;
    if (!r) return null;
    const me = this.figure(PLAYER_ID);
    let best: Hotspot | null = null;
    let bestD = Infinity;
    for (const spot of r.spots) {
      const x = this.where(spot);
      if (x === null) continue;
      const d = Math.abs(x - me.x);
      if (d <= NEAR && d < bestD) {
        best = spot;
        bestD = d;
      }
    }
    return best;
  }

  private updateHint(): void {
    const r = this.roaming;
    if (!r) return;
    const near = this.nearest();
    for (const [id, b] of r.buttons) b.classList.toggle('near', near?.id === id);
    if (!near || r.auto) {
      r.hint.hidden = true;
      return;
    }
    const me = this.figure(PLAYER_ID);
    r.hint.hidden = false;
    r.hint.replaceChildren(h('kbd', { text: hintFor('KeyE') }), ` — ${near.label}`);
    r.hint.style.left = `calc(${me.x} * var(--u))`;
    r.hint.style.top = `calc(${me.y - 130 * FIGURE_SCALE * me.size} * var(--u))`;
  }

  private cancelRoam(): void {
    const r = this.roaming;
    if (!r) return;
    this.roaming = null;
    r.bar.remove();
    r.hint.remove();
    this.held = 0;
    const me = this.figures.get(PLAYER_ID);
    if (me && me.target === null && me.pose === 'walk') {
      me.setPose(me.base);
    }
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    const r = this.roaming;
    if (!r || r.auto || isTyping(e.target) || !this.view.visible) return;
    if (LEFT.includes(e.code) || RIGHT.includes(e.code)) {
      e.preventDefault();
      this.held = LEFT.includes(e.code) ? -1 : 1;
      return;
    }
    // Enter on a focused button clicks it; E always means «use what's near».
    if (USE.includes(e.code) && !(e.code !== 'KeyE' && e.target instanceof HTMLButtonElement)) {
      if (e.repeat) return;
      const near = this.nearest();
      if (near) {
        e.preventDefault();
        r.pick(near.id);
      }
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if ((LEFT.includes(e.code) && this.held < 0) || (RIGHT.includes(e.code) && this.held > 0)) this.held = 0;
  };

  private readonly onBlur = (): void => {
    this.held = 0;
  };

  // ---------- time ----------

  private readonly tick = (): void => {
    if (this.dead) return;
    const dms = Math.min(250, this.stage.app.ticker.deltaMS);
    this.acc += dms;
    this.lightTime += dms / 1000;
    let stepped = false;
    while (this.acc >= FRAME_MS) {
      this.acc -= FRAME_MS;
      this.frame++;
      this.stepFrame();
      stepped = true;
    }
    if (this.light === 'disco' || this.light === 'alarm') this.applyLight();
    if (stepped) this.glasses.invalidate();
    if (this.view.visible) this.glasses.update();
  };

  private stepFrame(): void {
    for (const f of this.figures.values()) {
      if (!f.visible) continue;
      if (f.target !== null) {
        const dx = f.target - f.x;
        const step = Math.min(Math.abs(dx), f.pace);
        f.x += Math.sign(dx) * step;
        if (Math.abs(f.target - f.x) < 0.5) this.land(f);
        f.apply();
      }
      if (!this.reduced || f.pose === 'walk' || f.pose === 'play' || f.pose === 'clap') f.step(this.frame);
    }
    // The crate's lid: still most of the time, then up by a hair for two frames.
    if (this.crate) {
      const up = this.frame % 53 < 2 || this.frame % 89 === 0 ? -2 : 0;
      for (const lid of this.crate.lid) lid.pivot.y = -up;
    }
    // The player under the keys.
    const r = this.roaming;
    if (r && !r.auto) {
      const me = this.figure(PLAYER_ID);
      if (this.held !== 0) {
        me.facing = this.held > 0 ? 'right' : 'left';
        me.x = Math.max(WALK_MIN, Math.min(WALK_MAX, me.x + this.held * me.pace));
        if (me.pose !== 'walk') me.setPose('walk');
        me.apply();
      } else if (me.pose === 'walk' && me.target === null) {
        me.setPose(me.base);
      }
      this.updateHint();
    }
  }

  private land(f: Figure): void {
    const a = f.arrive;
    if (f.target !== null) f.x = f.target;
    f.target = null;
    f.arrive = null;
    if (a) {
      f.y = a.y;
      f.base = a.pose;
      if (a.facing) f.facing = a.facing;
    }
    f.setPose(f.base);
    f.apply();
    const done = f.done;
    f.done = null;
    done?.();
  }

  /** Stops a walk where it is, settling its promise. */
  private halt(f: Figure): void {
    if (f.target === null) return;
    f.target = null;
    f.arrive = null;
    const done = f.done;
    f.done = null;
    done?.();
  }

  // ---------- lights ----------

  private buildDisco(): void {
    // Cheap disco: four coloured spots from the ceiling and a mirror ball by the lamp.
    for (let i = 0; i < 4; i++) {
      const cone = new Graphics().poly([0, 0, -120, 470, 120, 470]).fill(0xffffff);
      cone.position.set(260 + i * 250, 40);
      cone.alpha = 0.16;
      cone.blendMode = 'add';
      this.disco.addChild(cone);
    }
    const ball = new Graphics().moveTo(LAMP.x + 70, 0).lineTo(LAMP.x + 70, 60).stroke({ width: 2, color: 0x222222 }).circle(LAMP.x + 70, 76, 16).fill(0xd8d8e0);
    for (let i = 0; i < 6; i++) ball.rect(LAMP.x + 58 + (i % 3) * 8, 66 + Math.floor(i / 3) * 10, 6, 6).fill(i % 2 ? 0xffffff : 0x9a9aa8);
    this.disco.addChild(ball);
  }

  private applyLight(): void {
    const t = this.lightTime;
    switch (this.light) {
      case 'warm':
        this.dim.alpha = 0;
        this.wash.alpha = 0;
        this.alarmGlow.alpha = 0;
        break;
      case 'dark':
        this.dim.alpha = 0.86;
        this.wash.alpha = 0;
        this.alarmGlow.alpha = 0;
        break;
      case 'alarm': {
        // The red lamp blinks 1.25 times a second; with fewer flashes it just burns.
        const on = this.calm ? true : Math.floor(t / 0.4) % 2 === 0;
        this.dim.alpha = this.calm ? 0.45 : on ? 0.35 : 0.62;
        this.wash.alpha = this.calm ? 0.28 : on ? 0.34 : 0.08;
        this.alarmGlow.alpha = this.calm ? 0.6 : on ? 0.9 : 0.1;
        break;
      }
      case 'disco': {
        this.dim.alpha = 0.3;
        this.wash.alpha = 0;
        this.alarmGlow.alpha = 0;
        // Colours change in steps twice a second (never more than three flashes a second); calm: a slow drift.
        const step = this.calm ? t * 0.35 : Math.floor(t / 0.5);
        const hueDeg = this.calm ? (t * 18) % 360 : (step * 67) % 360;
        this.hue.hue(hueDeg, false);
        const colors = [0xff2fa0, 0x2fe0ff, 0xfff03a, 0x6cff4a, 0xb05bff];
        this.disco.children.forEach((c, i) => {
          if (i >= 4) return;
          const k = this.calm ? (Math.floor(step) + i) % colors.length : (step + i * 2) % colors.length;
          (c as Graphics).tint = colors[Math.floor(k)] ?? 0xffffff;
          c.rotation = this.calm ? Math.sin(t * 0.3 + i) * 0.25 : (((step + i) % 3) - 1) * 0.22;
        });
        this.glasses.invalidate();
        break;
      }
    }
  }

  // ---------- layout and teardown ----------

  private layout(fit: Fit): void {
    this.glasses.setResolution(this.stage.app.renderer.resolution * fit.scale);
    const s = this.box.style;
    s.setProperty('--u', `${fit.scale}px`);
    s.left = `${fit.x}px`;
    s.top = `${fit.y}px`;
    s.width = `${REF_W * fit.scale}px`;
    s.height = `${CAPTION_TOP * fit.scale}px`;
    this.updateHint();
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.cancelRoam();
    for (const f of this.figures.values()) this.halt(f);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.stage.app.ticker.remove(this.tick);
    this.offLayout();
    this.box.remove();
    this.view.removeFromParent();
    this.view.destroy({ children: true });
  }
}
