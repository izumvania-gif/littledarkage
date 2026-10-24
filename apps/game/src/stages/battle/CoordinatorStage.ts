/**
 * The coordinator's battle (concept §6 «Координатор»): the player stands in the zone and sees the tunnel only
 * in the flashes of the red lamp. Each turn: look (the field stands still, the lamp keeps time), give the
 * partner his commands from his side, then watch them carried out one flash a step, the creatures crawl,
 * and decide in two seconds whether to take a blow meant for him («Принять удар»).
 *
 * In battle 3 the player speaks for two: the partner and Крыпоткин, who has nobody else. The three commands
 * of a turn are shared between them (a tab says whom the next one is for), and a blow on either may be taken.
 *
 * Every flash renders the scene once into a snapshot texture; between flashes only that snapshot is shown,
 * fading over darkness. The poster («Красные очки») is rebaked only at a flash, when something moved.
 */
import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
import { perform, plan, takesBlow, type Mood } from '../../core/ai.ts';
import { act, beginTurn, CMD_LABEL, creepPhase, endTurn, mishears, ORDERS, phases, strike, unit, visible, type Battle, type Cmd, type Ev } from '../../core/battle.ts';
import { fieldLines } from '../../agent/describe.ts';
import { registerAgent } from '../../agent/hooks.ts';
import { say } from '../../core/voice.ts';
import { TUNING, type BattleDef } from '../../content/battles.ts';
import { nameOf, PLAYER_ID, SOLDIERS, wordsOf } from '../../content/soldiers.ts';
import { BattleSound } from '../../engine/spatial.ts';
import { glowTexture } from '../../render/kit.ts';
import { REF_H, REF_W } from '../../render/palette.ts';
import { RedGlasses } from '../../render/redGlasses.ts';
import type { Fit } from '../../render/stage.ts';
import { isTyping } from '../../ui/dom.ts';
import { BATTLE_HOLES, BattleField, type Scene } from './coordinator/field.ts';
import { FIELD_BOTTOM, heardAt, LAMP, pt, ZONE_Y, zoneX } from './coordinator/geometry.ts';
import { CoordinatorPanel, PAD, type Order, type Phase } from './coordinator/panel.ts';
import { cases } from './cases.ts';
import { bump, type BattleContext, type BattleStage, type StageExit } from './types.ts';
import { openSettings } from '../../ui/settings.ts';

/** A flash never comes sooner than this after the last one: no more than three a second. */
const MIN_FLASH_GAP = 1000 / 3;

const MOVES: readonly Cmd[] = ['step', 'step2', 'back', 'left', 'right', 'jump'];
const TURNS: readonly Cmd[] = ['turnL', 'turnR', 'about'];

const TARGET_KEYS = ['Digit1', 'Digit2', 'Digit3'];

/** What an NPC pair is up to this turn, for the lines and the debug layer «задумал → сказал → сделал». */
interface NpcTurn {
  id: string;
  coord: string | null;
  cmds: Cmd[];
  line: string | null;
  intent: string;
  did: string[];
}

const DID: Partial<Record<Ev['t'], string>> = { move: 'шаг', jump: 'прыжок', turn: 'поворот', wall: 'упёрся в стену', bump: 'упёрся в своего', blocked: 'упёрся в тварь', crush: 'раздавил', trap: 'ловушка', secret: 'секрет', stay: 'стоял', lost: 'пропустил' };

export class CoordinatorStage implements BattleStage {
  private readonly ctx: BattleContext;
  private readonly b: Battle;
  private readonly def: BattleDef;
  private readonly sound: BattleSound;
  private readonly field: BattleField;
  private readonly glasses: RedGlasses;
  private readonly view = new Container();
  private snapRT: RenderTexture;
  private readonly snapSprite: Sprite;
  private readonly wash = new Graphics();
  private readonly lampGlow: Sprite;
  private readonly glowTex = glowTexture(128);
  private readonly tallies = new Graphics();
  private readonly truthLayer = new Graphics();
  private readonly panel: CoordinatorPanel;
  private readonly calm: boolean;
  private readonly untimed: boolean;
  private readonly partner: string;
  /** The strikers the player speaks for, the partner first (two in battle 3). */
  private readonly mine: string[];
  /** Whom the next command is for. */
  private target: string;

  private crushed: Scene['crushed'] = [];
  /** NPC strikers hit last turn (they tremble; quirks switched on). The partner's state is in ctx.memory. */
  private scared = new Set<string>();
  private npc = new Map<string, NpcTurn>();
  /** What each of the player's strikers did this turn, for the debug layer. */
  private mineDid = new Map<string, string[]>();

  // Game time: stops while paused or the tab is hidden.
  private clock = 0;
  private last = performance.now();
  private paused = false;
  private waits: { at: number; resolve: () => void }[] = [];
  private lastFlash = -Infinity;
  private nextRhythm = Infinity;
  private flashing: Promise<void> | null = null;
  private trauma = 0;

