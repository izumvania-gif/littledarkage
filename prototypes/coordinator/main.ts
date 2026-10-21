/**
 * Prototype А «Координатор: вспышки». Question: is it interesting to be the voice — to see the field only in
 * the flashes of a red lamp and lead a blindfolded partner with three commands from his point of view?
 * Throwaway (prototypes/README.md): hard-coded on purpose, rewritten in apps/game on a keep.
 */
import '../shared/fonts.ts';
import '../shared/base.css';
import './style.css';
import { wait } from '../shared/dom.ts';
import { fontsReady } from '../shared/fonts.ts';
import { createFrame, Shake } from '../shared/frame.ts';
import { plan as planFor } from '../shared/planner.ts';
import { Session, showEnd, showStart } from '../shared/session.ts';
import { beginTurn, clone, CMD_LABEL, creatureAt, creepPhase, DX, DY, endTurn, hit, makeBattle, manhattan, stepPhase, striker, targetOf, type Battle, type Cmd, type Ev, type Striker } from '../shared/sim.ts';
import { sfx, Sound, type Spot } from '../shared/sound.ts';
import { bark, PAD, Panel, speech, type Phase } from './panel.ts';
import { drawLamp, drawTallies, drawTruth, pt, renderSnapshot, ZONE_Y, zoneX, type Crushed, type Snap } from './view.ts';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const CALM = params.has('calm');

const TURNS = 8;
const PLAN_MS = 30_000;
const CMD_MS = 10_000;
const RHYTHM_MS = 2000;
const STEP_MS = 900;
const ACCEPT_MS = 2000;
/** After the last command is in, the window closes this soon unless one is erased. */
const FULL_MS = 1200;

/** Норкин is the middle pair; the player is his coordinator. */
const NORKIN = 1;
const PAIRS = [
  { name: 'Сырков', coord: 'Крошкин', x: 1 },
  { name: 'Норкин', coord: 'Игрок', x: 4 },
  { name: 'Хвостов', coord: 'Зернов', x: 7, jump: 3 },
];
const SIGNAL: Record<string, 'whistle' | 'pipe'> = { Крошкин: 'whistle', Зернов: 'pipe' };

const MOVES: readonly Cmd[] = ['step', 'step2', 'back', 'left', 'right', 'jump'];
const TURNS_CMDS: readonly Cmd[] = ['turnL', 'turnR', 'about'];
const SAY: Record<Cmd, string> = { ...CMD_LABEL, jump: 'прыгай' };

const frame = createFrame();
const ctx = frame.ctx;
const sound = new Sound();
const fx = sfx(sound);
const shake = new Shake();
const snapCanvas = document.createElement('canvas');
const snapCtx = snapCanvas.getContext('2d')!;

interface Stats {
  planMs: number[];
  cmdMs: number[];
  doneEarly: number;
  timeouts: number;
  planFlashes: number;
  turnFirst: number;
  turnsWithMoves: number;
  kinds: Map<Cmd, number>;
  norkHits: number;
  offered: number;
  accepted: number;
  crushed: number;
  secrets: number;
  traps: number;
}

interface Run {
  b: Battle;
  seed: number;
  session: Session;
  crushed: Crushed[];
  /** Норкин was hit: on his next turn he mixes up left and right. */
  scared: boolean;
  stats: Stats;
  end: '' | 'retreat' | 'norkin' | 'coord';
  /** Debug layer: per striker «задумал → сказал → сделал». */
  dbg: Map<number, { intent: string; said: string; did: string[] }>;
}

let run: Run;
let snap: Snap | null = null;
let lastFlash = -1;
let phase: Phase = 'idle';
let phaseT0 = 0;
let phaseDur = 0;
let cmdDeadline = 0;
let phaseResolve: ((r: 'input' | 'timeout') => void) | null = null;
let nextRhythm = 0;
let queue: Cmd[] = [];
let slots = 3;
let speeches: HTMLElement[] = [];
let ambience: AudioBufferSourceNode | null = null;

const panel = new Panel(frame, {
  cmd: (c) => pushCmd(c),
  erase: () => erase(),
  done: () => done(),
  accept: () => accept(),
});
panel.show(false);
frame.onResize(() => {
  if (snap) renderSnap();
});

// ---------- phases ----------

