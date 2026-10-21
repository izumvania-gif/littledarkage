/**
 * The fight itself, without drawing or sound: actors, weapons, the general's revolver and voice, and the
 * enemies' small state machines (stand → heard → run → wind-up → recover; down; dead). It reports what
 * happened as events; main.ts turns them into blood, shake, sound and plates.
 */
import { ALLY_START, angleDiff, angleTo, castSeg, DOOR, dist, EXIT, findPath, GENERAL_SPOTS, GENERAL_START, los, pushOut, reach, SIGHT, SOLIDS, START, TAPE, walkable, type Pt, type Rect } from './room.ts';

export type Kind = 'player' | 'ally' | 'man' | 'general' | 'krypotkin';
export type ItemKind = 'stool' | 'leg' | 'poker' | 'mug' | 'boot';
export type State = 'stand' | 'heard' | 'run' | 'windup' | 'recover' | 'down' | 'dead' | 'aim' | 'inhale' | 'flee' | 'gone';
export type How = 'weapon' | 'fists' | 'throw' | 'shot';

export const ITEM: Record<ItemKind, { name: string; acc: string; reach: number; kills: boolean }> = {
  stool: { name: 'табуретка', acc: 'табуретку', reach: 54, kills: true },
  leg: { name: 'ножка от нар', acc: 'ножку от нар', reach: 60, kills: true },
  poker: { name: 'кочерга', acc: 'кочергу', reach: 66, kills: true },
  mug: { name: 'кружка', acc: 'кружку', reach: 40, kills: false },
  boot: { name: 'сапог', acc: 'сапог', reach: 40, kills: false },
};

const FIST_REACH = 40;
const ARC = (55 * Math.PI) / 180;
export const VOICE_RADIUS = 400;
const VOICE_INHALE = 0.5;
const VOICE_FREEZE = 1.0;
const VOICE_SILENCE = 6;
const AIM_TIME = 0.6;
const AIM_LOCK = 0.2;
const SHOT_GAP = 2.2;
const DOWN_TIME = 2.5;
const WINDUP = 0.25;
const SPEED = { player: 250, ally: 225, man: 232, manWalk: 125, general: 150, krypotkin: 72 };

export interface Actor {
  id: number;
  kind: Kind;
  name: string;
  x: number;
  y: number;
  r: number;
  face: number;
  state: State;
  /** Timer of the current state. */
  t: number;
  hold: ItemKind | null;
  freeze: number;
  vx: number;
  vy: number;
  target: Actor | null;
  lastSeen: Pt | null;
  noise: Pt | null;
  path: Pt[];
  pathT: number;
  /** Locked direction of a wind-up. */
  swing: number;
  /** 0..1 while a swing is drawn. */
  swingT: number;
  cooldown: number;
  dest: Pt | null;
  barkT: number;
  killer: string | null;
  ammo: number;
  /** Points a man walks between while nothing happens. */
  patrol: Pt[] | null;
}

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  rot: number;
  vx: number;
  vy: number;
  flying: boolean;
  thrower: Actor | null;
  travelled: number;
}

export type WEv =
  | { t: 'swing'; a: Actor; weapon: boolean }
  | { t: 'kill'; victim: Actor; by: Actor | null; how: How; dir: number }
  | { t: 'knock'; victim: Actor; by: Actor | null; how: How; dir: number }
  | { t: 'throw'; a: Actor }
  | { t: 'clatter'; x: number; y: number }
  | { t: 'pick'; item: ItemKind }
  | { t: 'aim' }
  | { t: 'shot'; from: Pt; to: Pt }
  | { t: 'empty' }
  | { t: 'inhale' }
  | { t: 'bark'; drowned: boolean; froze: Actor[]; hid: boolean }
  | { t: 'say'; a: Actor; text: string }
  | { t: 'tape'; on: boolean }
  | { t: 'flee' }
  | { t: 'gone' }
  | { t: 'clear' }
  | { t: 'dead' };

export interface Input {
  mx: number;
  my: number;
  aim: Pt;
  attack: boolean;
  throw: boolean;
  use: boolean;
}

