/**
 * The mutiny brawl (concept «Бунт: драка с генералом»): the one scene where the player sees everything and acts
 * alone, with no commands and no voice behind his back. Three rooms from above, fast and loud; any blow kills,
 * the player too, and one key restarts the room at once. The rules live in brawl.ts; this stage draws them in
 * «Красные очки», feeds them the keys and the mouse, lends the general the caption plate, and at the end lets
 * the player strike or lower his hands, retells the brawl as ROSTA windows, and puts the lights out.
 */
import { Container, Graphics } from 'pixi.js';
import { GENERAL_LINES, KILL_WORDS, MUTINY, WEAPONS, type WeaponKind } from '../../content/mutiny.ts';
import { look } from '../../content/looks.ts';
import { captionsOn } from '../../core/settings.ts';
import { BattleSound, type Spot } from '../../engine/spatial.ts';
import { POSTER, REF_H, REF_W } from '../../render/palette.ts';
import { RedGlasses } from '../../render/redGlasses.ts';
import type { Fit } from '../../render/stage.ts';
import { h, isTyping } from '../../ui/dom.ts';
import {
  alive,
  enterRoom,
  find,
  GENERAL,
  newBrawl,
  offers,
  player,
  PLAYER,
  reach,
  restartRoom,
  resultOf,
  room,
  skipToFinal,
  step,
  type Brawl,
  type Ev,
  type Input,
  type Unit,
} from './brawl.ts';
import { frames, type Frame } from './chronicle.ts';
import { bodyCut, buildRoom, dropTextures, itemCut, MUTINY_HOLES, openDoor, RatCut, sofaCut, splat, standingCut, type RoomLayers } from './draw.ts';
import { frameCut } from './frames.ts';
import type { MutinyContext, MutinyResult } from './types.ts';
import './mutiny.css';

export type { MutinyContext, MutinyResult } from './types.ts';

/** The rules step at 60 Hz whatever the screen does; the cut-outs change pose at 12. */
const SIM = 1 / 60;
const FRAME = 1 / 12;

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const ATTACK = ['Space', 'KeyJ'];
const THROW = ['KeyQ', 'KeyK'];
const USE = ['KeyE', 'KeyF'];

export async function runMutiny(ctx: MutinyContext): Promise<MutinyResult> {
  const m = new Mutiny(ctx);
  try {
    return await m.run();
  } finally {
    m.destroy();
  }
}

interface Bark {
  el: HTMLElement;
  id: string;
  until: number;
}