function startPhase(p: Phase, dur: number): Promise<'input' | 'timeout'> {
  phase = p;
  phaseT0 = performance.now();
  phaseDur = dur;
  panel.setPhase(p);
  return new Promise((resolve) => (phaseResolve = resolve));
}

function endPhase(r: 'input' | 'timeout'): void {
  const f = phaseResolve;
  phaseResolve = null;
  f?.(r);
}

// The tab hidden mid-turn: time stands still until it is back.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = performance.now();
  else if (hiddenAt) {
    const gap = performance.now() - hiddenAt;
    phaseT0 += gap;
    nextRhythm += gap;
    lastFlash += gap;
    hiddenAt = 0;
  }
});

// ---------- input ----------

const KEY_CMD = new Map(PAD.map(([code, , cmd]) => [code, cmd]));

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (phase === 'prompt') {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      accept();
    }
    return;
  }
  if (phase !== 'plan' && phase !== 'cmd') return;
  const cmd = KEY_CMD.get(e.code);
  if (cmd) {
    e.preventDefault();
    pushCmd(cmd);
  } else if (e.code === 'Backspace') {
    e.preventDefault();
    erase();
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    done();
  }
});

function pushCmd(c: Cmd): void {
  if (phase !== 'plan' && phase !== 'cmd') return;
  if (queue.length >= slots) {
    fx.uiTick();
    return;
  }
  queue.push(c);
  panel.setQueue(queue, slots);
  fx.uiTick();
  if (phase === 'plan') {
    // Speaking ends the looking.
    endPhase('input');
    return;
  }
  if (queue.length >= slots) phaseDur = Math.min(phaseDur, performance.now() - phaseT0 + FULL_MS);
}

function erase(): void {
  if (phase !== 'cmd' || !queue.length) return;
  queue.pop();
  panel.setQueue(queue, slots);
  phaseDur = cmdDeadline;
}

function done(): void {
  if (phase === 'plan') {
    run.stats.doneEarly++;
    endPhase('input');
  } else if (phase === 'cmd') endPhase('input');
}

let accepted = false;
function accept(): void {
  if (phase !== 'prompt') return;
  accepted = true;
  endPhase('input');
}

// ---------- the lamp ----------

function renderSnap(): void {
  if (!snap) return;
  snapCanvas.width = frame.canvas.width;
  snapCanvas.height = frame.canvas.height;
  const k = frame.canvas.width / window.innerWidth;
  const f = frame.fit;
  snapCtx.setTransform(f.scale * k, 0, 0, f.scale * k, f.x * k, f.y * k);
  renderSnapshot(snapCtx, snap);
}

/** One flash: the field as it is now, a single snapshot that fades until the next. */
function flash(): void {
  snap = { b: clone(run.b), crushed: run.crushed.map((c) => ({ ...c })), scared: run.scared, player: NORKIN, coords: [1, 7] };
  renderSnap();
  lastFlash = performance.now();
  const n = striker(run.b, NORKIN);
  const p = pt(n.x, n.y);
  panel.moveTag(p.x, p.y + 30 * p.s);
  fx.click({ x: 0, z: 5 });
  const secrets = run.b.secrets.filter((s) => !s.taken);
  const s = secrets[Math.floor(Math.random() * secrets.length)];
  if (s && Math.random() < 0.4) setTimeout(() => fx.glint(spot(s.x, s.y)), 120);
}

/** How much of the last snapshot is still visible. */
function brightness(now: number): number {
  if (lastFlash < 0) return 0;
  const dt = now - lastFlash;
  const executing = phase === 'exec' || phase === 'prompt';
  const floor = executing ? 0.07 : 0.15;
  const tau = executing ? 380 : 650;
  if (CALM) {
    if (dt < 280) return floor + (0.8 - floor) * (dt / 280);
    return floor + (0.8 - floor) * Math.exp(-(dt - 280) / (tau * 1.6));
  }
  if (dt < 70) return 1;
  return floor + (1 - floor) * Math.exp(-(dt - 70) / tau);
}

const spot = (x: number, y: number): Spot => ({ x: x - 4, z: 9 - y });