/** Numbers of one attempt, for the observer. */
export interface AttemptStats {
  killsWeapon: number;
  killsFists: number;
  knocksThrow: number;
  throws: number;
  shouts: number;
  froze: number;
  hid: number;
  drowned: number;
  tapeAt: number | null;
}

const KRYP_LINES = ['Ребята, не надо', 'Не надо, ребята…', 'Мы же свои!', 'Опомнитесь!', 'Ребята…'];

const label = (a: Actor | null): string => (!a ? 'никто' : a.kind === 'player' ? 'ты' : a.kind === 'ally' ? 'союзник' : a.kind === 'general' ? 'генерал' : 'люди генерала');

export class World {
  time = 0;
  readonly actors: Actor[] = [];
  readonly items: Item[] = [];
  events: WEv[] = [];
  tapeOn = false;
  /** The voice in progress: reach polygon and 0..1 of the inhale. */
  voice: { poly: Pt[]; k: number } | null = null;
  /** The general's aiming line while he aims. */
  aimLine: { from: Pt; to: Pt; locked: boolean } | null = null;
  cleared = false;
  readonly stats: AttemptStats = { killsWeapon: 0, killsFists: 0, knocksThrow: 0, throws: 0, shouts: 0, froze: 0, hid: 0, drowned: 0, tapeAt: null };
  private nextId = 1;
  private firstShout = true;
  readonly player: Actor;
  readonly ally: Actor;
  readonly general: Actor;
  readonly kryp: Actor;

  constructor() {
    this.player = this.add('player', 'ты', START.x, START.y, 0);
    this.ally = this.add('ally', 'союзник', ALLY_START.x, ALLY_START.y, 0, 'leg');
    // The first one stands with his back to the door the player comes in by.
    this.add('man', 'спиной', 236, 604, 0).state = 'stand';
    this.add('man', 'с табуреткой', 560, 458, -Math.PI / 2, 'stool');
    // The one with the bunk leg walks the middle and looks into the near half now and then.
    this.add('man', 'с ножкой', 840, 400, Math.PI, 'leg').patrol = [
      { x: 840, y: 400 },
      { x: 600, y: 450 },
    ];
    this.add('man', 'у двери', 1040, 168, Math.PI / 2);
    this.general = this.add('general', 'генерал', GENERAL_START.x, GENERAL_START.y, Math.PI * 0.75);
    this.general.ammo = 6;
    this.general.cooldown = 2.5;
    // For the general barkT is the silence before he may shout again.
    this.general.barkT = 3;
    this.kryp = this.add('krypotkin', 'Крыпоткин', 600, 250, Math.PI / 2);
    this.kryp.barkT = 1.5;
    this.drop('boot', 150, 470);
    this.drop('mug', 440, 300);
    this.drop('poker', 1090, 650);
  }

  private add(kind: Kind, name: string, x: number, y: number, face: number, hold: ItemKind | null = null): Actor {
    const a: Actor = { id: this.nextId++, kind, name, x, y, r: kind === 'general' ? 15 : 14, face, state: 'stand', t: 0, hold, freeze: 0, vx: 0, vy: 0, target: null, lastSeen: null, noise: null, path: [], pathT: 0, swing: face, swingT: 0, cooldown: 0, dest: null, barkT: 0, killer: null, ammo: 0, patrol: null };
    this.actors.push(a);
    return a;
  }

  private drop(kind: ItemKind, x: number, y: number): Item {
    const it: Item = { id: this.nextId++, kind, x, y, rot: Math.random() * Math.PI * 2, vx: 0, vy: 0, flying: false, thrower: null, travelled: 0 };
    this.items.push(it);
    return it;
  }

  get men(): Actor[] {
    return this.actors.filter((a) => a.kind === 'man');
  }

  alive(a: Actor): boolean {
    return a.state !== 'dead' && a.state !== 'gone';
  }