  private phase: Phase = 'idle';
  private phaseStart = 0;
  private phaseEnd = Infinity;
  private phaseLength = 1;
  private phaseResolve: ((r: 'input' | 'timeout') => void) | null = null;
  private queue: Order[] = [];
  private slots = 0;
  private choice: boolean | null = null;
  private speeches: HTMLElement[] = [];
  private hinted = new Set<string>();
  private destroyed = false;

  private readonly offLayout: () => void;
  private readonly offAgent: () => void;
  private readonly tick = () => this.frame();
  private readonly onKey = (e: KeyboardEvent) => this.key(e);
  private readonly onVisible = () => {
    this.last = performance.now();
  };

  constructor(ctx: BattleContext) {
    this.ctx = ctx;
    this.b = ctx.battle;
    this.def = ctx.def;
    this.partner = ctx.def.partner;
    this.mine = [this.partner, ...this.b.units.filter((u) => u.coord === PLAYER_ID && u.id !== this.partner).map((u) => u.id)];
    this.target = this.partner;
    this.sound = new BattleSound(ctx.audio);
    this.calm = ctx.settings.reduceFlashes || ctx.reduced;
    this.untimed = ctx.settings.noTimer;

    const renderer = ctx.stage.app.renderer;
    const res = renderer.resolution * ctx.stage.fit.scale;
    this.field = new BattleField(this.def.t);
    this.glasses = new RedGlasses(renderer, this.field.truth, this.field.poster, BATTLE_HOLES, res);
    this.glasses.setT(this.def.t);
    this.snapRT = RenderTexture.create({ width: REF_W, height: REF_H, resolution: res });
    this.snapSprite = new Sprite(this.snapRT);
    this.snapSprite.alpha = 0;
    this.wash.rect(0, 0, REF_W, REF_H).fill(0xd83a28);
    this.wash.blendMode = 'add';
    this.wash.alpha = 0;
    this.lampGlow = new Sprite(this.glowTex);
    this.lampGlow.anchor.set(0.5);
    this.lampGlow.position.set(LAMP.x, LAMP.y);
    this.lampGlow.width = this.lampGlow.height = 150;
    this.lampGlow.tint = 0xff5a40;
    this.lampGlow.alpha = 0;
    this.truthLayer.visible = ctx.debug;
    this.view.addChild(new Graphics().rect(0, 0, REF_W, REF_H).fill(0x070606), this.snapSprite, this.wash, this.lampGlow, this.tallies, this.truthLayer);
    ctx.stage.root.addChild(this.view);

    this.panel = new CoordinatorPanel(
      ctx.ui,
      this.mine.map((id) => ({ id, ...cases(this.name(id)) })),
      this.untimed,
      {
        cmd: (c) => this.push(c),
        erase: () => this.erase(),
        done: () => this.done(),
        accept: (take) => this.decide(take),
        target: (id) => this.aim(id),
        settings: () => void openSettings(ctx.ui, ctx.settings),
      },
    );
    for (const id of this.mine) if (!unit(this.b, id).alive) this.panel.setGone(id);
    this.panel.debug.hidden = !ctx.debug;
    this.panel.setPhase('idle', 0);
    this.offLayout = ctx.stage.onLayout((fit) => this.layout(fit));
    ctx.stage.app.ticker.add(this.tick);
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisible);
    this.drawTallies();
    this.offAgent = this.agent();
  }

  /** Agent mode: the field in words, the commands as actions (agent/hooks.ts). */
  private agent(): () => void {
    const phaseWord: Record<Phase, string> = { idle: 'ждать', plan: 'смотреть на поле', orders: 'отдавать команды', exec: 'смотреть, как исполняют', prompt: 'принять удар или нет' };
    const two = this.mine.length > 1;
    return registerAgent({
      name: `Бой: координатор (${this.def.title})`,
      covers: '.cs',
      describe: () => {
        const me = this.b.coords.find((c) => c.id === PLAYER_ID);
        const queue = this.queue.map((o, i) => `${i + 1}. ${two ? `${this.name(o.to)}: ` : ''}${CMD_LABEL[o.cmd]}`).join('; ');
        return [
          `Ход ${this.b.turn} из ${this.b.maxTurns}. Сейчас: ${phaseWord[this.phase]}.${me ? ` Ваши хиты: ${me.hp}.` : ''}`,
          ...fieldLines(visible(this.b), (id) => this.name(id), this.mine),
          this.phase === 'plan' || this.phase === 'orders' ? `Команды за ход: ${queue || 'пока нет'} (всего можно ${this.slots}${two ? `, сейчас — для ${this.name(this.target)}` : ''}). Команды — от лица ударника: его лево, его право.` : '',
          this.phase === 'prompt' ? 'Тварь бьёт вашего ударника: принять удар на себя (accept) или нет (decline)?' : '',
          // What the zone shouts and the plates say (the panel itself is covered by these words).
          ...[...this.ctx.ui.querySelectorAll<HTMLElement>('.cs .cs-speech, .cs .cs-hint, .cs .cs-note, .cs .cs-accept')]
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.innerText.trim().replace(/\s*\n\s*/g, ' '))
            .filter(Boolean),
        ].filter(Boolean);
      },
      actions: () => {
        if (this.phase === 'prompt') return [{ id: 'accept', label: 'Принять удар на себя' }, { id: 'decline', label: 'Не принимать' }];
        if (this.phase !== 'plan' && this.phase !== 'orders') return [];
        const to = two ? `кому: ${this.mine.filter((id) => unit(this.b, id).alive).join(' | ')} (по умолчанию ${this.target})` : undefined;
        return [
          ...ORDERS.map((c) => ({ id: `order:${c}`, label: `Команда «${CMD_LABEL[c]}»`, ...(to ? { arg: to } : {}) })),
          ...(this.queue.length && this.phase === 'orders' ? [{ id: 'erase', label: 'Стереть последнюю команду' }] : []),
          { id: 'done', label: this.phase === 'plan' ? 'Готово: насмотрелся, к командам' : 'Готово: команды отданы' },
          { id: 'auto', label: 'Скомандовать, как другие координаторы: по тому, что видно во вспышке, — и «готово»' },
        ];
      },
      perform: async (id, arg) => {
        const [verb, rest] = id.split(':');
        if (verb === 'auto') {
          if (this.phase !== 'plan' && this.phase !== 'orders') return 'Сейчас не время для команд.';
          // From the look to the orders: the battle's own promise moves on in a few microtasks.
          if (this.phase === 'plan') this.done();
          for (let i = 0; i < 50 && this.phase === 'plan'; i++) await Promise.resolve();
          if (this.phase !== 'orders') return 'Команд в этом ходу нет.';
          // The planner the other coordinators use, from the same flash; shared commands go round in turn.
          const seen = visible(this.b);
          const living = this.mine.filter((m) => unit(this.b, m).alive);
          const plans = living.map((m) => plan(seen, m).cmds);
          for (let i = 0; i < 4 && this.queue.length < this.slots; i++)
            living.forEach((m, k) => {
              const c = plans[k]?.[i];
              if (!c || this.queue.length >= this.slots) return;
              this.aim(m);
              this.push(c);
            });
          const said = this.queue.map((o) => `${two ? `${this.name(o.to)}: ` : ''}${CMD_LABEL[o.cmd]}`).join(' · ') || 'стоять';
          this.done();
          return `Команды: ${said}. Готово.`;
        }
        if (verb === 'order' && (ORDERS as readonly string[]).includes(rest ?? '')) {
          if (arg) {
            const want = arg.toLowerCase();
            const who = this.mine.find((m) => m === want || this.name(m).toLowerCase().startsWith(want));
            if (!who) return `Нет такого ударника: ${arg}.`;
            this.aim(who);
          }
          const before = this.queue.length;
          this.push(rest as Cmd);
          return this.queue.length > before ? `${two ? `${this.name(this.target)}: ` : ''}«${CMD_LABEL[rest as Cmd]}».` : 'Команда не поместилась: больше нельзя.';
        }
        if (verb === 'erase') return (this.erase(), 'Стёрто.');
        if (verb === 'done') return (this.done(), 'Готово.');
        if (verb === 'accept' || verb === 'decline') return (this.decide(verb === 'accept'), verb === 'accept' ? 'Удар — на себя.' : 'Пусть бьёт.');
        return null;
      },
      busy: () => !this.destroyed && this.phase === 'exec',
      waiting: () => this.phase === 'plan' || this.phase === 'orders' || this.phase === 'prompt',
    });
  }

  // ---------- the battle ----------

  async run(): Promise<StageExit> {
    this.sound.siren(2.4);
    await this.sleep(1.4);
    await this.flash();
    for (;;) {
      const exit = await this.turn();
      if (exit) return exit;
    }
  }

  private async turn(): Promise<StageExit | null> {
    const b = this.b;
    this.handle(beginTurn(b));
    // Three commands a turn (more after a secret), shared when he speaks for two.
    const living = this.mine.map((id) => unit(b, id)).filter((u) => u.alive);
    this.slots = Math.max(0, ...living.map((u) => u.actions));
    if (!unit(b, this.target).alive && living[0]) this.aim(living[0].id);
    this.queue = [];
    this.mineDid = new Map(this.mine.map((id) => [id, []]));
    this.clearSpeech();
    this.panel.setTurn(b.turn, b.maxTurns);
    this.panel.setQueue(this.queue, this.slots);
    this.bump('turns');
    if (b.turn === 1 && this.def.goal && this.mine.includes(this.def.goal.striker)) this.panel.note(this.def.goal.note, 12000);

    // Look: nothing moves while the coordinators look, and the lamp keeps time.
    this.npc = this.planNpcs();
    this.teach('look');
    this.nextRhythm = this.clock;
    const looked = await this.wait('plan', TUNING.planSeconds);
    if (looked === 'input' && !this.queue.length) this.bump('doneEarly');

    // Speak: ten seconds, the others shouting too.
    if (this.slots > 0) {
      this.teach('speak');
      this.shout();
      const r = await this.wait('orders', TUNING.ordersSeconds);
      if (r === 'timeout' && this.queue.length < this.slots) this.bump('timeouts');
    }
    this.nextRhythm = Infinity;
    this.panel.hint(null);
    const said = [...this.queue];
    this.bump('orders', said.length);
    const toPartner = said.filter((o) => o.to === this.partner).map((o) => o.cmd);
    const firstMove = toPartner.findIndex((c) => MOVES.includes(c));
    if (firstMove > 0 && toPartner.slice(0, firstMove).some((c) => TURNS.includes(c))) this.bump('turnedFirst');
    const heard = this.crossTalk(said);

    // Watch: every command step is one flash.
    this.setPhase('exec');
    await this.sleep(0.4);
    const steps = phases(b);
    for (let i = 0; i < steps; i++) {
      this.handle(this.step(i, heard));
      await this.flash();
      await this.sleep(TUNING.stepSeconds);
    }
    const { ev, attacks } = creepPhase(b);
    this.clearSpeech();
    this.handle(ev);
    await this.flash();
    await this.sleep(TUNING.stepSeconds * 0.7);
    for (const a of attacks) {
      const target = unit(b, a.s);
      if (!target.alive) continue;
      let take: boolean;
      const me = b.coords.find((c) => c.id === PLAYER_ID);
      if (this.mine.includes(a.s) && me?.alive) {
        take = await this.offer(a.s);
      } else take = takesBlow(b, a.s);
      this.handle(strike(b, a, take));
      await this.flash();
      await this.sleep(0.5);
    }
    const end = endTurn(b);
    this.handle(end);
    if (end.some((e) => e.t === 'fall' || e.t === 'coordDown' || e.t === 'retreat')) await this.flash();

    // What this turn leaves behind: who trembles next turn, trust, the save.
    this.ctx.memory.partnerScared = this.hitThisTurn.has(this.partner) && unit(b, this.partner).alive;
    this.scared = new Set([...this.hitThisTurn].filter((id) => id !== this.partner));
    this.hitThisTurn.clear();
    for (const id of this.mine) if (!unit(b, id).alive) this.panel.setGone(id);
    this.debugText();
    this.ctx.commit();
    await this.sleep(TUNING.stepSeconds * 0.6);

    const me = b.coords.find((c) => c.id === PLAYER_ID);
    if (me && !me.alive) return 'playerFell';
    // Battle 3: the partner's fall is not the end while the player is still to walk out (core keeps it going).
    if (!unit(b, this.partner).alive && !b.over) return 'partnerFell';
    if (b.over) return 'over';
    return null;
  }

  /** The partner (and every NPC striker) carries out the i-th command as he heard it, in his own way. */
  private step(i: number, heard: ReadonlyMap<string, readonly Cmd[]>): Ev[] {
    const b = this.b;
    const ev: Ev[] = [];
    for (const u of b.units) {
      if (!u.alive) continue;
      const mine = this.mine.includes(u.id);
      const cmd = mine ? heard.get(u.id)?.[i] : this.npc.get(u.id)?.cmds[i];
      if (!cmd && u.actions <= 0) continue;
      const mood: Mood = u.id === this.partner ? { scared: this.ctx.memory.partnerScared, trust: this.ctx.memory.trust } : { scared: this.scared.has(u.id), trust: 1 };
      const done = perform(b, u.id, cmd ?? 'stay', i, SOLDIERS[u.id]?.quirks ?? [], mood);
      ev.push(...act(b, u.id, done));
    }
    return ev;
  }

  /** The other coordinators plan from the same flash the player sees; a striker left without a voice goes by smell. */
  private planNpcs(): Map<string, NpcTurn> {
    const out = new Map<string, NpcTurn>();
    const b = this.b;
    for (const u of b.units) {
      if (!u.alive || this.mine.includes(u.id)) continue;
      const c = u.coord ? b.coords.find((it) => it.id === u.coord && it.alive) : undefined;
      const p = plan(b, u.id, c ? {} : { blind: TUNING.smellRange });
      const words = c ? wordsOf(c.id, this.ctx.names) : null;
      out.set(u.id, { id: u.id, coord: c?.id ?? null, cmds: p.cmds, line: words ? say(p.cmds, words, { scared: this.scared.has(u.id), to: this.name(u.id) }) : null, intent: p.intent, did: [] });
    }
    return out;
  }

  /** The NPC coordinators' lines during the orders window, each after its signal, from where they stand. */
  private shout(): void {
    let delay = TUNING.ordersSeconds * 0.03;
    for (const t of this.npc.values()) {
      if (!t.line || !t.coord) continue;
      const coord = this.b.coords.find((c) => c.id === t.coord);
      if (!coord) continue;
      const at = delay;
      const line = t.line;
      const who = this.name(coord.id);
      const col = coord.x;
      void this.sleep(at).then(() => {
        if (this.destroyed || (this.phase !== 'orders' && this.phase !== 'exec')) return;
        this.speeches.push(this.panel.speech(zoneX(col), ZONE_Y - 52, who, line, SOLDIERS[coord.id]?.hand ?? 'serif'));
        this.sound.signal(SOLDIERS[coord.id]?.signal ?? 'cough', { x: col - 4, z: 0.4 });
      });
      delay += TUNING.ordersSeconds * 0.09;
    }
  }

  /**
   * The one random thing (concept «Напарник и другие пары»): with several voices at once, a striker of the
   * player's may hear the nearest neighbour's command instead of the player's. Explained after the turn in one line.
   */
  private crossTalk(said: readonly Order[]): Map<string, Cmd[]> {
    const b = this.b;
    const heard = new Map<string, Cmd[]>();
    const speaking = [...this.npc.values()].filter((t) => t.line && t.coord);
    const voices = 1 + speaking.length;
    const notes: string[] = [];
    for (const id of this.mine) {
      const cmds = said.filter((o) => o.to === id).map((o) => o.cmd);
      heard.set(id, cmds);
      const me = unit(b, id);
      if (!me.alive) continue;
      const near = speaking
        .map((t) => ({ t, x: b.coords.find((c) => c.id === t.coord)?.x ?? 0 }))
        .sort((p, q) => Math.abs(p.x - me.x) - Math.abs(q.x - me.x));
      const from = new Set<string>();
      cmds.forEach((cmd, i) => {
        const other = near.find((n) => n.t.cmds[i] !== undefined);
        const theirs = other?.t.cmds[i];
        if (!other || !theirs || theirs === cmd) return;
        const alike = MOVES.includes(cmd) === MOVES.includes(theirs);
        if (mishears(b, voices, alike, TUNING.crossTalk)) {
          cmds[i] = theirs;
          from.add(other.t.coord!);
        }
      });
      if (!from.size) continue;
      const n = this.name(id);
      const verb = n.endsWith('а') ? 'расслышала' : 'расслышал';
      notes.push(`${n} ${verb} ${[...from].map((c) => cases(this.name(c)).acc).join(' и ')}.`);
    }
    if (notes.length) {
      this.bump('misheard');
      this.panel.note(notes.join(' '), 7000);
    }
    return heard;
  }

  /** «Принять удар»: the blow is coming for a striker of the player's; the player takes it or lets it land. */
  private async offer(id: string): Promise<boolean> {
    this.bump('offered');
    this.choice = null;
    await this.flash();
    this.teach('accept');
    this.panel.prompt(true, cases(this.name(id)).acc);
    await this.wait('prompt', TUNING.acceptSeconds);
    this.panel.prompt(false);
    this.setPhase('exec');
    const take = this.choice === true;
    if (take) {
      this.bump('accepted');
      if (id === this.partner) this.ctx.memory.trust = Math.min(3, this.ctx.memory.trust + 1);
    }
    return take;
  }

  // ---------- what happened: sounds, barks, bookkeeping ----------

  private hitThisTurn = new Set<string>();

  private handle(ev: readonly Ev[]): void {
    const b = this.b;
    let rustles = 0;
    for (const e of ev) {
      if ('s' in e && DID[e.t]) {
        if (this.mine.includes(e.s)) this.mineDid.get(e.s)?.push(DID[e.t]!);
        else this.npc.get(e.s)?.did.push(DID[e.t]!);
      }
      switch (e.t) {
        case 'move':
          this.sound.step(heardAt(e.to[0], e.to[1]));
          break;
        case 'jump':
          this.sound.thud(heardAt(e.to[0], e.to[1]));
          break;
        case 'turn': {
          const u = unit(b, e.s);
          this.sound.step(heardAt(u.x, u.y), 0.1);
          break;
        }
        case 'wall':
        case 'obstacle':
        case 'bump':
        case 'blocked': {
          const u = unit(b, e.s);
          this.sound.thud(heardAt(u.x, u.y));
          break;
        }
        case 'crush':
          this.sound.crunch(heardAt(e.at[0], e.at[1]));
          this.crushed.push({ x: e.at[0], y: e.at[1], id: e.c, strong: e.strong });
          if (e.s === this.partner) this.bump('crushed');
          else if (this.mine.includes(e.s)) this.bump(`${e.s}Kills`);
          if (e.s === this.def.goal?.striker && this.mine.includes(e.s)) {
            const u = unit(b, e.s);
            const p = pt(u.x, u.y);
            this.panel.bark(p.x, p.y - 26 * p.s, this.def.goal.cheer);
          }
          break;
        case 'trap': {
          const at = heardAt(e.at[0], e.at[1]);
          if (e.kind === 'pit') this.sound.sag(at);
          else if (e.kind === 'mine') this.sound.pop(at);
          else this.sound.twang(at);
          if (e.s === this.partner) this.bump('traps');
          break;
        }
        case 'secret':
          this.sound.paper(heardAt(e.at[0], e.at[1]));
          if (e.s === this.partner) this.bump('secrets');
          break;
        case 'arrive':
          this.sound.rustle(heardAt(e.at[0], e.at[1]), 0.9, 0.1);
          break;
        case 'creep':
          if (rustles++ < 3) this.sound.rustle(heardAt(e.to[0], e.to[1]), 0.5, 0.12);
          break;
        case 'hit':
        case 'graze': {
          const u = unit(b, e.s);
          this.hitThisTurn.add(e.s);
          this.sound.cry(heardAt(u.x, u.y), e.s === this.partner ? 1 : 0.85 + (u.x % 3) * 0.12);
          const p = pt(u.x, u.y);
          this.panel.bark(p.x, p.y - 26 * p.s, 'Ай!');
          if (e.s === this.partner) {
            this.bump('partnerHits');
            this.trauma = Math.min(1, this.trauma + 0.25);
          }
          break;
        }
        case 'coordHit':
          if (e.c === PLAYER_ID) {
            this.trauma = Math.min(1, this.trauma + 0.5);
            this.sound.thud({ x: 0, z: 0.3 });
            this.drawTallies();
          } else {
            const c = b.coords.find((it) => it.id === e.c);
            if (c) this.panel.bark(zoneX(c.x), ZONE_Y - 60, 'Принимаю!');
          }
          break;
        case 'coordDown':
          if (e.c === PLAYER_ID) this.drawTallies();
          else this.panel.note(`${this.name(e.c)} больше не отвечает из зоны.`);
          break;
        case 'fall': {
          const u = unit(b, e.s);
          this.sound.cry(heardAt(u.x, u.y), 0.7);
          void this.sleep(0.25).then(() => this.sound.thud(heardAt(u.x, u.y)));
          if (e.s === this.partner) this.trauma = Math.min(1, this.trauma + 0.6);
          // His coordinator calls after him.
          const c = u.coord ? b.coords.find((it) => it.id === u.coord && it.alive && it.id !== PLAYER_ID) : undefined;
          if (c) this.speeches.push(this.panel.speech(zoneX(c.x), ZONE_Y - 52, this.name(c.id), `${this.name(u.id)}!..`, SOLDIERS[c.id]?.hand ?? 'serif'));
          else if (e.s !== this.partner && this.mine.includes(e.s)) this.panel.note(`${this.name(e.s)} не встаёт.`);
          break;
        }
        case 'retreat':
          this.sound.rustle({ x: 0, z: 6 }, 1.6, 0.14);
          this.panel.note('Твари уходят в темноту.');
          break;
        default:
          break;
      }
    }
    this.drawDebugField();
  }

  // ---------- the lamp ----------

  /** One flash: the scene as it is now, rendered once into the snapshot that fades until the next. */
  private flash(): Promise<void> {
    if (this.flashing) return this.flashing;
    this.flashing = (async () => {
      const gap = this.clock - this.lastFlash;
      if (gap < MIN_FLASH_GAP) await this.sleep((MIN_FLASH_GAP - gap) / 1000);
      if (this.destroyed) return;
      this.field.draw(this.scene());
      this.glasses.invalidate();
      this.glasses.update();
      this.ctx.stage.app.renderer.render({ container: this.glasses.view, target: this.snapRT, clear: true });
      this.lastFlash = this.clock;
      this.sound.lamp({ x: 0, z: 0.6 });
      for (const id of this.mine) {
        const p = unit(this.b, id);
        const at = pt(p.x, p.y);
        this.panel.moveTag(id, at.x, at.y + 26 * at.s, p.alive);
      }
      const loose = this.b.secrets.filter((s) => !s.taken);
      const s = loose[this.b.turn % Math.max(1, loose.length)];
      if (s && this.phase === 'plan') this.sound.glint(heardAt(s.x, s.y));
    })().finally(() => {
      this.flashing = null;
    });
    return this.flashing;
  }

  private scene(): Scene {
    const scared = new Set(this.scared);
    if (this.ctx.memory.partnerScared) scared.add(this.partner);
    return {
      b: this.b,
      crushed: this.crushed,
      scared,
      coords: this.b.coords.filter((c) => c.alive && c.id !== PLAYER_ID),
    };
  }

  /** How much of the last snapshot is still visible. */
  private brightness(): number {
    if (!Number.isFinite(this.lastFlash)) return 0;
    const dt = this.clock - this.lastFlash;
    const executing = this.phase === 'exec' || this.phase === 'prompt';
    const floor = executing ? 0.07 : 0.15;
    const tau = executing ? 380 : 650;
    if (this.calm) {
      if (dt < 280) return floor + (0.8 - floor) * (dt / 280);
      return floor + (0.8 - floor) * Math.exp(-(dt - 280) / (tau * 1.6));
    }
    if (dt < 70) return 1;
    return floor + (1 - floor) * Math.exp(-(dt - 70) / tau);
  }

  /** The player's own hits: chalk strokes on the zone wall, a struck one for each hit taken. */
  private drawTallies(): void {
    const me = this.b.coords.find((c) => c.id === PLAYER_ID);
    const hp = Math.max(0, me?.hp ?? 0);
    const g = this.tallies.clear();
    // On the zone wall between the left coordinator and the lamp, clear of the workshop's plates.
    const x0 = 470;
    const y0 = FIELD_BOTTOM + 52;
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * 16;
      g.moveTo(x, y0).lineTo(x + 3, y0 + 40).stroke({ width: 4, color: 0xe6dcc6, alpha: i < hp ? 0.9 : 0.25, cap: 'round' });
    }
    if (hp < 3) g.moveTo(x0 - 8, y0 + 30).lineTo(x0 + 16 * 3, y0 + 8).stroke({ width: 3, color: 0xe6dcc6, alpha: 0.6, cap: 'round' });
  }

  // ---------- time ----------

  private frame(): void {
    const now = performance.now();
    let dt = now - this.last;
    this.last = now;
    if (this.paused || document.hidden) dt = 0;
    dt = Math.min(dt, 250);
    this.clock += dt;
    if (this.waits.length) {
      const due = this.waits.filter((w) => w.at <= this.clock);
      this.waits = this.waits.filter((w) => w.at > this.clock);
      for (const w of due) w.resolve();
    }
    if (this.phaseResolve && this.clock >= this.phaseEnd) this.endPhase('timeout');
    if ((this.phase === 'plan' || this.phase === 'orders') && this.clock >= this.nextRhythm) {
      this.nextRhythm = this.clock + TUNING.flashEvery * 1000;
      void this.flash();
    }
    if (this.phase === 'plan' || this.phase === 'orders') this.panel.setBar(1 - (this.clock - this.phaseStart) / this.phaseLength);
    if (this.phase === 'prompt') this.panel.setPromptBar(1 - (this.clock - this.phaseStart) / this.phaseLength);

    const bright = this.brightness();
    const glare = this.calm || !Number.isFinite(this.lastFlash) ? 0 : Math.exp(-(this.clock - this.lastFlash) / 110);
    this.snapSprite.alpha = bright;
    this.wash.alpha = glare * 0.22;
    this.lampGlow.alpha = this.calm ? bright * 0.8 : Math.max(bright * 0.5, glare);
    this.tallies.alpha = Math.max(0.4, bright);
    this.panel.tagOpacity(Math.max(0.55, bright));
    // Trauma shake (game-feel): smooth, decaying, on the picture only.
    if (this.trauma > 0 && !this.ctx.reduced) {
      this.trauma = Math.max(0, this.trauma - (1.6 * dt) / 1000);
      const k = this.trauma * this.trauma;
      const t = this.clock / 1000;
      this.snapSprite.position.set(12 * k * Math.sin(t * 51), 8 * k * Math.sin(t * 69));
    } else this.snapSprite.position.set(0, 0);
  }

  private sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => this.waits.push({ at: this.clock + seconds * 1000, resolve }));
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.panel.setPhase(p, this.slots);
  }

  /** A timed window (no countdown with «без таймера»): ends on input or when the time runs out. */
  private wait(p: Phase, seconds: number): Promise<'input' | 'timeout'> {
    this.setPhase(p);
    this.phaseStart = this.clock;
    this.phaseLength = seconds * 1000;
    this.phaseEnd = this.untimed ? Infinity : this.clock + this.phaseLength;
    return new Promise((resolve) => (this.phaseResolve = resolve));
  }

  private endPhase(r: 'input' | 'timeout'): void {
    const f = this.phaseResolve;
    this.phaseResolve = null;
    this.phaseEnd = Infinity;
    f?.(r);
  }

  // ---------- input ----------

  private key(e: KeyboardEvent): void {
    if (e.repeat || isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'KeyP') {
      e.preventDefault();
      if (this.phase === 'idle') return;
      this.paused = !this.paused;
      this.panel.paused(this.paused);
      return;
    }
    if (this.paused) return;
    if (this.phase === 'prompt') {
      if (e.code === 'Space') {
        e.preventDefault();
        this.decide(true);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.decide(false);
      }
      return;
    }
    if (this.phase !== 'plan' && this.phase !== 'orders') return;
    if (this.mine.length > 1 && (e.code === 'Tab' || TARGET_KEYS.includes(e.code))) {
      e.preventDefault();
      const living = this.mine.filter((id) => unit(this.b, id).alive);
      const next = e.code === 'Tab' ? living[(living.indexOf(this.target) + (e.shiftKey ? living.length - 1 : 1)) % living.length] : this.mine[TARGET_KEYS.indexOf(e.code)];
      if (next) this.aim(next);
      return;
    }
    const cmd = PAD.find(([code]) => code === e.code)?.[2];
    if (cmd) {
      e.preventDefault();
      this.push(cmd);
    } else if (e.code === 'Backspace') {
      e.preventDefault();
      this.erase();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.done();
    }
  }

  private push(c: Cmd): void {
    if (this.paused || (this.phase !== 'plan' && this.phase !== 'orders')) return;
    // Each striker can do only as much as he has actions (a snare costs one).
    const own = this.queue.filter((o) => o.to === this.target).length;
    const to = unit(this.b, this.target);
    if (this.queue.length >= this.slots || !to.alive || own >= to.actions) {
      this.sound.uiTick();
      return;
    }
    this.queue.push({ to: this.target, cmd: c });
    this.panel.setQueue(this.queue, this.slots);
    this.sound.uiTick();
    // Speaking ends the looking.
    if (this.phase === 'plan') this.endPhase('input');
  }

  private erase(): void {
    if (this.paused || this.phase !== 'orders' || !this.queue.length) return;
    this.queue.pop();
    this.panel.setQueue(this.queue, this.slots);
  }

  private done(): void {
    if (this.paused) return;
    if (this.phase === 'plan' || this.phase === 'orders') this.endPhase('input');
  }

  /** Whom the next commands are for (battle 3). */
  private aim(id: string): void {
    if (!this.mine.includes(id) || !unit(this.b, id).alive) return;
    this.target = id;
    this.panel.setTarget(id);
  }

  private decide(take: boolean): void {
    if (this.paused || this.phase !== 'prompt') return;
    this.choice = take;
    this.endPhase('input');
  }

  // ---------- teaching (the prologue's workshop) ----------

  private teach(moment: 'look' | 'speak' | 'accept'): void {
    if (this.def.id !== 'training') return;
    const n = this.name(this.partner);
    const acc = (name: string) => cases(name).acc;
    const turn = this.b.turn;
    const text =
      moment === 'look' && turn === 1
        ? `Поле видно только во вспышке лампы. ${n} — в середине; белый узел повязки у него на затылке.`
        : moment === 'speak' && turn === 1
          ? `Узел на затылке: ${n} смотрит в другую сторону. Команды — от его лица: его лево, а не твоё.`
          : moment === 'look' && turn === 2
            ? `Шаг на бледный лист давит тварь. Доползёт лист до ${acc(n)} — ударит.`
            : moment === 'accept'
              ? 'Пробел — принять удар на себя. У тебя тоже три хита: чёрточки мелом на стене зоны.'
              : null;
    if (!text || this.hinted.has(`${moment}${moment === 'accept' ? '' : turn}`)) return;
    this.hinted.add(`${moment}${moment === 'accept' ? '' : turn}`);
    this.panel.hint(text);
  }

  // ---------- debug ----------

  private drawDebugField(): void {
    if (!this.ctx.debug) return;
    const g = this.truthLayer.clear();
    for (const t of this.b.traps) {
      const p = pt(t.x, t.y);
      g.circle(p.x, p.y, 9 * p.s).stroke({ width: 2, color: t.sprung ? 0x777777 : 0xff3b30, alpha: 0.8 });
    }
    for (const c of this.b.creatures) {
      if (!c.alive) continue;
      const p = pt(c.x, c.y);
      g.rect(p.x - 12 * p.s, p.y - 7 * p.s, 24 * p.s, 14 * p.s).stroke({ width: 2, color: c.strong ? 0xffa000 : 0xffffff, alpha: 0.7 });
    }
    for (const u of this.b.units) {
      if (!u.alive) continue;
      const p = pt(u.x, u.y);
      g.circle(p.x, p.y, 13 * p.s).stroke({ width: 2, color: 0x4fc3f7, alpha: 0.8 });
    }
  }

  private debugText(): void {
    if (!this.ctx.debug) return;
    const lines = [`ход ${this.b.turn} · доверие ${this.ctx.memory.trust} · ${this.ctx.memory.partnerScared ? 'напуган' : 'спокоен'}`];
    for (const id of this.mine) lines.push(`ты → ${this.name(id)}: сделал ${this.mineDid.get(id)?.join(', ') || '—'}`);
    for (const t of this.npc.values()) {
      lines.push(`${t.coord ? this.name(t.coord) : 'сам'} → ${this.name(t.id)}\n  задумал: ${t.intent}\n  сказал: ${t.cmds.map((c) => CMD_LABEL[c]).join(', ') || '—'}\n  сделал: ${t.did.join(', ') || '—'}`);
    }
    this.panel.debug.textContent = lines.join('\n');
  }

  // ---------- housekeeping ----------

  private bump(key: string, by = 1): void {
    bump(this.ctx.memory, key, by);
  }

  /** The name a soldier goes by in this run. */
  private name(id: string): string {
    return nameOf(id, this.ctx.names);
  }

  private clearSpeech(): void {
    for (const el of this.speeches) el.remove();
    this.speeches = [];
  }

  private layout(fit: Fit): void {
    if (this.destroyed) return;
    this.panel.layout(fit);
    const res = this.ctx.stage.app.renderer.resolution * fit.scale;
    this.glasses.setResolution(res);
    if (Math.abs(this.snapRT.source.resolution - res) > 0.01) {
      this.snapRT.destroy(true);
      this.snapRT = RenderTexture.create({ width: REF_W, height: REF_H, resolution: res });
      this.snapSprite.texture = this.snapRT;
      if (Number.isFinite(this.lastFlash)) {
        this.glasses.update();
        this.ctx.stage.app.renderer.render({ container: this.glasses.view, target: this.snapRT, clear: true });
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offLayout();
    this.offAgent();
    this.ctx.stage.app.ticker.remove(this.tick);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisible);
    for (const w of this.waits) w.resolve();
    this.waits = [];
    this.clearSpeech();
    this.panel.destroy();
    this.view.destroy({ children: true });
    this.snapRT.destroy(true);
    // The glasses' own textures go with their sprites; the field then drops what is left (the poster).
    this.glasses.view.destroy({ children: true, texture: true, textureSource: true });
    this.field.destroy();
    this.glowTex.destroy(true);
  }
}