function loop(now: number): void {
  if (phaseResolve && phaseDur && now - phaseT0 >= phaseDur) endPhase('timeout');
  if ((phase === 'plan' || phase === 'cmd') && now >= nextRhythm) {
    flash();
    if (phase === 'plan') run.stats.planFlashes++;
    nextRhythm = now + RHYTHM_MS;
  }
  if (phase === 'plan') panel.setBar(1 - (now - phaseT0) / PLAN_MS);
  if (phase === 'cmd') panel.setBar((phaseDur - (now - phaseT0)) / CMD_MS);
  if (phase === 'prompt') panel.setPromptBar(1 - (now - phaseT0) / ACCEPT_MS);

  frame.begin();
  const bright = brightness(now);
  const k = frame.canvas.width / window.innerWidth;
  const off = shake.offset(1 / 60, 10);
  if (snap && bright > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = bright;
    ctx.drawImage(snapCanvas, off.x * frame.fit.scale * k, off.y * frame.fit.scale * k);
    ctx.restore();
  }
  const glare = CALM || lastFlash < 0 ? 0 : Math.exp(-(now - lastFlash) / 110);
  drawLamp(ctx, CALM ? bright : Math.max(bright * 0.6, glare), glare);
  if (run) drawTallies(ctx, striker(run.b, NORKIN).coord.hp, bright);
  if (DEBUG && run) drawTruth(ctx, run.b);
  panel.tag.style.opacity = String(Math.max(0.55, bright));
  requestAnimationFrame(loop);
}

// ---------- sound ----------

function startAmbience(): void {
  const c = sound.ctx;
  const bus = sound.bus('amb');
  if (!c || !bus || ambience) return;
  // Brown noise: the tunnel's low rumble.
  const buf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.2;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const g = c.createGain();
  g.gain.value = 0.5;
  src.connect(lp).connect(g).connect(bus);
  src.start();
  ambience = src;
  const drip = () => {
    fx.drip({ x: (Math.random() - 0.5) * 10, z: 2 + Math.random() * 8 });
    setTimeout(drip, 2500 + Math.random() * 5000);
  };
  setTimeout(drip, 1500);
}

// ---------- a turn ----------

function sayLine(s: Striker, cmds: readonly Cmd[]): string {
  const words = cmds.map((c) => SAY[c]);
  if (cmds.every((c) => c === 'stay')) return `${s.name}, стой и жди!`;
  return `${s.name}! ${words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('. ')}!`;
}

function adjacentCreature(b: Battle, s: Striker): boolean {
  for (let d = 0; d < 4; d++) if (creatureAt(b, s.x + DX[d]!, s.y + DY[d]!)) return true;
  return false;
}

/** The other coordinators plan from the same flash the player sees, and shout. */
function npcPlans(): Map<number, Cmd[]> {
  const plans = new Map<number, Cmd[]>();
  const b = run.b;
  let delay = 300;
  for (const s of b.strikers) {
    if (!s.alive || s.id === NORKIN) continue;
    // Each coordinator minds only the creatures coming for their own striker, two steps away at most:
    // perfect hunters would clear the field in two turns and leave the player nothing to do.
    const view = clone(b);
    for (const c of view.creatures) if (c.alive && (targetOf(b, c)?.id !== s.id || manhattan(c.x, c.y, s.x, s.y) > 2)) c.alive = false;
    const p = planFor(view, s.id);
    let did = [...p.cmds];
    // Сырков is jumpy: with a creature right next to him he freezes for one command.
    if (s.name === 'Сырков' && adjacentCreature(b, s) && did.length) did = ['stay', ...did.slice(0, -1)];
    plans.set(s.id, did);
    run.dbg.set(s.id, { intent: p.intent, said: p.cmds.map((c) => CMD_LABEL[c]).join(', ') || '—', did: [] });
    const col = PAIRS[s.id]!.x;
    const line = sayLine(s, p.cmds);
    const signal = SIGNAL[s.coord.name];
    setTimeout(() => {
      if (phase !== 'cmd' && phase !== 'exec') return;
      speeches.push(speech(frame, zoneX(col), ZONE_Y - 52, s.coord.name, line));
      if (signal) fx[signal]({ x: col - 4, z: 0.4 });
    }, delay);
    delay += 900;
  }
  return plans;
}

function clearSpeech(): void {
  for (const el of speeches) el.remove();
  speeches = [];
}

/** Норкин after a hit: «налево» becomes «направо» and the other way round. */
function quirk(cmds: readonly Cmd[], scared: boolean): Cmd[] {
  if (!scared) return [...cmds];
  const swap: Partial<Record<Cmd, Cmd>> = { turnL: 'turnR', turnR: 'turnL', left: 'right', right: 'left' };
  return cmds.map((c) => swap[c] ?? c);
}

