/**
 * The blind striker (concept §6 «Ударник»). The screen is black; the player has the partner's voice from
 * where he stands in the zone, the other coordinators' voices from theirs, a haze of smell, sound around the
 * head, touch underfoot and the heart. Keys are relative to where the player looks: the top of the screen is
 * always «ahead», and sounds and lines turn with the head. Following the partner is not required — the
 * battle remembers it, and trust moves with it.
 *
 * Alone (battle 3, after the partner falls) there is no voice at all: only the dark, the smell, the sound.
 * In the barracks after the mutiny (the riot) it is so from the start: no lamp either — the stove's crackle is
 * the one fixed sound — and the bunks are felt with the paws.
 */
import { perform, plan, takesBlow } from '../../core/ai.ts';
import { beginTurn, CMD_LABEL, creepPhase, endTurn, phases, relative, smell, stepPhase, strike, unit, type Attack, type Battle, type Cmd, type Ev, type Unit } from '../../core/battle.ts';
import { captionsOn } from '../../core/settings.ts';
import { say, said } from '../../core/voice.ts';
import { TUNING } from '../../content/battles.ts';
import { nameOf, PLAYER_ID, SOLDIERS, soldier, wordsOf, type Signal } from '../../content/soldiers.ts';
import { BattleSound, where, type Spot } from '../../engine/spatial.ts';
import { isTyping } from '../../ui/dom.ts';
import { StrikerHud } from './striker/hud.ts';
import { StrikerScene } from './striker/scene.ts';
import { cases } from './cases.ts';
import { bump, type BattleContext, type BattleStage, type StageExit } from './types.ts';

/** The coordinators stand this far behind the near edge (rows run 0..8); the lamp hangs over the zone's middle. */
const ZONE_Y = 9.6;
const LAMP = { x: 4, y: 9.9 };
/** In the barracks there is no lamp: the stove by the near wall crackles instead. */
const STOVE = { x: 7, y: 9.2 };
/** Heart rate for 3, 2 and 1 hits left. */
const BPM: Record<number, number> = { 3: 62, 2: 88, 1: 124 };
const SIGNAL_WORD: Record<Signal, string> = { whistle: 'свист', snap: 'щелчок пальцами', cough: 'покашливание', pipe: 'стук по трубе' };

const KEYMAP: Record<string, Cmd> = {
  KeyW: 'step',
  ArrowUp: 'step',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  KeyQ: 'turnL',
  ArrowLeft: 'turnL',
  KeyE: 'turnR',
  ArrowRight: 'turnR',
  KeyX: 'about',
  KeyZ: 'stay',
  Space: 'jump',
  KeyF: 'sniff',
  KeyG: 'cover',
};

type Phase = 'intro' | 'listen' | 'decide' | 'exec' | 'done';

export interface StrikerOptions {
  /** No voice behind the player: battle 3 after the partner fell, or the riot from the start. */
  solo?: boolean;
  /** What the dark says before the first turn alone. */
  intro?: { title: string; sub: string };
}

interface Timer {
  at: number;
  done: () => void;
}

export class StrikerStage implements BattleStage {
  private readonly ctx: BattleContext;
  private readonly solo: boolean;
  private readonly intro0: { title: string; sub: string } | null;
  /** The barracks after the mutiny: no lamp, the stove for a beacon, the bunks underfoot. */
  private readonly barracks: boolean;
  private readonly sound: BattleSound;
  private readonly scene: StrikerScene;
  private readonly hud: StrikerHud;
  private readonly offLayout: () => void;
  private readonly b: Battle;
  /** The stage's own clock: stops while paused, so every timed decision waits too. */
  private time = 0;
  private last = performance.now();
  private paused = false;
  private dead = false;
  private timers: Timer[] = [];
  private phase: Phase = 'intro';
  private queue: Cmd[] = [];
  private slots = 3;
  private execIndex = -1;
  private countdown: { from: number; to: number } | null = null;
  private submit: (() => void) | null = null;
  private skip: (() => void) | null = null;
  /** NPC strikers hit last turn: their quirks are on. */
  private npcScared = new Set<string>();
  private next = { lamp: 600, drip: 1800, scrape: 2500, beat: 400 };
  private stoveCaptioned = false;
  private lampCaptioned = false;
  /** The player's last cell and facing, for placing sounds after a fall. */
  private me: Pick<Unit, 'x' | 'y' | 'dir'>;