class Mutiny {
  private readonly ctx: MutinyContext;
  private readonly b: Brawl;
  private readonly sound: BattleSound;
  /** Shakes and hit-stops off with reduced motion; softer with «без вспышек». */
  private readonly calm: boolean;
  private readonly view = new Container();
  private readonly overlay = new Container();
  private readonly itemLayer = new Container();
  private readonly actorLayer = new Container();
  private readonly fx = new Graphics();
  private readonly hud: HTMLElement;
  private readonly roomPlate: HTMLElement;
  private glasses: RedGlasses | null = null;
  private L: RoomLayers | null = null;
  private sofa: Graphics | null = null;
  private readonly actors = new Map<string, RatCut>();
  private itemKey = '';
  private clockNow = 0;
  private last = performance.now();
  private acc = 0;
  private frameAcc = 0;
  private frameNo = 0;
  private trauma = 0;
  private shakeT = 0;
  private hitstop = 0;
  private paused = false;
  private card: HTMLElement | null = null;
  private overlayPlate: HTMLElement | null = null;
  private dead = false;
  private finished = false;
  private voice: Promise<void> = Promise.resolve();
  private readonly held = new Set<string>();
  private edges = { attack: false, throw: false, use: false };
  private mouse: { x: number; y: number; at: number } | null = null;
  private readonly strikes = new Map<string, number>();
  private readonly barks: Bark[] = [];
  private flash: { kind: 'heard' | 'drowned'; until: number; x: number; y: number } | null = null;
  private shots: { x1: number; y1: number; x2: number; y2: number; until: number }[] = [];
  private kills = 0;
  private killCorner = 0;
  private shotLine = false;
  private done: ((how: 'final' | 'surrendered') => void) | null = null;
  private autopilot: ((b: Brawl) => Input | null) | null = null;
  private stale = true;
  private readonly timers: { at: number; done: () => void }[] = [];
  private readonly offLayout: () => void;
  private readonly tick = () => this.update();
  private readonly onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent) => this.held.delete(e.code);
  private readonly onMove = (e: PointerEvent) => this.pointer(e, false);
  private readonly onDown = (e: PointerEvent) => this.pointer(e, true);
  private readonly onMenu = (e: Event) => {
    if (e.target === this.ctx.stage.app.canvas) e.preventDefault();
  };
  private readonly onBlur = () => this.held.clear();
  private readonly onVisible = () => {
    this.last = performance.now();
    if (document.hidden && !this.finished && this.b.phase === 'fight') this.setPaused(true);
  };

  constructor(ctx: MutinyContext) {
    this.ctx = ctx;
    this.calm = ctx.reduced;
    this.sound = new BattleSound(ctx.audio);
    this.b = newBrawl({ allies: ctx.allies, waverers: ctx.waverers, loyal: ctx.loyal, krypotkin: ctx.krypotkin, seed: Math.floor(Math.random() * 0x7fffffff), slow: ctx.settings.noTimer });
    this.overlay.addChild(this.itemLayer, this.actorLayer, this.fx);
    this.view.addChild(this.overlay);
    ctx.stage.root.addChild(this.view);
    this.hud = h('div', { class: `mutiny${ctx.reduced || ctx.settings.reduceFlashes ? ' calm' : ''}` });
    this.roomPlate = h('p', { class: 'mt-plate mt-room' });
    this.hud.append(this.roomPlate);
    ctx.ui.append(this.hud);
    this.offLayout = ctx.stage.onLayout((fit) => this.layout(fit));
    ctx.stage.app.ticker.add(this.tick);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('contextmenu', this.onMenu);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisible);
    // For the dev page's robot (stripped from the build).
    // For bots and the dev page (stripped from the build): the state, and an autopilot when __mutinyAuto is set.
    if (import.meta.env.DEV) {
      Reflect.set(window, '__mutiny', this.b);
      void import('./autopilot.ts').then((m) => (this.autopilot = m.autopilot));
    }
  }

  async run(): Promise<MutinyResult> {
    this.buildView();
    this.showCard();
    const how = await new Promise<'final' | 'surrendered'>((resolve) => (this.done = resolve));
    this.ctx.tape(false);
    if (how === 'surrendered') {
      this.closeOverlay();
      await this.talk(GENERAL_LINES.surrender, { timeoutMs: 2400 });
      this.finished = true;
      return resultOf(this.b, 'surrendered');
    }
    const outcome = await this.final();
    const result = resultOf(this.b, outcome);
    await this.chronicle(frames(this.b.stats, outcome), result.chronicle);
    await this.lightsOut();
    this.finished = true;
    return { ...result, seconds: Math.round(this.b.time) };
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.offLayout();
    this.ctx.stage.app.ticker.remove(this.tick);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('contextmenu', this.onMenu);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisible);
    for (const t of this.timers.splice(0)) t.done();
    this.done?.('surrendered');
    this.hud.remove();
    this.dropView();
    this.view.destroy({ children: true });
    dropTextures();
    if (import.meta.env.DEV) Reflect.deleteProperty(window, '__mutiny');
  }

  // ---------- the clock ----------

  private sleep(seconds: number): Promise<void> {
    return new Promise((done) => this.timers.push({ at: this.clockNow + seconds, done }));
  }

  /** The general speaks on the caption plate, after whatever he is still saying. */
  private talk(text: string, opts?: { speaker?: string; timeoutMs?: number }): Promise<void> {
    this.voice = this.voice.then(() => (this.dead ? undefined : this.ctx.say(text, opts)));
    return this.voice;
  }

  private update(): void {
    if (this.dead) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;
    this.clockNow += dt;
    const b = this.b;
    if (b.phase === 'fight' && !this.paused && !this.card) {
      if (this.hitstop > 0) this.hitstop -= dt;
      else {
        this.acc += dt * (b.slow ? MUTINY.slowScale : 1);
        while (this.acc >= SIM && b.phase === 'fight') {
          this.acc -= SIM;
          this.handle(step(b, SIM, this.input()));
        }
        if (b.phase !== 'fight') this.acc = 0;
        this.afterStep();
      }
    }
    this.frameAcc += dt;
    while (this.frameAcc >= FRAME) {
      this.frameAcc -= FRAME;
      this.frameNo++;
    }
    this.draw();
    // Shake: decaying trauma, squared, smooth (game-feel); the picture moves, never the rules.
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 2.2 * dt);
      this.shakeT += dt * 30;
      const k = this.trauma * this.trauma;
      this.view.position.set(12 * k * Math.sin(this.shakeT * 1.7), 9 * k * Math.sin(this.shakeT * 2.3));
    } else this.view.position.set(0, 0);
    if (this.glasses) {
      this.glasses.update();
      // The composite is cached as one texture: redrawn only when the poster or t changed.
      if (this.stale) {
        this.stale = false;
        this.glasses.view.updateCacheTexture();
      }
    }
    const due = this.timers.filter((t) => t.at <= this.clockNow);
    for (const t of due) {
      this.timers.splice(this.timers.indexOf(t), 1);
      t.done();
    }
  }

  /** What the rules do after a step: a death, a door, the end. */
  private afterStep(): void {
    const b = this.b;
    if (b.phase === 'dead' && !this.overlayPlate) this.showDeath();
    else if (b.phase === 'exit') {
      enterRoom(b, b.room + 1);
      this.buildView();
      void this.talk(GENERAL_LINES.rooms[b.room] ?? '', { timeoutMs: 2400 });
      if (b.room === 1) this.hint('Подобрать — E. Бросить — правая кнопка мыши или Q.', 7);
    } else if (b.phase === 'final' && this.done) {
      const d = this.done;
      this.done = null;
      d('final');
    }
  }

  // ---------- input ----------

  private input(): Input {
    let mx = 0;
    let my = 0;
    for (const code of this.held) {
      const v = MOVE[code];
      if (v) {
        mx += v[0];
        my += v[1];
      }
    }
    mx = Math.max(-1, Math.min(1, mx));
    my = Math.max(-1, Math.min(1, my));
    // The mouse aims while it is being used; keys alone face the way the player walks.
    const m = this.mouse && this.clockNow - this.mouse.at < 3 ? this.mouse : null;
    const out: Input = { mx, my, ax: m?.x ?? null, ay: m?.y ?? null, ...this.edges };
    this.edges = { attack: false, throw: false, use: false };
    if (import.meta.env.DEV) {
      const drive = (Reflect.get(window, '__mutinyDrive') as ((b: Brawl) => Input | null) | undefined) ?? (Reflect.get(window, '__mutinyAuto') ? this.autopilot : null);
      const auto = drive?.(this.b);
      if (auto) return auto;
    }
    return out;
  }

  private keyDown(e: KeyboardEvent): void {
    if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey || this.finished) return;
    const code = e.code;
    const b = this.b;
    if (this.card) {
      if (code === 'KeyH' || code === 'Escape' || code === 'Enter' || code === 'Space' || MOVE[code] || ATTACK.includes(code)) {
        e.preventDefault();
        this.closeCard();
      }
      return;
    }
    if (this.paused) {
      if ((code === 'KeyP' || code === 'Escape') && !e.repeat) {
        e.preventDefault();
        this.setPaused(false);
      }
      return;
    }
    if (b.phase === 'dead') {
      if (e.repeat) return;
      const o = offers(b);
      if (code === 'KeyR' || code === 'Space' || code === 'Enter') this.restart();
      else if (code === 'KeyB' && o.slow) this.slowDown();
      else if (code === 'KeyK' && o.skip) this.skip();
      else return;
      e.preventDefault();
      return;
    }
    if (b.phase !== 'fight') return;
    if (MOVE[code]) {
      this.held.add(code);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (ATTACK.includes(code)) this.edges.attack = true;
    else if (THROW.includes(code)) this.edges.throw = true;
    else if (USE.includes(code)) this.edges.use = true;
    else if (code === 'KeyR') this.restart();
    else if (code === 'KeyP' || code === 'Escape') this.setPaused(true);
    else if (code === 'KeyH') this.showCard();
    else return;
    e.preventDefault();
  }

  private pointer(e: PointerEvent, down: boolean): void {
    const f = this.ctx.stage.fit;
    const x = (e.clientX - f.x) / f.scale;
    const y = (e.clientY - f.y) / f.scale;
    if (x < 0 || y < 0 || x > REF_W || y > REF_H) return;
    this.mouse = { x, y, at: this.clockNow };
    if (!down || e.target !== this.ctx.stage.app.canvas || this.b.phase !== 'fight' || this.paused || this.card) return;
    if (e.button === 0) this.edges.attack = true;
    else if (e.button === 2) this.edges.throw = true;
  }

  // ---------- the rules' events ----------

  /** Where a sound is from, for the panner: around the player, the screen's up is ahead. */
  private spot(x: number, y: number): Spot {
    const p = player(this.b);
    return { x: (x - p.x) / 110, z: (p.y - y) / 110 };
  }

  private handle(ev: readonly Ev[]): void {
    const b = this.b;
    for (const e of ev) {
      switch (e.t) {
        case 'windup': {
          const u = find(b, e.id);
          if (u) this.sound.noise({ dur: 0.18, filter: 'bandpass', freq: 500, q: 1.2, gain: 0.12, spot: this.spot(u.x, u.y) });
          break;
        }
        case 'swing': {
          const u = find(b, e.id);
          this.strikes.set(e.id, this.frameNo + 2);
          if (u) this.sound.noise({ dur: 0.12, filter: 'bandpass', freq: 1400, to: 600, q: 0.8, gain: e.id === PLAYER ? 0.3 : 0.18, spot: this.spot(u.x, u.y) });
          break;
        }
        case 'kill':
          this.kill(e);
          break;
        case 'disarm':
          this.sound.tone({ freq: 1300, to: 900, type: 'triangle', dur: 0.25, gain: 0.12, spot: this.spot(e.x, e.y) });
          this.sound.thud(this.spot(e.x, e.y));
          void this.talk(GENERAL_LINES.disarmed, { timeoutMs: 1400 });
          break;
        case 'throw':
          this.sound.noise({ dur: 0.22, filter: 'bandpass', freq: 900, to: 2400, q: 0.7, gain: 0.2 });
          break;
        case 'land':
          this.sound.noise({ dur: 0.08, filter: 'highpass', freq: 1800, gain: 0.25, spot: this.spot(e.x, e.y) });
          this.sound.tone({ freq: 700, dur: 0.1, type: 'square', gain: 0.03, spot: this.spot(e.x, e.y) });
          break;
        case 'aim':
          // The hammer cocked: the one warning a player gets besides the line.
          this.sound.noise({ dur: 0.03, filter: 'highpass', freq: 3000, gain: 0.4, spot: this.spot(e.x, e.y) });
          this.sound.noise({ dur: 0.03, filter: 'highpass', freq: 2500, gain: 0.35, spot: this.spot(e.x, e.y), at: this.sound.now + 0.12 });
          if (b.shots === 0 && !this.shotLine) {
            this.shotLine = true;
            void this.talk(GENERAL_LINES.firstShot, { timeoutMs: 1600 });
          }
          break;
        case 'shot':
          this.shots.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, until: this.clockNow + 0.09 });
          this.sound.noise({ dur: 0.35, freq: 1800, to: 200, gain: 0.7 });
          this.sound.tone({ freq: 110, to: 45, dur: 0.3, gain: 0.5 });
          this.shake(0.35);
          break;
        case 'empty':
          this.sound.noise({ dur: 0.03, filter: 'highpass', freq: 3500, gain: 0.3 });
          void this.talk(GENERAL_LINES.empty, { timeoutMs: 1300 });
          break;
        case 'shout': {
          // «Смир-…»: he draws breath; the circle shows how far it will carry.
          this.say(GENERAL, e.kind === 'attention' ? 'Смир-…' : 'Отстав-…', 0.6, 'general');
          this.voiceBlip(e.x, e.y, 0.55, 0.9, 0.5);
          break;
        }
        case 'heard': {
          const g = find(b, GENERAL);
          const x = g?.x ?? 640;
          const y = g?.y ?? 270;
          if (e.drowned) {
            this.flash = { kind: 'drowned', until: this.clockNow + 0.5, x, y };
            this.say(GENERAL, '(не слышно за музыкой)', 1.4, 'muted');
            this.voiceBlip(x, y, 0.25, 0.75, 0.08);
          } else {
            this.flash = { kind: 'heard', until: this.clockNow + (this.ctx.settings.reduceFlashes ? 0.4 : 0.2), x, y };
            this.say(GENERAL, e.kind === 'attention' ? '…но!' : '…ить!', 1, 'general');
            this.voiceBlip(x, y, 0.3, 0.75, 0.6);
            if (e.kind === 'attention' && e.ids.length) this.ctx.audio.stomp(Math.min(6, e.ids.length));
          }
          break;
        }
        case 'bark':
          this.say(e.id, e.text, 1.8);
          break;
        case 'pick':
          this.sound.noise({ dur: 0.05, filter: 'bandpass', freq: 2400, q: 2, gain: 0.25 });
          break;
        case 'tape':
          this.ctx.audio.click();
          this.ctx.tape(true);
          if (captionsOn(this.ctx.settings)) this.hint('♪ Магнитофон на полную', 3);
          break;
        case 'grab':
          if (e.on) this.sound.tone({ freq: 280, to: 420, type: 'triangle', dur: 0.22, gain: 0.05 });
          if (e.on && e.helper) this.hint('Вдвоём диван идёт тараном.', 3);
          break;
        case 'clear':
          if (this.L) {
            openDoor(this.L, room(b));
            this.refresh();
          }
          this.sound.noise({ dur: 0.4, filter: 'bandpass', freq: 300, q: 0.8, gain: 0.2 });
          this.hint('Дверь открыта →', 2.5);
          break;
        default:
          break;
      }
    }
  }

  /** A voiceless shout: a sawtooth through two formants, low and long for «Смир-…», short and hard for «…но!». */
  private voiceBlip(x: number, y: number, dur: number, pitch: number, gain: number): void {
    const spot = this.spot(x, y);
    this.sound.tone({ freq: 190 * pitch, to: 150 * pitch, type: 'sawtooth', dur, gain: gain * 0.25, spot });
    this.sound.noise({ dur, filter: 'bandpass', freq: 900, q: 3, gain: gain * 0.2, spot });
  }

  private kill(e: Extract<Ev, { t: 'kill' }>, words = true): void {
    const b = this.b;
    const v = find(b, e.id);
    if (!v || !this.L) return;
    this.kills++;
    splat(this.L.blood, e.x, e.y, e.dir, this.kills + b.room * 50, e.weapon === 'nagan' || e.weapon === 'sofa' ? 1.25 : 1);
    v.dir = e.dir;
    const band = v.side === 'ally' || v.side === 'player';
    this.L.bodiesPoster.addChild(bodyCut(v, false, band));
    this.L.bodiesTruth.addChild(bodyCut(v, true, false));
    this.refresh();
    const a = this.actors.get(v.id);
    if (a) {
      a.destroy();
      this.actors.delete(v.id);
    }
    const spot = this.spot(e.x, e.y);
    this.sound.thud(spot);
    this.sound.cry(spot, v.id === PLAYER ? 0.9 : 0.75 + ((e.id.charCodeAt(0) * 7) % 10) / 20);
    const w = e.weapon === 'sofa' ? 0.8 : WEAPONS[e.weapon].shake;
    this.shake(v.id === PLAYER ? 0.7 : w);
    if (!this.calm) this.hitstop = v.id === PLAYER ? 0.12 : 0.06;
    const killer = find(b, e.by);
    if (words && v.id !== PLAYER && (e.by === PLAYER || killer?.side === 'ally')) this.killWord();
  }

  /** «ДОЛОЙ!» on the edge of the frame for a moment, in the corner farthest from the player. */
  private killWord(): void {
    const p = player(this.b);
    const corners: [number, number][] = [
      [150, 46],
      [1130, 46],
      [150, 498],
      [1130, 498],
    ];
    corners.sort((a, c) => Math.hypot(c[0] - p.x, c[1] - p.y) - Math.hypot(a[0] - p.x, a[1] - p.y));
    const at = corners[this.killCorner++ % 2]!;
    const el = h('p', { class: 'mt-kill', text: KILL_WORDS[this.kills % KILL_WORDS.length]!, attrs: { 'aria-hidden': 'true' } });
    el.style.left = `calc(${at[0]} * var(--u))`;
    el.style.top = `calc(${at[1]} * var(--u))`;
    this.hud.append(el);
    setTimeout(() => el.remove(), MUTINY.killCaption * 1000 + 50);
  }

  private shake(amount: number): void {
    if (this.calm) return;
    this.trauma = Math.min(1, this.trauma + amount * (this.ctx.settings.reduceFlashes ? 0.5 : 1));
  }

  /** A short line near someone (no voices yet): his name and the words, following him for a moment. */
  private say(id: string, text: string, seconds: number, kind = ''): void {
    const old = this.barks.findIndex((x) => x.id === id);
    if (old >= 0) this.barks.splice(old, 1)[0]!.el.remove();
    const name = id === GENERAL ? '' : this.nameOf(id);
    const el = h('p', { class: `mt-bark ${kind}` }, name ? h('b', { text: name }) : null, text);
    this.hud.append(el);
    this.barks.push({ el, id, until: this.clockNow + seconds });
  }

  private nameOf(id: string): string {
    const u = find(this.b, id);
    const face = u?.face ?? id;
    if (face === 'extra') return 'Солдат';
    return this.ctx.names[face] ?? look(face).name;
  }

  // ---------- the room ----------

  /** Something in the poster changed (blood, a body, the door): bake it and the cached composite again. */
  private refresh(): void {
    this.glasses?.invalidate();
    this.stale = true;
  }

  /**
   * The room's composite (truth, the shadow's blur, the baked poster) is one texture between changes, at the
   * screen's resolution; only the figures on top are drawn every frame.
   */
  private cache(): void {
    const v = this.glasses?.view;
    if (!v) return;
    const res = this.ctx.stage.app.renderer.resolution * this.ctx.stage.fit.scale;
    if (v.isCachedAsTexture) v.cacheAsTexture(false);
    v.cacheAsTexture({ resolution: res, antialias: true });
    this.stale = true;
  }

  private dropView(): void {
    for (const a of this.actors.values()) a.destroy();
    this.actors.clear();
    this.itemLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.itemKey = '';
    this.sofa?.destroy();
    this.sofa = null;
    if (this.glasses) {
      this.glasses.view.removeFromParent();
      this.glasses.view.destroy({ children: true });
      this.L?.poster.destroy({ children: true });
      this.glasses = null;
      this.L = null;
    }
  }

  /** Builds the room the rules are in: both layers, the glasses at the brawl's point, the figures on top. */
  private buildView(): void {
    this.dropView();
    const b = this.b;
    const rm = room(b);
    this.L = buildRoom(rm, b.room);
    const renderer = this.ctx.stage.app.renderer;
    this.glasses = new RedGlasses(renderer, this.L.truth, this.L.poster, MUTINY_HOLES, renderer.resolution * this.ctx.stage.fit.scale);
    this.glasses.setT(MUTINY.t);
    this.view.addChildAt(this.glasses.view, 0);
    this.cache();
    if (b.sofa) {
      this.sofa = sofaCut(b.sofa, false);
      this.overlay.addChildAt(this.sofa, 1);
    }
    this.roomPlate.replaceChildren(h('span', { class: 'num', text: `${b.room + 1}.` }), ` ${rm.name.toUpperCase()}`);
    this.barks.splice(0).forEach((x) => x.el.remove());
    this.flash = null;
    this.shots = [];
    this.kills = 0;
  }

  private restart(): void {
    if (this.b.phase === 'final') return;
    restartRoom(this.b);
    this.closeOverlay();
    this.held.clear();
    this.buildView();
  }

  private slowDown(): void {
    this.b.slow = true;
    this.restart();
    this.hint('Без спешки: всё медленнее.', 3);
  }

  private skip(): void {
    skipToFinal(this.b);
    this.closeOverlay();
    this.buildView();
    if (this.done) {
      const d = this.done;
      this.done = null;
      d('final');
    }
  }

  // ---------- plates ----------

  private layout(fit: Fit): void {
    const s = this.hud.style;
    s.setProperty('--u', `${fit.scale}px`);
    s.left = `${fit.x}px`;
    s.top = `${fit.y}px`;
    s.width = `${REF_W * fit.scale}px`;
    s.height = `${(REF_H - 180) * fit.scale}px`;
    this.glasses?.setResolution(this.ctx.stage.app.renderer.resolution * fit.scale);
    this.cache();
  }

  /** The controls, once at the start (the fight waits) and again on H. */
  private showCard(): void {
    if (this.card) return;
    const k = (t: string) => h('kbd', { text: t });
    const row = (keys: (Node | string)[], what: string) => h('li', {}, h('span', {}, ...keys), h('span', { text: what }));
    this.card = h(
      'div',
      { class: 'mt-plate mt-card', attrs: { role: 'dialog', 'aria-label': 'Управление' } },
      h('p', { class: 'title', text: 'Бунт. Любой удар убивает — и тебя тоже.' }),
      h(
        'ul',
        {},
        row([k('W'), ' ', k('A'), ' ', k('S'), ' ', k('D'), ' или стрелки'], 'идти'),
        row(['мышь'], 'куда смотреть'),
        row(['левая кнопка, ', k('Пробел')], 'ударить (с наганом — выстрелить)'),
        row(['правая кнопка, ', k('Q')], 'бросить, что в руках'),
        row([k('E')], 'подобрать, магнитофон, взяться за диван'),
        row([k('R')], 'заново, сразу'),
        row([k('P'), ' ', k('Esc')], 'пауза; там же «Встать в строй»'),
        row([k('H')], 'эта карточка'),
      ),
      h('p', { class: 'go', text: 'Пробел или любое движение — начать.' }),
    );
    this.card.addEventListener('click', () => this.closeCard());
    this.hud.append(this.card);
  }

  private closeCard(): void {
    this.card?.remove();
    this.card = null;
    this.last = performance.now();
  }

  private closeOverlay(): void {
    this.overlayPlate?.remove();
    this.overlayPlate = null;
  }

  private button(label: string, key: string, run: () => void, red = false): HTMLButtonElement {
    const el = h('button', { class: red ? 'red' : '', attrs: { type: 'button' } }, label, key ? h('kbd', { text: key }) : null);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      run();
    });
    return el;
  }

  /** The player fell: no defeat screen, only the key that starts the room again (and, after many falls, mercy). */
  private showDeath(): void {
    const b = this.b;
    const o = offers(b);
    const fem = this.ctx.player.fem;
    const buttons = h('div', { class: 'mt-buttons' }, this.button('Заново', 'R', () => this.restart(), true));
    if (o.slow) buttons.append(this.button('Без спешки', 'B', () => this.slowDown()));
    if (o.skip) buttons.append(this.button('Сразу в кабинет', 'K', () => this.skip()));
    this.overlayPlate = h('div', { class: 'mt-plate mt-center', attrs: { role: 'alert' } }, h('p', { class: 'big', text: fem ? 'УБИТА' : 'УБИТ' }), h('p', { text: 'Понарошку: это плакат. Комната начнётся заново.' }), buttons);
    this.hud.append(this.overlayPlate);
    buttons.querySelector('button')?.focus({ preventScroll: true });
  }

  private setPaused(on: boolean): void {
    if (on === this.paused || this.finished) return;
    this.paused = on;
    this.held.clear();
    if (!on) {
      this.closeOverlay();
      this.last = performance.now();
      return;
    }
    const fem = this.ctx.player.fem;
    const buttons = h(
      'div',
      { class: 'mt-buttons' },
      this.button('Продолжить', 'P', () => this.setPaused(false), true),
      this.button('Карточка управления', 'H', () => {
        this.setPaused(false);
        this.showCard();
      }),
      this.button('Встать в строй', '', () => this.confirmSurrender()),
    );
    this.overlayPlate = h('div', { class: 'mt-plate mt-pause', attrs: { role: 'dialog', 'aria-label': 'Пауза' } }, h('p', { class: 'big', text: 'ПАУЗА' }), buttons, h('p', { class: 'note', text: `«Встать в строй» — не поражение: бунт подавлен, и всё пойдёт обычным путём. ${fem ? 'Сама' : 'Сам'} решаешь.` }));
    this.hud.append(this.overlayPlate);
    buttons.querySelector('button')?.focus({ preventScroll: true });
  }

  private confirmSurrender(): void {
    this.closeOverlay();
    const buttons = h(
      'div',
      { class: 'mt-buttons' },
      this.button('Встать в строй', '', () => {
        this.closeOverlay();
        this.finished = true;
        const d = this.done;
        this.done = null;
        d?.('surrendered');
      }, true),
      this.button('Назад', 'Esc', () => {
        this.closeOverlay();
        this.paused = false;
        this.setPaused(true);
      }),
    );
    this.overlayPlate = h('div', { class: 'mt-plate mt-pause', attrs: { role: 'dialog', 'aria-label': 'Встать в строй' } }, h('p', { class: 'big', text: 'ВСТАТЬ В СТРОЙ?' }), h('p', { text: 'Бунт будет подавлен. В книге учёта запишут и это.' }), buttons);
    this.hud.append(this.overlayPlate);
    buttons.querySelector('button')?.focus({ preventScroll: true });
  }

  private hint(text: string, seconds: number): void {
    const el = h('p', { class: 'mt-plate mt-hint', text, attrs: { role: 'status' } });
    this.hud.querySelector('.mt-hint')?.remove();
    this.hud.append(el);
    void this.sleep(seconds).then(() => el.remove());
  }

  // ---------- drawing ----------

  private draw(): void {
    const b = this.b;
    // Items on the floor, rebuilt only when they change.
    const key = b.items.map((i) => `${i.id}`).join(',');
    if (key !== this.itemKey) {
      this.itemKey = key;
      this.itemLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      for (const it of b.items) {
        const c = itemCut(it.kind);
        c.position.set(it.x, it.y);
        c.rotation = ((it.id * 1.7) % 6.28) - 3.14;
        this.itemLayer.addChild(c);
      }
    }
    if (this.sofa && b.sofa) this.sofa.position.set(b.sofa.x, b.sofa.y);
    // The figures.
    const seen = new Set<string>();
    for (const u of b.units) {
      if (!alive(u) || u.mode === 'gone') continue;
      seen.add(u.id);
      let a = this.actors.get(u.id);
      if (!a) {
        a = new RatCut(u.side === 'player' ? 'player' : u.side === 'general' ? 'general' : 'loyal', u.face);
        this.actors.set(u.id, a);
        this.actorLayer.addChild(a.root);
      }
      a.update(u, this.pose(u), this.frameNo + u.id.length, u.side === 'ally' || u.side === 'player');
    }
    for (const [id, a] of this.actors)
      if (!seen.has(id)) {
        a.destroy();
        this.actors.delete(id);
      }
    this.drawFx();
    this.placeBarks();
  }

  private pose(u: Unit): 'rest' | 'walk' | 'windup' | 'strike' | 'frozen' | 'sit' {
    if (u.frozen > 0) return 'frozen';
    if ((this.strikes.get(u.id) ?? -1) >= this.frameNo) return 'strike';
    if (u.mode === 'windup') return u.id === PLAYER ? 'strike' : 'windup';
    if (u.mode === 'sit') return 'sit';
    return u.moving ? 'walk' : 'rest';
  }

  /** The voice's circle, the aim line, shots, things in flight, the tape recorder playing. */
  private drawFx(): void {
    const b = this.b;
    const g = this.fx.clear();
    const s = b.shout;
    if (s) {
      const k = 1 - s.t / MUTINY.shoutWindup;
      this.voice2(g, s.x, s.y, MUTINY.shoutRadius * (0.3 + 0.7 * k), { color: POSTER.red, alpha: 0.14 }, POSTER.red);
    }
    const f = this.flash;
    if (f && f.until > this.clockNow) {
      if (f.kind === 'heard') this.voice2(g, f.x, f.y, MUTINY.shoutRadius, { color: POSTER.red, alpha: this.ctx.settings.reduceFlashes ? 0.22 : 0.4 }, POSTER.black);
      else this.voice2(g, f.x, f.y, MUTINY.shoutRadius, { color: POSTER.cream, alpha: 0.15 }, 0x8a8178);
    }
    const a = b.aim;
    if (a) {
      const len = reach(b, a.x, a.y, a.dir, MUTINY.shotRange, 'shot');
      const k = 1 - a.t / MUTINY.aim;
      const w = 2 + 3 * k;
      for (let d = 22; d < len; d += 18) {
        const e = Math.min(len, d + 10);
        g.moveTo(a.x + Math.cos(a.dir) * d, a.y + Math.sin(a.dir) * d).lineTo(a.x + Math.cos(a.dir) * e, a.y + Math.sin(a.dir) * e);
      }
      g.stroke({ width: w, color: POSTER.red });
    }
    this.shots = this.shots.filter((x) => x.until > this.clockNow);
    for (const x of this.shots) g.moveTo(x.x1, x.y1).lineTo(x.x2, x.y2).stroke({ width: 5, color: POSTER.black }).moveTo(x.x1, x.y1).lineTo(x.x2, x.y2).stroke({ width: 2, color: POSTER.cream });
    for (const fl of b.flying) {
      this.flyer(g, fl.kind, fl.x, fl.y, Math.floor(this.clockNow * 12) * 1.1);
    }
    const tape = room(b).tape;
    if (tape && b.tape) {
      const beat = this.frameNo % 4;
      for (let i = 0; i < 3; i++) g.arc(tape[0] + 26, tape[1], 12 + i * 9 + beat * 2, -0.8, 0.8).stroke({ width: 3, color: POSTER.red });
    }
  }

  /** A thing in flight, spinning in steps of the 12 fps frame. */
  private flyer(g: Graphics, kind: WeaponKind, x: number, y: number, spin: number): void {
    const c = Math.cos(spin) * 2.2;
    const sn = Math.sin(spin) * 2.2;
    // Drawn as a short bar with a cream outline: at this speed the shape doesn't read, the motion does.
    const len = kind === 'leg' || kind === 'poker' || kind === 'shovel' ? 9 : 5;
    g.moveTo(x - c * len, y - sn * len).lineTo(x + c * len, y + sn * len).stroke({ width: 9, color: POSTER.cream, cap: 'round' });
    g.moveTo(x - c * len, y - sn * len).lineTo(x + c * len, y + sn * len).stroke({ width: 5, color: POSTER.black, cap: 'round' });
  }

  /** The reach of the general's voice: rays from him stopped by walls, as a polygon. */
  private voice2(g: Graphics, x: number, y: number, radius: number, fill: { color: number; alpha: number }, line: number): void {
    const pts: number[] = [];
    const n = 72;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const d = reach(this.b, x, y, ang, radius, 'sound');
      pts.push(x + Math.cos(ang) * d, y + Math.sin(ang) * d);
    }
    g.poly(pts).fill(fill);
    g.poly(pts).stroke({ width: 3, color: line });
  }

  private placeBarks(): void {
    for (const bk of [...this.barks]) {
      if (bk.until <= this.clockNow) {
        bk.el.remove();
        this.barks.splice(this.barks.indexOf(bk), 1);
        continue;
      }
      const u = find(this.b, bk.id);
      // Kept inside the frame: half the plate's width, in reference pixels, from either edge.
      const half = bk.el.offsetWidth / this.ctx.stage.fit.scale / 2 + 12;
      const x = Math.max(half, Math.min(REF_W - half, u?.x ?? 640));
      const y = Math.max(70, (u?.y ?? 270) - 30);
      bk.el.style.left = `calc(${x} * var(--u))`;
      bk.el.style.top = `calc(${y} * var(--u))`;
    }
  }

  // ---------- the end ----------

  /** «Ну? Бей.» — and the player strikes or lowers his hands. */
  private async final(): Promise<'killed' | 'spared'> {
    const b = this.b;
    this.closeOverlay();
    this.held.clear();
    const g = find(b, GENERAL)!;
    const p = player(b);
    // The two of them alone: the player a step from the corner, facing him.
    const away = Math.atan2(270 - g.y, 640 - g.x);
    p.x = g.x + Math.cos(away) * 84;
    p.y = g.y + Math.sin(away) * 84;
    p.dir = away + Math.PI;
    g.dir = away;
    g.mode = 'sit';
    await this.talk(GENERAL_LINES.final, { timeoutMs: 1800 });
    const choice = await new Promise<'killed' | 'spared'>((resolve) => {
      const pickIt = (c: 'killed' | 'spared') => {
        window.removeEventListener('keydown', onKey);
        this.closeOverlay();
        resolve(c);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.repeat) return;
        if (e.code === 'Digit1' || e.code === 'Numpad1') pickIt('killed');
        else if (e.code === 'Digit2' || e.code === 'Numpad2') pickIt('spared');
      };
      window.addEventListener('keydown', onKey);
      const buttons = h('div', { class: 'mt-buttons' }, this.button('Ударить', '1', () => pickIt('killed'), true), this.button('Опустить руки', '2', () => pickIt('spared')));
      this.overlayPlate = h('div', { class: 'mt-plate mt-center', attrs: { role: 'dialog', 'aria-label': 'Ну? Бей.' } }, h('p', { class: 'big', text: '«НУ? БЕЙ.»' }), buttons);
      this.hud.append(this.overlayPlate);
      buttons.querySelector('button')?.focus({ preventScroll: true });
    });
    if (choice === 'killed') {
      this.strikes.set(PLAYER, this.frameNo + 3);
      await this.sleep(0.15);
      g.mode = 'down';
      g.killedBy = PLAYER;
      // No word on the edge this time: only the blow, and quiet.
      this.kill({ t: 'kill', id: GENERAL, by: PLAYER, weapon: p.weapon, x: g.x, y: g.y, dir: p.dir }, false);
      this.kills++;
    } else {
      // The hands go down; whatever was in them falls to the floor.
      if (p.weapon !== 'fists') {
        b.items.push({ id: b.nextId++, kind: p.weapon, x: p.x + Math.cos(p.dir) * 18, y: p.y + Math.sin(p.dir) * 18, ammo: p.ammo });
        p.weapon = 'fists';
        this.sound.noise({ dur: 0.08, filter: 'highpass', freq: 1800, gain: 0.25 });
      }
    }
    await this.sleep(1.6);
    return choice;
  }

  /** «Летопись бунта»: ROSTA windows, one after another, each with its caption underneath. */
  private async chronicle(list: Frame[], captions: string[]): Promise<void> {
    const layer = new Container();
    layer.addChild(new Graphics().rect(0, 0, REF_W, REF_H - 180).fill(POSTER.cream).rect(5, 5, REF_W - 10, REF_H - 190).stroke({ width: 10, color: POSTER.black }));
    this.view.addChild(layer);
    this.overlay.visible = false;
    const n = list.length;
    const gap = 18;
    const w = Math.min(228, (1200 - (n - 1) * gap) / n);
    const ph = 300;
    const x0 = (REF_W - (n * w + (n - 1) * gap)) / 2;
    const top = 74;
    this.roomPlate.hidden = true;
    const title = h('p', { class: 'mt-plate mt-chron-title', text: 'ЛЕТОПИСЬ БУНТА' });
    this.hud.append(title);
    const els: HTMLElement[] = [title];
    for (let i = 0; i < n; i++) {
      const panel = frameCut(list[i]!, w, ph);
      panel.position.set(x0 + i * (w + gap), top);
      layer.addChild(panel);
      const text = captions[i] ?? '';
      const dot = text.indexOf('. ');
      const cap = h('p', { class: 'mt-chron' }, h('span', { class: 'n', text: text.slice(0, dot + 1) }), ` ${text.slice(dot + 2)}`);
      cap.style.left = `calc(${x0 + i * (w + gap)} * var(--u))`;
      cap.style.top = `calc(${top + ph + 10} * var(--u))`;
      cap.style.width = `calc(${w} * var(--u))`;
      this.hud.append(cap);
      els.push(cap);
      this.ctx.audio.stomp(1);
      if (!this.calm) await this.sleep(0.9);
    }
    const next = h('p', { class: 'mt-plate mt-next' }, h('kbd', { text: 'Пробел' }), ' — дальше');
    this.hud.append(next);
    els.push(next);
    await new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener('keydown', onKey);
        resolve();
      };
      const onKey = (e: KeyboardEvent) => {
        if (!e.repeat && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
          e.preventDefault();
          done();
        }
      };
      window.addEventListener('keydown', onKey);
      next.addEventListener('click', done, { once: true });
    });
    for (const el of els) el.remove();
    layer.destroy({ children: true });
    this.overlay.visible = true;
  }

  /**
   * «Свет гаснет»: the lamp clicks off, the mutiny's poster tears all at once, and under it is what really
   * happened — grey paper figures of comrades on the floor, not a drop of red. Then dark.
   */
  private async lightsOut(): Promise<void> {
    const L = this.L;
    const gl = this.glasses;
    if (!L || !gl) return;
    // Whoever still stands goes into both layers, so the tear shows them too.
    for (const u of this.b.units) {
      if (!alive(u) || u.mode === 'gone') continue;
      const cut = new RatCut(u.side === 'player' ? 'player' : 'loyal', u.face);
      cut.update(u, u.mode === 'sit' ? 'sit' : 'rest', 0, u.side === 'ally' || u.side === 'player');
      L.bodiesPoster.addChild(cut.root);
      L.bodiesTruth.addChild(standingCut(u));
    }
    if (this.b.sofa) {
      const ps = sofaCut(this.b.sofa, false);
      const ts = sofaCut(this.b.sofa, true);
      ps.position.set(this.b.sofa.x, this.b.sofa.y);
      ts.position.set(this.b.sofa.x, this.b.sofa.y);
      L.bodiesPoster.addChild(ps);
      L.bodiesTruth.addChild(ts);
    }
    this.overlay.visible = false;
    this.refresh();
    this.roomPlate.remove();
    await this.sleep(0.5);
    this.ctx.audio.click();
    const tearFor = this.calm ? 0.5 : 1.1;
    const t0 = this.clockNow;
    while (this.clockNow - t0 < tearFor) {
      const k = (this.clockNow - t0) / tearFor;
      gl.setT(MUTINY.t + (MUTINY.tDark - MUTINY.t) * (1 - (1 - k) * (1 - k)));
      this.stale = true;
      await this.sleep(0);
    }
    gl.setT(MUTINY.tDark);
    this.stale = true;
    await this.sleep(2);
    const f0 = this.clockNow;
    while (this.clockNow - f0 < 1.2) {
      this.view.alpha = 1 - (this.clockNow - f0) / 1.2;
      await this.sleep(0);
    }
    this.view.alpha = 0;
  }
}