const DID: Partial<Record<Ev['t'], string>> = { move: 'шаг', jump: 'прыжок', turn: 'поворот', wall: 'упёрся в стену', bump: 'упёрся в своего', blocked: 'упёрся в тварь', crush: 'раздавил', trap: 'ловушка', secret: 'секрет', stay: 'стоял', lost: 'пропустил' };

/** Sounds, barks and bookkeeping for what just happened. */
function handle(ev: readonly Ev[]): void {
  const b = run.b;
  let rustles = 0;
  for (const e of ev) {
    if ('s' in e && DID[e.t]) run.dbg.get(e.s)?.did.push(DID[e.t]!);
    switch (e.t) {
      case 'move':
        fx.step(spot(e.to[0], e.to[1]));
        break;
      case 'jump':
        fx.whoosh(spot(e.to[0], e.to[1]));
        setTimeout(() => fx.thud(spot(e.to[0], e.to[1])), 140);
        break;
      case 'turn': {
        const s = striker(b, e.s);
        fx.step(spot(s.x, s.y), 0.1);
        break;
      }
      case 'wall':
      case 'bump':
      case 'blocked': {
        const s = striker(b, e.s);
        fx.thud(spot(s.x, s.y));
        break;
      }
      case 'crush':
        fx.crunch(spot(e.at[0], e.at[1]));
        run.crushed.push({ x: e.at[0], y: e.at[1], id: e.c, strong: e.strong });
        if (e.s === NORKIN) run.stats.crushed++;
        break;
      case 'trap': {
        const at = spot(e.at[0], e.at[1]);
        if (e.kind === 'pit') fx.sag(at);
        else if (e.kind === 'mine') fx.pop(at);
        else fx.twang(at);
        if (e.s === NORKIN) run.stats.traps++;
        break;
      }
      case 'secret':
        fx.paper(spot(e.at[0], e.at[1]));
        if (e.s === NORKIN) run.stats.secrets++;
        break;
      case 'spawn':
        fx.rustle(spot(e.at[0], e.at[1]), 0.9, 0.1);
        break;
      case 'creep':
        if (rustles++ < 3) fx.rustle(spot(e.to[0], e.to[1]), 0.5, 0.12);
        break;
      case 'hit': {
        const s = striker(b, e.s);
        if (e.coord) {
          if (e.s === NORKIN) {
            shake.add(0.45);
            fx.thud({ x: 0, z: 0.3 });
          } else speak(e.s, 'Принимаю!');
        } else {
          const p = pt(s.x, s.y);
          fx.cry(spot(s.x, s.y), e.s === NORKIN ? 1 : e.s === 0 ? 1.2 : 0.85);
          bark(frame, p.x, p.y - 22 * p.s, 'Ай!');
          if (e.s === NORKIN) {
            run.scared = true;
            run.stats.norkHits++;
            shake.add(0.25);
          }
        }
        break;
      }
      case 'death':
        if (e.coord) {
          if (e.s === NORKIN) run.end = 'coord';
        } else {
          const s = striker(b, e.s);
          fx.cry(spot(s.x, s.y), 0.7);
          setTimeout(() => fx.thud(spot(s.x, s.y)), 250);
          if (e.s === NORKIN) {
            run.end = 'norkin';
            shake.add(0.6);
          }
        }
        break;
      default:
        break;
    }
  }
}

function speak(id: number, text: string): void {
  const col = PAIRS[id]!.x;
  const el = speech(frame, zoneX(col), ZONE_Y - 52, PAIRS[id]!.coord, text);
  speeches.push(el);
  const signal = SIGNAL[PAIRS[id]!.coord];
  if (signal) fx[signal]({ x: col - 4, z: 0.4 });
}

async function promptAccept(): Promise<boolean> {
  accepted = false;
  run.stats.offered++;
  panel.prompt(true);
  // The lamp catches the blow coming, so the choice is made looking at it.
  flash();
  await startPhase('prompt', ACCEPT_MS);
  panel.prompt(false);
  if (accepted) run.stats.accepted++;
  return accepted;
}