  constructor(ctx: BattleContext, opts: StrikerOptions = {}) {
    this.ctx = ctx;
    this.b = ctx.battle;
    this.solo = !!opts.solo;
    this.intro0 = opts.intro ?? null;
    this.barracks = ctx.def.place === 'barracks';
    this.sound = new BattleSound(ctx.audio);
    this.scene = new StrikerScene(ctx.def.t >= 0.6);
    ctx.stage.root.addChild(this.scene.view);
    this.hud = new StrikerHud(ctx.ui);
    this.hud.setCaptions(captionsOn(ctx.settings));
    this.hud.done.addEventListener('click', this.onDone);
    this.offLayout = ctx.stage.onLayout((fit) => this.hud.layout(fit));
    const u = unit(this.b, PLAYER_ID);
    this.me = { x: u.x, y: u.y, dir: u.dir };
    window.addEventListener('keydown', this.onKey);
    ctx.stage.app.ticker.add(this.tick);
  }

  // ---------- the clock ----------

  private sleep(ms: number): Promise<void> {
    return new Promise((done) => this.timers.push({ at: this.time + ms, done }));
  }

  /** Something to do later on the stage's clock, without waiting for it. */
  private after(ms: number, fn: () => void): void {
    void this.sleep(ms).then(() => {
      if (!this.dead) fn();
    });
  }