  /** The item the player stands on, if any. */
  underfoot(): Item | null {
    let best: Item | null = null;
    let bd = 34;
    for (const it of this.items) {
      if (it.flying) continue;
      const d = dist(it, this.player);
      if (d < bd) {
        best = it;
        bd = d;
      }
    }
    return best;
  }

  nearTape(): boolean {
    return dist(this.player, TAPE) < 92;
  }

  /** Debug: every man for the general falls at once. */
  killAll(): void {
    for (const m of this.men) if (this.alive(m)) this.kill(m, null, 'weapon', 0);
  }

  update(dt: number, input: Input): void {
    this.time += dt;
    this.updatePlayer(dt, input);
    for (const a of this.actors) {
      if (a.swingT > 0) a.swingT = Math.max(0, a.swingT - dt * 7);
      if (a.kind === 'man') this.updateMan(a, dt);
      else if (a.kind === 'ally') this.updateAlly(a, dt);
      else if (a.kind === 'general') this.updateGeneral(a, dt);
      else if (a.kind === 'krypotkin') this.updateKryp(a, dt);
    }
    this.updateItems(dt);
    this.separate();
    if (!this.cleared && this.men.every((m) => !this.alive(m)) && this.general.state === 'gone' && this.alive(this.player)) {
      this.cleared = true;
      this.events.push({ t: 'clear' });
    }
  }

  // ---------- the player ----------

  private updatePlayer(dt: number, input: Input): void {
    const p = this.player;
    if (!this.alive(p)) return;
    p.cooldown -= dt;
    if (p.freeze > 0) {
      p.freeze -= dt;
      return;
    }
    const len = Math.hypot(input.mx, input.my);
    if (len > 0) this.move(p, (input.mx / len) * SPEED.player * dt, (input.my / len) * SPEED.player * dt);
    p.face = angleTo(p, input.aim);
    if (input.attack && p.cooldown <= 0) this.playerSwing();
    if (input.throw && p.hold) this.throwItem(p, input.aim);
    if (input.use) {
      const it = this.underfoot();
      if (it) {
        const had = p.hold;
        p.hold = it.kind;
        this.items.splice(this.items.indexOf(it), 1);
        if (had) this.drop(had, p.x, p.y);
        this.events.push({ t: 'pick', item: it.kind });
      } else if (this.nearTape()) {
        this.tapeOn = !this.tapeOn;
        if (this.tapeOn && this.stats.tapeAt === null) this.stats.tapeAt = this.time;
        this.events.push({ t: 'tape', on: this.tapeOn });
      }
    }
  }

  private playerSwing(): void {
    const p = this.player;
    const kind = p.hold;
    const kills = !!kind && ITEM[kind].kills;
    const reachPx = kind ? ITEM[kind].reach : FIST_REACH;
    p.cooldown = kills ? 0.34 : 0.26;
    p.swingT = 1;
    this.events.push({ t: 'swing', a: p, weapon: kills });
    for (const v of this.actors) {
      if (v === p || v.kind === 'ally' || v.kind === 'general' || !this.alive(v)) continue;
      if (!this.inArc(p, v, p.face, reachPx)) continue;
      if (v.kind === 'krypotkin') this.kill(v, p, kills ? 'weapon' : 'fists', p.face);
      else if (kills) this.kill(v, p, 'weapon', p.face);
      else if (v.state === 'down') this.kill(v, p, 'fists', p.face);
      else this.knock(v, p, 'fists', p.face);
    }
    this.noise(p, 200);
  }

  private inArc(a: Actor, v: Actor, dir: number, reachPx: number): boolean {
    const d = dist(a, v);
    if (d - v.r > reachPx) return false;
    if (d > a.r + v.r && Math.abs(angleDiff(dir, angleTo(a, v))) > ARC) return false;
    return los(a, v, SIGHT);
  }