async function playTurn(): Promise<void> {
  const b = run.b;
  handle(beginTurn(b));
  const nork = striker(b, NORKIN);
  slots = nork.actions;
  queue = [];
  run.dbg = new Map();
  clearSpeech();
  panel.setTurn(b.turn, TURNS);
  panel.setQueue(queue, slots);

  // Look: the field stands still, the lamp keeps time.
  nextRhythm = performance.now();
  const planStart = performance.now();
  await startPhase('plan', PLAN_MS);
  run.stats.planMs.push(performance.now() - planStart);

  // Speak: ten seconds, the others shouting too.
  const plans = npcPlans();
  cmdDeadline = CMD_MS;
  if (queue.length >= slots) cmdDeadline = FULL_MS;
  const cmdStart = performance.now();
  const r = await startPhase('cmd', cmdDeadline);
  run.stats.cmdMs.push(performance.now() - cmdStart);
  if (r === 'timeout' && queue.length < slots) run.stats.timeouts++;

  const said = [...queue];
  for (const c of said) run.stats.kinds.set(c, (run.stats.kinds.get(c) ?? 0) + 1);
  const firstMove = said.findIndex((c) => MOVES.includes(c));
  if (firstMove >= 0) {
    run.stats.turnsWithMoves++;
    if (said.slice(0, firstMove).some((c) => TURNS_CMDS.includes(c))) run.stats.turnFirst++;
  }
  const did = quirk(said, run.scared);
  run.dbg.set(NORKIN, { intent: run.scared ? 'напуган: путает лево и право' : 'как сказал ты', said: said.map((c) => CMD_LABEL[c]).join(', ') || '—', did: [] });
  run.scared = false;
  plans.set(NORKIN, did);

  // Watch: every step is one flash.
  phase = 'exec';
  panel.setPhase('exec');
  const n = Math.max(0, ...b.strikers.filter((s) => s.alive).map((s) => s.actions));
  await wait(400);
  for (let i = 0; i < n && !run.end; i++) {
    handle(stepPhase(b, plans, i));
    flash();
    await wait(STEP_MS);
  }
  if (!run.end) {
    const { ev, attacks } = creepPhase(b);
    handle(ev);
    flash();
    await wait(650);
    for (const a of attacks) {
      if (run.end) break;
      const s = striker(b, a.s);
      if (!s.alive) continue;
      let toCoord: boolean;
      if (a.s === NORKIN) {
        toCoord = await promptAccept();
        phase = 'exec';
        panel.setPhase('exec');
      } else toCoord = s.hp === 1 && s.coord.hp > 1;
      handle(hit(b, s, toCoord));
      await wait(500);
    }
    await wait(STEP_MS);
  }
  if (!run.end && endTurn(b).length) run.end = 'retreat';
  if (DEBUG) showDebug();
}

function showDebug(): void {
  const lines = [...run.dbg.entries()].map(([id, d]) => `${PAIRS[id]!.coord} → ${PAIRS[id]!.name}\n  задумал: ${d.intent}\n  сказал: ${d.said}\n  сделал: ${d.did.join(', ') || '—'}`);
  panel.debug.textContent = `зерно ${run.seed} · ход ${run.b.turn}\n${lines.join('\n')}`;
}

// ---------- a run ----------

/**
 * The shared field generator puts creatures far away and spread wide; here they start nearer (rows 2–4),
 * drift toward the middle, and three of the seven come later from the far end, so there is work for Норкин
 * through all eight turns. Tuned with a headless run: a Норкин left standing takes about two hits a battle.
 */
function field(seed: number): Battle {
  const b = makeBattle({ seed, pairs: PAIRS, weak: 7, traps: 3, secrets: 3, retreatAfter: TURNS });
  for (const c of b.creatures) {
    const x = Math.round(4 + (c.x - 4) * 0.6);
    const y = Math.min(c.y + 2, 4);
    if (!b.creatures.some((o) => o !== c && o.x === x && o.y === y)) {
      c.x = x;
      c.y = y;
    }
  }
  const late = b.creatures.splice(4);
  late.forEach((_, i) => b.spawns.push({ turn: 2 + i * 2, x: 3 + (i % 3), y: 0, strong: false }));
  return b;
}