  private readonly tick = (): void => {
    const now = performance.now();
    // A hidden tab stops the ticker; the gap is not counted.
    const dt = Math.min(250, now - this.last);
    this.last = now;
    if (this.dead) return;
    if (!this.paused) {
      this.time += dt;
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        for (const t of due) t.done();
      }
      this.ambience();
    }
    if (this.countdown) this.hud.setBar(Math.max(0, (this.countdown.to - this.time) / (this.countdown.to - this.countdown.from)));
    this.scene.update(this.paused ? 0 : dt / 1000, this.ctx.reduced);
  };

  // ---------- the run ----------

  async run(): Promise<StageExit> {
    const b = this.b;
    this.hud.layout(this.ctx.stage.fit);
    this.hud.showDock(false);
    this.updateScents();
    this.drawDebug();
    if (!b.over) {
      this.hud.setTurn(this.turnLabel(Math.max(1, b.turn + 1)));
      await this.sleep(900);
      if (this.solo) {
        const say = this.intro0 ?? { title: `${cases(this.nameOf(this.ctx.def.partner)).gen} больше нет.`, sub: 'Дальше — без голоса за спиной: только запах и звук.' };
        await this.intro(say.title, say.sub);
      }
      else if (b.turn === 0) await this.whisper();
      while (!b.over && unit(b, PLAYER_ID).alive && !this.dead) await this.turn();
    }
    this.phase = 'done';
    return unit(b, PLAYER_ID).alive ? 'over' : 'playerFell';
  }

  private turnLabel(n: number): string {
    return `Ход ${n} из ${this.b.maxTurns}`;
  }

  /** Before the first turn the partner explains his words once, in a whisper. */
  private async whisper(): Promise<void> {
    const words = wordsOf(this.ctx.def.partner, this.ctx.names);
    const text = words.step || words.step2 ? 'Слушай. «Чуток» — это шаг. «Раз-два» — два шага. Я сзади.' : 'Слушай. Я сзади. Иди на мой голос.';
    this.speak(this.ctx.def.partner, text, { whisper: true, hint: 'Enter — дальше' });
    await Promise.race([this.sleep(9000), new Promise<void>((r) => (this.skip = r))]);
    this.skip = null;
    this.hud.fadeLines();
    await this.sleep(500);
  }

  private async intro(title: string, sub: string): Promise<void> {
    this.hud.say(title, `${sub} Enter\u00a0— дальше.`);
    await Promise.race([this.sleep(5000), new Promise<void>((r) => (this.skip = r))]);
    this.skip = null;
    this.hud.say(null);
    await this.sleep(400);
  }

  private async turn(): Promise<void> {
    const b = this.b;
    const memory = this.ctx.memory;
    this.present(beginTurn(b));
    const me = unit(b, PLAYER_ID);
    this.phase = 'listen';
    this.queue = [];
    this.slots = me.actions;
    this.execIndex = -1;
    this.scene.haze.sniff(false);
    this.updateScents();
    this.hud.setTurn(this.turnLabel(b.turn));
    this.hud.setSack(me.bag);
    this.hud.showDock(true);
    this.renderQueue();
    this.hud.setBar(this.ctx.settings.noTimer ? null : 1);
    bump(memory, 'turns');
    // «Готово» counts from the start of the turn: the player may act without waiting for the voice.
    let early = false;
    const decided = new Promise<void>((r) => {
      this.submit = () => {
        early = true;
        r();
      };
    });

    // Everyone's coordinators plan from the last flash; the player's own plan is the partner's.
    const npcPlans = new Map<string, Cmd[]>();
    const voices: { coord: string; striker: string; cmds: Cmd[] }[] = [];
    for (const u of b.units) {
      if (!u.alive || u.id === PLAYER_ID) continue;
      const c = this.voiceOf(u);
      const p = plan(b, u.id, c ? {} : { blind: TUNING.smellRange });
      npcPlans.set(u.id, p.cmds);
      if (c && !this.solo) voices.push({ coord: c, striker: u.id, cmds: p.cmds });
    }
    const partner = this.solo ? null : this.voiceOf(me);
    const words = wordsOf(this.ctx.def.partner, this.ctx.names);
    const scared = memory.playerScared;
    let asked: Cmd[] = [];
    let line = '';
    if (partner) {
      const p = plan(b, PLAYER_ID);
      const meant = this.withSniff(p.cmds);
      asked = said(meant, words, scared);
      line = say(meant, words, { scared });
      const list = (cmds: readonly Cmd[]) => cmds.map((c) => CMD_LABEL[c]).join(' · ') || '—';
      if (this.ctx.debug) this.hud.debug(`задумал: ${p.intent}\n  ${list(meant)}\nсказал:  ${list(asked)}${scared ? '\n(напуган: путает стороны)' : ''}\nдоверие: ${memory.trust}`);
    }

    // The others shout around the partner's line: the first before it, the rest over the player's time.
    voices.forEach((v, i) => {
      this.after(i === 0 ? 1300 : 3300 + (i - 1) * 1100, () => {
        if (this.phase !== 'listen' && this.phase !== 'decide') return;
        this.speak(v.coord, say(v.cmds, wordsOf(v.coord, this.ctx.names), { scared: this.npcScared.has(v.striker), to: this.nameOf(v.striker) }));
      });
    });

    await Promise.race([this.sleep((partner ? TUNING.listenDelay : 1.2) * 1000), decided]);
    if (partner) this.speak(partner, line, { partner: true });
    this.phase = 'decide';
    if (!early) {
      if (!this.ctx.settings.noTimer) this.countdown = { from: this.time, to: this.time + TUNING.strikerSeconds * 1000 };
      await Promise.race([this.ctx.settings.noTimer ? new Promise<void>(() => undefined) : this.sleep(TUNING.strikerSeconds * 1000), decided]);
    }
    this.submit = null;
    this.countdown = null;
    this.phase = 'exec';
    this.hud.setBar(this.ctx.settings.noTimer ? null : 0);
    this.hud.fadeLines();

    // Did the player do as the partner said? Empty slots count as «стой».
    const n = Math.max(this.slots, this.queue.length);
    let ownWay = false;
    for (let i = 0; i < n; i++) {
      const did = this.queue[i] ?? 'stay';
      if (partner && did === (asked[i] ?? 'stay')) bump(memory, 'followed');
      else if (partner || this.queue[i]) {
        bump(memory, 'ownWay');
        ownWay = true;
      }
    }
    const before = { crushed: memory.stats.crushed ?? 0, hits: memory.stats.hitsTaken ?? 0, blows: memory.stats.blowsTaken ?? 0 };
    const hurt = new Set<string>();

    // Execution: everyone's i-th action at once, NPCs in their own manner.
    const steps = Math.max(phases(b), this.queue.length);
    for (let i = 0; i < steps && unit(b, PLAYER_ID).alive && !this.dead; i++) {
      this.execIndex = i;
      this.renderQueue();
      const plans = new Map<string, Cmd[]>();
      for (const u of b.units) {
        if (!u.alive) continue;
        let cmd = u.id === PLAYER_ID ? this.queue[i] : npcPlans.get(u.id)?.[i];
        if (cmd && u.id !== PLAYER_ID) cmd = perform(b, u.id, cmd, i, SOLDIERS[u.id]?.quirks ?? [], { scared: this.npcScared.has(u.id), trust: 1 });
        const arr: Cmd[] = [];
        if (cmd) arr[i] = cmd;
        plans.set(u.id, arr);
      }
      this.present(stepPhase(b, plans, i), hurt);
      this.updateScents();
      this.drawDebug();
      await this.sleep(TUNING.stepSeconds * 1000);
    }
    this.execIndex = -1;
    this.renderQueue();

    // The creatures crawl; a blow on the player is taken by the partner once he trusts the player enough.
    if (unit(b, PLAYER_ID).alive) {
      const { ev, attacks } = creepPhase(b);
      this.presentCreep(ev);
      for (const a of attacks) this.resolve(a, hurt);
      this.updateScents();
      this.drawDebug();
      await this.sleep(1000);
    }

    // The partner's verdict, and trust.
    const crushed = (memory.stats.crushed ?? 0) > before.crushed;
    const hit = (memory.stats.hitsTaken ?? 0) > before.hits;
    let reply = '';
    if (partner && unit(b, PLAYER_ID).alive) {
      if (ownWay) {
        reply = crushed ? 'Ты что творишь?! …Молодец.' : 'Ты что творишь?!';
        if (hit) memory.trust = Math.max(0, memory.trust - 1);
      } else {
        reply = crushed ? 'Молодец.' : hit ? 'Прости…' : '';
        memory.trust = Math.min(3, memory.trust + 1);
      }
    }
    memory.playerScared = hurt.has(PLAYER_ID) || (memory.stats.blowsTaken ?? 0) > before.blows;
    this.npcScared = new Set([...hurt].filter((id) => id !== PLAYER_ID));

    const end = endTurn(b);
    this.present(end);
    if (b.outcome === 'retreat') {
      this.retreatSounds();
      if (partner) reply = 'Уходят. Уходят! Слышишь меня?';
    }
    this.ctx.commit();
    this.drawDebug();
    if (!unit(b, PLAYER_ID).alive) {
      // The heart stops; a moment of nothing before the battle hands over.
      this.hud.showDock(false);
      await this.sleep(2200);
      return;
    }
    if (reply && partner) {
      this.speak(partner, reply, { partner: true, signal: false });
      await this.sleep(1700);
      this.hud.fadeLines();
    }
    await this.sleep(600);
  }

  /** The coordinator who speaks for u, if he is still in the zone (never the player: he is out here). */
  private voiceOf(u: Unit): string | null {
    if (!u.coord || (u.coord === PLAYER_ID && u.id !== PLAYER_ID)) return null;
    return this.b.coords.find((c) => c.id === u.coord && c.alive)?.id ?? null;
  }

  /** The partner asks for a sniff instead of standing still when something is close. */
  private withSniff(cmds: Cmd[]): Cmd[] {
    if (!smell(this.b, PLAYER_ID, TUNING.smellRange).length) return cmds;
    const i = cmds.indexOf('stay');
    if (i < 0) return cmds;
    const out = [...cmds];
    out[i] = 'sniff';
    return out;
  }

  private resolve(a: Attack, hurt: Set<string>): void {
    const b = this.b;
    if (!unit(b, a.s).alive) return;
    if (a.s === PLAYER_ID) {
      const cover = !this.solo && takesBlow(b, PLAYER_ID, { forPlayer: true, trust: this.ctx.memory.trust });
      this.present(strike(b, a, cover), hurt);
      if (cover) {
        bump(this.ctx.memory, 'blowsTaken');
        const partner = this.voiceOf(unit(b, PLAYER_ID));
        if (partner) this.speak(partner, 'Принимаю!', { partner: true, signal: false });
      }
      return;
    }
    const u = unit(b, a.s);
    const cover = takesBlow(b, a.s);
    this.present(strike(b, a, cover), hurt);
    const c = this.voiceOf(u);
    if (cover && c && !this.solo) this.speak(c, 'Принимаю!', { signal: false });
  }

  // ---------- geometry: the world around the player ----------

  /** A world point relative to the player: x to the right, z ahead. */
  private rel(wx: number, wy: number): Spot {
    const u = unit(this.b, PLAYER_ID);
    if (u.alive) this.me = { x: u.x, y: u.y, dir: u.dir };
    const r = relative(this.me.dir, wx - this.me.x, wy - this.me.y);
    return { x: r.right, z: r.ahead };
  }

  private coordSpot(id: string): Spot {
    const c = this.b.coords.find((it) => it.id === id);
    return this.rel(c?.x ?? 4, ZONE_Y);
  }

  private updateScents(): void {
    const u = unit(this.b, PLAYER_ID);
    this.scene.haze.setScents(u.alive ? smell(this.b, PLAYER_ID, TUNING.smellRange) : []);
  }

  private drawDebug(): void {
    if (this.ctx.debug) this.scene.drawMap(this.b);
  }

  // ---------- lines, captions and sounds ----------

  /** A coordinator's line from where he stands, after his signal (the signal can be left out). */
  private speak(id: string, text: string, opts: { partner?: boolean; whisper?: boolean; hint?: string; signal?: boolean } = {}): void {
    const s = soldier(id);
    const spot = this.coordSpot(id);
    if (opts.signal !== false) {
      this.sound.signal(s.signal, spot);
      this.hud.caption(`${this.nameOf(id)}: ${SIGNAL_WORD[s.signal]} — ${where(spot)}`);
    }
    this.hud.line(id, text, spot, { name: this.nameOf(id), hand: s.hand, partner: opts.partner, whisper: opts.whisper, hint: opts.hint });
  }

  private nameOf(id: string): string {
    return id === PLAYER_ID ? 'ты' : nameOf(id, this.ctx.names);
  }

  private present(evs: readonly Ev[], hurt?: Set<string>): void {
    const b = this.b;
    let neighbourSteps = false;
    for (const e of evs) {
      switch (e.t) {
        case 'move':
        case 'jump':
          if (e.s === PLAYER_ID) {
            if (e.t === 'jump') {
              this.sound.noise({ dur: 0.16, filter: 'bandpass', freq: 600, to: 2400, q: 1.5, gain: 0.25 });
              this.after(180, () => this.sound.thud({ x: 0, z: 0.2 }));
            } else this.sound.step(undefined, 0.38);
          } else {
            const spot = this.rel(e.to[0], e.to[1]);
            this.sound.step(spot, 0.22);
            if (!neighbourSteps && Math.hypot(spot.x, spot.z) < 3.5) this.hud.caption(`шаги — ${where(spot)}`);
            neighbourSteps = true;
          }
          break;
        case 'turn':
          if (e.s === PLAYER_ID) this.sound.step(undefined, 0.1);
          break;
        case 'wall':
          if (e.s === PLAYER_ID) {
            this.sound.thud({ x: 0, z: 0.5 });
            this.hud.caption(this.barracks ? 'лапа упёрлась в стену казармы' : 'лапа упёрлась в стену туннеля');
          }
          break;
        case 'obstacle':
          if (e.s === PLAYER_ID) {
            this.sound.thud({ x: 0, z: 0.5 });
            // Boards creak under the paw.
            this.sound.noise({ dur: 0.22, filter: 'bandpass', freq: 520, to: 380, q: 6, gain: 0.16, spot: { x: 0, z: 0.6 } });
            this.hud.caption('лапа упёрлась в нары');
          }
          break;
        case 'bump':
          if (e.s === PLAYER_ID) {
            this.sound.thud({ x: 0, z: 0.5 });
            this.hud.caption(`лапа упёрлась в своего — ${this.nameOf(e.other)}`);
          }
          break;
        case 'blocked':
          if (e.s === PLAYER_ID) {
            this.sound.thud({ x: 0, z: 0.6 });
            this.sound.rustle({ x: 0, z: 1 }, 0.4, 0.3);
            this.hud.caption('впереди что-то плотное, не поддаётся');
          }
          break;
        case 'crush': {
          const mine = e.s === PLAYER_ID;
          const spot = mine ? { x: 0, z: 0.3 } : this.rel(e.at[0], e.at[1]);
          this.sound.crunch(spot);
          if (mine) {
            bump(this.ctx.memory, 'crushed');
            this.scene.bump(e.strong ? 0.35 : 0.2);
            this.hud.caption(e.strong ? 'под тобой хрустнуло что-то большое' : 'под лапой что-то смялось');
          } else this.hud.caption(`хруст — ${where(spot)}`);
          break;
        }
        case 'capture':
          if (e.s === PLAYER_ID) {
            this.sound.sack({ x: 0, z: 1 });
            bump(this.ctx.memory, 'caught');
            this.hud.caption('мешок дёргается: что-то живое внутри');
          }
          break;
        case 'miss':
          if (e.s === PLAYER_ID) this.hud.caption(unit(b, PLAYER_ID).bag ? 'мешок упал в пустоту' : 'мешка больше нет');
          break;
        case 'trap': {
          const mine = e.s === PLAYER_ID;
          const spot = mine ? undefined : this.rel(e.at[0], e.at[1]);
          if (e.kind === 'pit') this.sound.sag(spot);
          else if (e.kind === 'mine') this.sound.pop(spot);
          else this.sound.twang(spot);
          if (mine) this.hud.caption(e.kind === 'pit' ? 'пол проседает — яма' : e.kind === 'mine' ? 'хлопок под полом — мина' : 'лапа в петле: следующий ход короче');
          else if (spot) this.hud.caption(`${e.kind === 'snare' ? 'звон проволоки' : e.kind === 'pit' ? 'треск досок' : 'хлопок'} — ${where(spot)}`);
          break;
        }
        case 'secret':
          if (e.s === PLAYER_ID) {
            this.sound.paper();
            bump(this.ctx.memory, 'secrets');
            this.hud.caption(e.kind === 'hp' ? 'под лапой бумажка — и дышать легче' : 'под лапой бумажка — в лапах лёгкость');
          }
          break;
        case 'lost':
          if (e.s === PLAYER_ID) this.hud.caption('лапа в петле — не шагнуть');
          break;
        case 'hit':
        case 'graze':
          hurt?.add(e.s);
          if (e.s === PLAYER_ID) {
            this.sound.cry(undefined, 1.05);
            this.scene.hurt(this.ctx.settings.reduceFlashes ? 0.3 : 0.6);
            if (e.t === 'hit') bump(this.ctx.memory, 'hitsTaken');
            this.hud.caption('удар!');
          } else {
            const u = unit(b, e.s);
            const spot = this.rel(u.x, u.y);
            this.sound.cry(spot, 0.85 + (e.s.length % 4) * 0.08);
            this.hud.caption(`вскрик — ${where(spot)}`);
          }
          break;
        case 'coordHit': {
          const spot = this.coordSpot(e.c);
          this.sound.cry(spot, 0.92);
          this.hud.caption(`вскрик ${e.c === this.ctx.def.partner ? cases(this.nameOf(e.c)).gen : 'в зоне'} — ${where(spot)}`);
          break;
        }
        case 'coordDown':
          if (!this.solo) this.hud.caption(`${this.nameOf(e.c)}: голоса больше не слышно`);
          break;
        case 'fall':
          if (e.s !== PLAYER_ID) this.hud.caption(`${this.nameOf(e.s)}: тишина`);
          break;
        case 'arrive': {
          const spot = this.rel(e.at[0], e.at[1]);
          this.sound.rustle(spot, 0.8, 0.12);
          this.hud.caption(`новый шорох — ${where(spot)}`);
          break;
        }
        default:
          break;
      }
    }
  }

  /** The creatures' crawl: rustles from where they are now, the nearest two captioned. */
  private presentCreep(evs: readonly Ev[]): void {
    const spots: Spot[] = [];
    for (const e of evs) {
      if (e.t !== 'creep') continue;
      const spot = this.rel(e.to[0], e.to[1]);
      const d = Math.hypot(spot.x, spot.z);
      if (d > 5.5) continue;
      this.sound.rustle(spot, 0.7, Math.max(0.06, 0.28 - d * 0.04));
      spots.push(spot);
    }
    spots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    for (const s of spots.slice(0, 2)) if (Math.hypot(s.x, s.z) <= 3.5) this.hud.caption(`шорох — ${where(s)}`);
  }

  private retreatSounds(): void {
    for (let i = 0; i < 4; i++) this.after(i * 250, () => this.sound.rustle({ x: Math.cos(i * 1.7) * 4, z: Math.sin(i * 1.7) * 4 }, 1.2, 0.08));
    this.hud.caption('шорох уходит в темноту');
  }

  /** The beacon lamp, drips, creatures that don't keep still while the player thinks, and the heart. */
  private ambience(): void {
    const b = this.b;
    const me = unit(b, PLAYER_ID);
    if (this.phase === 'done' || !me.alive) return;
    const t = this.time;
    if (t >= this.next.lamp) {
      this.next.lamp = t + TUNING.flashEvery * 1000;
      if (this.barracks) this.stove();
      else {
        const spot = this.rel(LAMP.x, LAMP.y);
        this.sound.lamp(spot);
        if (!this.lampCaptioned) {
          this.lampCaptioned = true;
          this.hud.caption(`щелчок лампы — ${where(spot)}: там зона`);
        }
      }
    }
    if (t >= this.next.drip) {
      this.next.drip = t + 2500 + Math.random() * 3500;
      this.sound.drip({ x: Math.random() * 8 - 4, z: Math.random() * 8 - 4 });
    }
    if (t >= this.next.scrape) {
      this.next.scrape = t + 1700 + Math.random() * 600;
      if (this.phase === 'listen' || this.phase === 'decide') {
        const near = b.creatures
          .filter((c) => c.alive)
          .map((c) => this.rel(c.x, c.y))
          .sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))
          .slice(0, 3);
        for (const s of near) {
          const d = Math.hypot(s.x, s.z);
          if (d < 4.5) this.sound.rustle(s, 0.35, Math.max(0.04, 0.16 - d * 0.025));
        }
      }
    }
    if (t >= this.next.beat) {
      const hp = Math.max(1, Math.min(3, me.hp));
      this.next.beat = t + 60000 / (BPM[hp] ?? 62);
      this.sound.heart(hp === 1 ? 0.6 : hp === 2 ? 0.48 : 0.36);
      // Heard nothing (no sound) or reading captions: the heart shows on the frame edge.
      if (!this.ctx.audio.running || this.hud.captionsOn) this.scene.pulse();
    }
  }

  /** The stove's crackle: two or three dry clicks from one place, the barracks' only fixed sound. */
  private stove(): void {
    const spot = this.rel(STOVE.x, STOVE.y);
    const at = this.sound.now;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) this.sound.noise({ dur: 0.018, filter: 'highpass', freq: 1800 + Math.random() * 2200, gain: 0.22, spot, at: at + i * (0.05 + Math.random() * 0.09) });
    this.sound.noise({ dur: 0.4, filter: 'lowpass', freq: 260, gain: 0.05, spot, attack: 0.1 });
    if (!this.stoveCaptioned) {
      this.stoveCaptioned = true;
      this.hud.caption(`треск печки — ${where(spot)}`);
    }
  }

  // ---------- input ----------

  private renderQueue(): void {
    const open = this.phase === 'listen' || this.phase === 'decide';
    this.hud.setQueue(this.queue, this.slots, this.execIndex, open);
  }

  private readonly onDone = (): void => {
    this.hud.done.blur();
    if (!this.paused) this.submit?.();
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.dead || this.phase === 'done' || e.repeat || isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'KeyP') {
      e.preventDefault();
      this.paused = !this.paused;
      this.hud.say(this.paused ? 'Пауза' : null, this.paused ? 'P — продолжить' : undefined);
      return;
    }
    if (this.paused) return;
    if (e.code === 'KeyC') {
      e.preventDefault();
      this.hud.toggleCaptions();
      return;
    }
    const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
    if (this.skip && (enter || e.code === 'Space')) {
      e.preventDefault();
      this.skip();
      return;
    }
    if (this.phase !== 'listen' && this.phase !== 'decide') return;
    if (enter) {
      e.preventDefault();
      this.submit?.();
      return;
    }
    if (e.code === 'Backspace') {
      e.preventDefault();
      // A sniff has already been spent: it stays.
      const last = this.queue[this.queue.length - 1];
      if (last && last !== 'sniff') {
        this.queue.pop();
        this.sound.uiTick();
      }
      this.renderQueue();
      return;
    }
    const cmd = KEYMAP[e.code];
    if (!cmd) return;
    e.preventDefault();
    if (cmd === 'cover' && !unit(this.b, PLAYER_ID).bag) return;
    const last = this.queue[this.queue.length - 1];
    if (cmd === 'step' && last === 'step') this.queue[this.queue.length - 1] = 'step2';
    else {
      if (this.queue.length >= this.slots) return;
      this.queue.push(cmd);
    }
    if (cmd === 'sniff') {
      this.scene.haze.sniff(true);
      bump(this.ctx.memory, 'sniffs');
      this.sound.noise({ dur: 0.35, filter: 'bandpass', freq: 1800, to: 900, q: 1.2, gain: 0.12, attack: 0.08, bus: 'ui' });
    } else this.sound.uiTick();
    this.renderQueue();
  };

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.phase = 'done';
    window.removeEventListener('keydown', this.onKey);
    this.offLayout();
    this.ctx.stage.app.ticker.remove(this.tick);
    for (const t of this.timers) t.done();
    this.timers = [];
    this.hud.destroy();
    this.scene.view.removeFromParent();
    this.scene.destroy();
  }
}