  private throwItem(a: Actor, aim: Pt): void {
    if (!a.hold) return;
    const dir = angleTo(a, aim);
    const it = this.drop(a.hold, a.x + Math.cos(dir) * (a.r + 6), a.y + Math.sin(dir) * (a.r + 6));
    it.flying = true;
    it.vx = Math.cos(dir) * 900;
    it.vy = Math.sin(dir) * 900;
    it.thrower = a;
    a.hold = null;
    a.swingT = 1;
    if (a.kind === 'player') this.stats.throws++;
    this.events.push({ t: 'throw', a });
  }

  private updateItems(dt: number): void {
    for (const it of this.items) {
      if (!it.flying) continue;
      const step = Math.hypot(it.vx, it.vy) * dt;
      const nx = it.x + it.vx * dt;
      const ny = it.y + it.vy * dt;
      const t = castSeg(it, { x: nx, y: ny }, SIGHT);
      let stop = false;
      for (const v of this.actors) {
        if (v === it.thrower || v.kind === 'ally' || v.kind === 'player' || v.kind === 'general' || !this.alive(v) || v.state === 'down') continue;
        if (dist({ x: nx, y: ny }, v) < v.r + 8) {
          if (v.kind === 'krypotkin') this.kill(v, it.thrower, 'throw', Math.atan2(it.vy, it.vx));
          else {
            this.knock(v, it.thrower, 'throw', Math.atan2(it.vy, it.vx));
            if (it.thrower?.kind === 'player') this.stats.knocksThrow++;
          }
          stop = true;
          break;
        }
      }
      if (t < 1) {
        it.x += it.vx * dt * t * 0.9;
        it.y += it.vy * dt * t * 0.9;
        stop = true;
        this.events.push({ t: 'clatter', x: it.x, y: it.y });
      } else {
        it.x = nx;
        it.y = ny;
      }
      it.rot += dt * 18;
      it.travelled += step;
      if (stop || it.travelled > 720) {
        it.flying = false;
        it.thrower = null;
        it.vx = 0;
        it.vy = 0;
      }
    }
  }

  // ---------- hits ----------

  private knock(v: Actor, by: Actor | null, how: How, dir: number): void {
    v.state = 'down';
    v.t = DOWN_TIME;
    // A punch shoves him a little (the follow-up can still reach); a thrown stool sends him further.
    const push = how === 'throw' ? 170 : 110;
    v.vx = Math.cos(dir) * push;
    v.vy = Math.sin(dir) * push;
    v.freeze = 0;
    if (v.hold) {
      this.drop(v.hold, v.x + Math.cos(dir) * 26, v.y + Math.sin(dir) * 26);
      v.hold = null;
    }
    this.events.push({ t: 'knock', victim: v, by, how, dir });
    this.noise(v, 260);
  }

  private kill(v: Actor, by: Actor | null, how: How, dir: number): void {
    if (!this.alive(v)) return;
    v.state = 'dead';
    v.killer = label(by);
    v.freeze = 0;
    if (v.hold) {
      this.drop(v.hold, v.x + Math.cos(dir) * 30, v.y + Math.sin(dir) * 30);
      v.hold = null;
    }
    if (by?.kind === 'player' && v.kind === 'man') {
      if (how === 'weapon') this.stats.killsWeapon++;
      else if (how === 'fists') this.stats.killsFists++;
    }
    this.events.push({ t: 'kill', victim: v, by, how, dir });
    if (v.kind === 'player') this.events.push({ t: 'dead' });
    this.noise(v, 380);
  }

  /** Someone heard something: men standing about turn and come to look. */
  private noise(at: Pt, radius: number): void {
    for (const m of this.men) {
      if ((m.state === 'stand' || m.state === 'heard') && m.freeze <= 0 && dist(m, at) < radius) {
        m.state = 'heard';
        m.noise = { x: at.x, y: at.y };
        m.t = 1.4;
        m.path = [];
      }
    }
  }

  // ---------- movement ----------

  private move(a: Actor, dx: number, dy: number): void {
    a.x += dx;
    a.y += dy;
    const solids: readonly Rect[] = a.kind === 'general' && a.state === 'flee' ? SOLIDS : [...SOLIDS, DOOR];
    for (let i = 0; i < 2; i++) for (const rc of solids) pushOut(a, a.r, rc);
  }