function newRun(seed: number): Run {
  return {
    b: field(seed),
    seed,
    session: new Session('coordinator'),
    crushed: [],
    scared: false,
    end: '',
    dbg: new Map(),
    stats: { planMs: [], cmdMs: [], doneEarly: 0, timeouts: 0, planFlashes: 0, turnFirst: 0, turnsWithMoves: 0, kinds: new Map(), norkHits: 0, offered: 0, accepted: 0, crushed: 0, secrets: 0, traps: 0 },
  };
}

const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, z) => a + z, 0) / xs.length / 1000).toFixed(1) : '—');

async function playRun(seed: number): Promise<void> {
  run = newRun(seed);
  snap = null;
  lastFlash = -1;
  panel.show(true);
  panel.debug.hidden = !DEBUG;
  await wait(600);
  while (!run.end) await playTurn();
  phase = 'idle';
  panel.setPhase('idle');
  clearSpeech();
  await wait(1200);
  panel.show(false);
  finish();
}

function finish(): void {
  const b = run.b;
  const nork = striker(b, NORKIN);
  const st = run.stats;
  const outcome = run.end === 'retreat' ? 'твари отступили' : run.end === 'norkin' ? 'Норкин погиб' : 'координатор выбыл';
  const title = run.end === 'retreat' ? 'Тревога кончилась' : run.end === 'norkin' ? 'Норкин погиб' : 'Тебя унесли';
  const text =
    run.end === 'retreat'
      ? `Твари уползли в темноту. Норкин жив: у него ${nork.hp} из 3 хитов, у тебя ${nork.coord.hp}.`
      : run.end === 'norkin'
        ? `Норкин погиб на ${b.turn}-м ходу.`
        : `Слишком много ударов на себя: на ${b.turn}-м ходу тебя унесли из зоны, и Норкин остался без голоса.`;
  const kinds = [...st.kinds.entries()].sort((a, z) => z[1] - a[1]).map(([c, k]) => `${CMD_LABEL[c]} ${k}`).join(', ') || '—';
  const stats: [string, string | number][] = [
    ['исход', outcome],
    ['зерно', run.seed],
    ['ходов', b.turn],
    ['план, в среднем', `${avg(st.planMs)} с`],
    ['команды, в среднем', `${avg(st.cmdMs)} с`],
    ['«Готово» раньше срока', st.doneEarly],
    ['время на команды вышло', st.timeouts],
    ['вспышек за планы', st.planFlashes],
    ['поворот перед шагом', `${st.turnFirst} из ${st.turnsWithMoves} ходов`],
    ['команды', kinds],
    ['удары по Норкину', st.norkHits],
    ['принял на себя', `${st.accepted} из ${st.offered}`],
    ['Норкин раздавил', st.crushed],
    ['Норкин нашёл секретов', st.secrets],
    ['Норкин в ловушках', st.traps],
  ];
  const rec = run.session.finish(outcome, stats);
  showEnd(frame.ui, { title, text, stats, onAgain: () => void playRun(randomSeed()) }, rec);
}

const randomSeed = () => 1 + Math.floor(Math.random() * 99_999);

async function main(): Promise<void> {
  requestAnimationFrame(loop);
  await fontsReady();
  const output = await showStart(frame.ui, {
    title: 'Координатор',
    lead: 'Ты координатор. Твой напарник Норкин стоит на поле с завязанными глазами, а ты видишь поле, только когда мигает красная лампа.',
    rules: [
      'Каждый ход ты говоришь Норкину три команды. Команды — от его лица: «налево» — это его лево. Белый узел повязки у него на затылке.',
      'Шаг на бледный лист давит тварь. Прыжок — два шага разом и давит то, на что приземлился.',
      'Твари ползут на клетку к ближнему ударнику и бьют его, если доползут.',
      'Ловушек не видно. Сложенные треугольнички — секреты, их стоит подобрать.',
      'Когда Норкина бьют, можно принять удар на себя. Твои хиты — меловые чёрточки на бруствере перед тобой.',
    ],
    keys: [
      ['Q W E', 'налево · шаг вперёд · направо'],
      ['A S D', 'шаг влево · шаг назад · шаг вправо'],
      ['Z X C', 'кругом · два шага вперёд · стой'],
      ['Пробел', 'прыжок'],
      ['Backspace', 'стереть команду'],
      ['Enter', 'готово'],
    ],
    button: 'В зону координаторов',
  });
  sound.unlock(output);
  startAmbience();
  const seed = Number(params.get('seed')) || randomSeed();
  await playRun(seed);
}

void main();