  /** Walks toward goal: straight when nothing is in the way, else along an A* path refreshed now and then. */
  private walk(a: Actor, goal: Pt, speed: number, dt: number): boolean {
    const d = dist(a, goal);
    if (d < 4) return true;
    let next: Pt = goal;
    if (!walkable(a, goal, a.r - 2)) {
      a.pathT -= dt;
      if (a.pathT <= 0 || !a.path.length) {
        a.path = findPath(a, goal);
        a.pathT = 0.35;
      }
      while (a.path.length > 1 && dist(a, a.path[0]!) < 12) a.path.shift();
      next = a.path[0] ?? goal;
    } else a.path = [];
    const nd = dist(a, next) || 1;
    const k = Math.min(speed * dt, nd);
    this.move(a, ((next.x - a.x) / nd) * k, ((next.y - a.y) / nd) * k);
    a.face = turnToward(a.face, angleTo(a, next), dt * 10);
    return false;
  }

  private separate(): void {
    const live = this.actors.filter((a) => this.alive(a) && a.state !== 'down');
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!;
        const b = live[j]!;
        const d = dist(a, b);
        const min = a.r + b.r;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const ux = (b.x - a.x) / d;
          const uy = (b.y - a.y) / d;
          this.move(a, -ux * push, -uy * push);
          this.move(b, ux * push, uy * push);
        }
      }
    }
  }

  private slide(a: Actor, dt: number): void {
    if (Math.abs(a.vx) + Math.abs(a.vy) < 2) return;
    this.move(a, a.vx * dt, a.vy * dt);
    const k = Math.exp(-dt * 7);
    a.vx *= k;
    a.vy *= k;
  }

  // ---------- the general's men ----------

  private sees(m: Actor, v: Actor, alerted: boolean): boolean {
    if (!this.alive(v)) return false;
    const d = dist(m, v);
    if (d > 560) return false;
    // From behind he notices only a touch: the first man can be reached with his back turned.
    if (!alerted && d > 34 && Math.abs(angleDiff(m.face, angleTo(m, v))) > (60 * Math.PI) / 180) return false;
    return los(m, v, SIGHT);
  }

  private pickTarget(m: Actor, alerted: boolean): Actor | null {
    let best: Actor | null = null;
    for (const v of [this.player, this.ally]) {
      if (this.sees(m, v, alerted) && (!best || dist(m, v) < dist(m, best))) best = v;
    }
    return best;
  }

  private updateMan(m: Actor, dt: number): void {
    if (!this.alive(m)) return;
    m.cooldown -= dt;
    if (m.state === 'down') {
      this.slide(m, dt);
      m.t -= dt;
      if (m.t <= 0) {
        m.state = 'run';
        m.target = this.player;
        m.lastSeen = { x: this.player.x, y: this.player.y };
      }
      return;
    }
    if (m.freeze > 0) {
      m.freeze -= dt;
      if (m.state === 'windup') m.state = 'run';
      return;
    }
    const reachPx = m.hold ? ITEM[m.hold].reach : FIST_REACH;
    switch (m.state) {
      case 'stand': {
        const t = this.pickTarget(m, false);
        if (t) this.alert(m, t);
        else if (m.patrol) {
          m.t -= dt;
          const goal = m.patrol[0]!;
          if (m.t <= 0 && this.walk(m, goal, SPEED.manWalk, dt)) {
            // Stand a moment looking on, then the next point.
            m.patrol.push(m.patrol.shift()!);
            m.t = 1.6;
            m.face = angleTo(goal, m.patrol[0]!) + Math.PI;
          }
        }
        break;
      }
      case 'heard': {
        const t = this.pickTarget(m, false);
        if (t) {
          this.alert(m, t);
          break;
        }
        if (m.noise && this.walk(m, m.noise, SPEED.manWalk, dt)) {
          m.t -= dt;
          m.face += dt * 2.4;
          if (m.t <= 0) {
            m.state = 'stand';
            m.noise = null;
          }
        }
        break;
      }
      case 'run': {
        const seen = this.pickTarget(m, true);
        if (seen) {
          m.target = seen;
          m.lastSeen = { x: seen.x, y: seen.y };
        }
        const t = m.target;
        if (t && this.alive(t) && seen === t && dist(m, t) - t.r <= reachPx - 6 && m.cooldown <= 0) {
          m.state = 'windup';
          m.t = WINDUP;
          m.swing = angleTo(m, t);
          m.face = m.swing;
          break;
        }
        if (m.lastSeen) {
          if (this.walk(m, m.lastSeen, SPEED.man, dt) && !seen) {
            // Lost them: look around where they were last.
            m.state = 'heard';
            m.noise = m.lastSeen;
            m.t = 1.6;
          }
        } else m.state = 'stand';
        break;
      }
      case 'windup':
        m.t -= dt;
        if (m.t <= 0) {
          m.swingT = 1;
          this.events.push({ t: 'swing', a: m, weapon: !!m.hold });
          for (const v of [this.player, this.ally, this.kryp]) {
            if (this.alive(v) && this.inArc(m, v, m.swing, reachPx)) this.kill(v, m, m.hold ? 'weapon' : 'fists', m.swing);
          }
          m.state = 'recover';
          m.t = 0.35;
          m.cooldown = 0.5;
        }
        break;
      case 'recover':
        m.t -= dt;
        if (m.t <= 0) m.state = 'run';
        break;
      default:
        break;
    }
  }

  private alert(m: Actor, t: Actor): void {
    m.state = 'run';
    m.target = t;
    m.lastSeen = { x: t.x, y: t.y };
    m.path = [];
    // He shouts as he goes: the others come to look.
    this.noise(m, 420);
  }

  // ---------- the ally ----------

  private updateAlly(a: Actor, dt: number): void {
    if (!this.alive(a)) return;
    a.cooldown -= dt;
    if (a.freeze > 0) {
      a.freeze -= dt;
      if (a.state === 'windup') a.state = 'run';
      return;
    }
    const reachPx = a.hold ? ITEM[a.hold].reach : FIST_REACH;
    if (a.state === 'windup') {
      a.t -= dt;
      if (a.t <= 0) {
        a.swingT = 1;
        this.events.push({ t: 'swing', a, weapon: !!a.hold });
        for (const v of [...this.men, this.kryp]) {
          if (!this.alive(v) || !this.inArc(a, v, a.swing, reachPx)) continue;
          if (a.hold || v.state === 'down' || v.kind === 'krypotkin') this.kill(v, a, a.hold ? 'weapon' : 'fists', a.swing);
          else this.knock(v, a, 'fists', a.swing);
        }
        a.state = 'run';
        a.cooldown = 0.45;
      }
      return;
    }
    // Fight the nearest man who is already fighting (one standing about is the player's to start on),
    // near him or near the player; finish the ones on the floor first.
    let foe: Actor | null = null;
    let fd = Infinity;
    for (const m of this.men) {
      if (!this.alive(m) || m.state === 'stand' || m.state === 'heard') continue;
      // A man the player just knocked down is the player's to finish.
      if (m.state === 'down' && dist(this.player, m) < 140) continue;
      const d = dist(a, m) - (m.state === 'down' ? 80 : 0);
      if ((dist(a, m) < 320 || dist(this.player, m) < 200) && los(a, m, SIGHT) && d < fd) {
        foe = m;
        fd = d;
      }
    }
    if (foe) {
      if (dist(a, foe) - foe.r <= reachPx - 6 && a.cooldown <= 0) {
        a.state = 'windup';
        a.t = 0.2;
        a.swing = angleTo(a, foe);
        a.face = a.swing;
      } else this.walk(a, foe, SPEED.ally, dt);
      return;
    }
    if (this.alive(this.player) && dist(a, this.player) > 96) this.walk(a, this.player, SPEED.ally, dt);
  }

  // ---------- Krypotkin ----------

  private updateKryp(k: Actor, dt: number): void {
    if (!this.alive(k)) return;
    if (k.freeze > 0) {
      k.freeze -= dt;
      return;
    }
    k.t -= dt;
    if (k.t <= 0 || !k.dest) {
      k.t = 2.5;
      // Between the player and the nearest man still standing, a little to the side.
      const foe = this.men.filter((m) => this.alive(m) && m.state !== 'down').sort((a, b) => dist(a, this.player) - dist(b, this.player))[0];
      const mid = foe && this.alive(this.player) ? { x: (foe.x + this.player.x) / 2, y: (foe.y + this.player.y) / 2 } : { x: 300 + Math.random() * 700, y: 260 + Math.random() * 200 };
      k.dest = { x: mid.x + (Math.random() - 0.5) * 80, y: mid.y + (Math.random() - 0.5) * 80 };
    }
    this.walk(k, k.dest, SPEED.krypotkin, dt);
    k.barkT -= dt;
    if (k.barkT <= 0) {
      k.barkT = 4 + Math.random() * 3;
      this.events.push({ t: 'say', a: k, text: KRYP_LINES[Math.floor(Math.random() * KRYP_LINES.length)]! });
    }
  }

  // ---------- the general ----------

  private updateGeneral(g: Actor, dt: number): void {
    if (g.state === 'gone') return;
    if (g.state === 'flee') {
      const door = { x: (DOOR.x + DOOR.x + DOOR.w) / 2, y: 70 };
      const goal = g.y > 74 ? door : EXIT;
      if (g.y > 74) this.walk(g, goal, 260, dt);
      else {
        g.y -= 260 * dt;
        g.x += Math.sign(goal.x - g.x) * Math.min(Math.abs(goal.x - g.x), 260 * dt);
      }
      if (g.y < -20) {
        g.state = 'gone';
        this.events.push({ t: 'gone' });
      }
      return;
    }
    const p = this.player;
    const menLeft = this.men.some((m) => this.alive(m));
    if (!menLeft || (this.alive(p) && dist(g, p) < 95)) {
      g.state = 'flee';
      this.voice = null;
      this.aimLine = null;
      this.events.push({ t: 'flee' });
      return;
    }
    g.t -= dt;
    g.cooldown -= dt;
    g.barkT -= dt;
    if (g.state === 'inhale') {
      if (this.voice) this.voice.k = 1 - g.t / VOICE_INHALE;
      if (g.t <= 0) this.shout(g);
      return;
    }
    if (g.state === 'aim') {
      const tgt = g.target;
      if (!tgt || !this.alive(tgt)) {
        g.state = 'stand';
        this.aimLine = null;
        return;
      }
      if (g.t > AIM_LOCK) g.swing = angleTo(g, tgt);
      g.face = g.swing;
      const far = { x: g.x + Math.cos(g.swing) * 1400, y: g.y + Math.sin(g.swing) * 1400 };
      const end = this.bulletEnd(g, far);
      this.aimLine = { from: { x: g.x, y: g.y }, to: end.at, locked: g.t <= AIM_LOCK };
      if (g.t <= 0 && end.hit?.kind === 'man') {
        // One of his own stepped into the line: he holds fire and aims again in a moment.
        this.aimLine = null;
        g.state = 'stand';
        g.cooldown = 0.5;
        return;
      }
      if (g.t <= 0) {
        this.aimLine = null;
        g.ammo--;
        g.state = 'stand';
        g.cooldown = SHOT_GAP;
        this.events.push({ t: 'shot', from: { x: g.x, y: g.y }, to: end.at });
        if (end.hit) this.kill(end.hit, g, 'shot', g.swing);
        this.noise(g, 600);
      }
      return;
    }
    // Stay behind the men: keep away from the player, at a spot he can shoot from.
    if (this.alive(p) && (dist(g, p) < 300 || !g.dest)) {
      const spot = [...GENERAL_SPOTS].sort((a, b) => dist(b, p) - dist(a, p))[0]!;
      g.dest = spot;
    }
    if (g.dest) {
      this.walk(g, g.dest, SPEED.general, dt);
    }
    // The voice: only when the player is within reach, in sight, and not about to be cut down frozen.
    if (g.barkT <= 0 && this.alive(p) && dist(g, p) <= VOICE_RADIUS && los(g, p, SIGHT) && !this.danger()) {
      g.state = 'inhale';
      g.t = VOICE_INHALE;
      this.voice = { poly: reach(g, VOICE_RADIUS), k: 0 };
      this.events.push({ t: 'inhale' });
      return;
    }
    if (g.cooldown <= 0) {
      // He doesn't shoot through his own men (one may still step into the line while he aims).
      const tgt = [p, this.ally].find((v) => this.alive(v) && dist(g, v) < 760 && los(g, v, SIGHT) && !this.men.some((m) => this.alive(m) && m.state !== 'down' && nearSegment(m, g, v, m.r + 4)));
      if (tgt) {
        if (g.ammo <= 0) {
          g.cooldown = 3;
          this.events.push({ t: 'empty' });
          return;
        }
        g.state = 'aim';
        g.t = AIM_TIME;
        g.target = tgt;
        g.swing = angleTo(g, tgt);
        this.events.push({ t: 'aim' });
      }
    }
  }

  /** A man mid-swing next to the player: the general keeps quiet then (freezing the player there would be unfair). */
  private danger(): boolean {
    return this.men.some((m) => this.alive(m) && (m.state === 'windup' || m.state === 'recover') && dist(m, this.player) < 120);
  }

  private shout(g: Actor): void {
    const froze: Actor[] = [];
    const p = this.player;
    const inRange = this.alive(p) && dist(g, p) <= VOICE_RADIUS;
    const heard = inRange && los(g, p, SIGHT);
    if (!this.tapeOn) {
      for (const a of this.actors) {
        if (a === g || !this.alive(a) || a.state === 'down') continue;
        if (dist(g, a) <= VOICE_RADIUS && los(g, a, SIGHT)) {
          a.freeze = VOICE_FREEZE;
          froze.push(a);
        }
      }
    }
    this.stats.shouts++;
    if (this.tapeOn) this.stats.drowned++;
    else if (heard) this.stats.froze++;
    const hid = inRange && !heard && !this.tapeOn;
    if (hid) this.stats.hid++;
    this.events.push({ t: 'bark', drowned: this.tapeOn, froze, hid });
    if (this.firstShout && this.alive(this.ally) && !this.tapeOn) {
      this.firstShout = false;
      this.events.push({ t: 'say', a: this.ally, text: 'Магнитофон! Врубай!' });
    }
    g.state = 'stand';
    g.barkT = VOICE_SILENCE;
    this.voice = null;
  }

  /** Where a bullet from g toward far stops: the first wall or the first living body (his own men too). */
  private bulletEnd(g: Actor, far: Pt): { at: Pt; hit: Actor | null } {
    const t = castSeg(g, far, SIGHT);
    const end = { x: g.x + (far.x - g.x) * t, y: g.y + (far.y - g.y) * t };
    let hit: Actor | null = null;
    let best = dist(g, end);
    for (const a of this.actors) {
      if (a === g || !this.alive(a) || a.state === 'down') continue;
      // Distance from a to the segment g→end.
      const dx = end.x - g.x;
      const dy = end.y - g.y;
      const len2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((a.x - g.x) * dx + (a.y - g.y) * dy) / len2));
      const px = g.x + dx * u;
      const py = g.y + dy * u;
      if (Math.hypot(a.x - px, a.y - py) < a.r && u * Math.sqrt(len2) < best) {
        best = u * Math.sqrt(len2);
        hit = a;
      }
    }
    if (hit) return { at: { x: g.x + Math.cos(g.swing) * best, y: g.y + Math.sin(g.swing) * best }, hit };
    return { at: end, hit: null };
  }
}

function nearSegment(p: Pt, a: Pt, b: Pt, rad: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u)) < rad;
}

function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDiff(from, to);
  return from + Math.max(-maxStep, Math.min(maxStep, d));
}
