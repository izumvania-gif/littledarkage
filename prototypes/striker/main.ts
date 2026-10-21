/**
 * Prototype Б «Ударник: темнота» (prototypes/README.md). The player is the blindfolded striker: a black
 * screen, a haze of smell, Норкин's lines from where he stands, other coordinators' lines from theirs,
 * and the field heard in spatial sound. Throwaway: a keep means rewriting this in apps/game.
 */
import '../shared/fonts.ts';
import '../shared/base.css';
import './striker.css';
import { h, isTyping, wait } from '../shared/dom.ts';
import { fontsReady } from '../shared/fonts.ts';
import { createFrame, place, REF_H, REF_W, Shake } from '../shared/frame.ts';
import { Session, showEnd, showStart } from '../shared/session.ts';
import { beginTurn, CMD_LABEL, creepPhase, DX, DY, endTurn, hit, makeBattle, rot, SIZE, stepPhase, striker, type Battle, type Cmd, type Ev, type Striker } from '../shared/sim.ts';
import { Sound, sfx, type Output, type Spot } from '../shared/sound.ts';
import { Haze, type Whiff } from './haze.ts';
import { plan, START_ROW } from './planner.ts';
import { distWord, norkinLine, plainLine, sideWord, swapSides, where } from './voice.ts';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

/** The player's striker; 0 and 2 are the NPC pairs. */
const ME = 1;
/** Each pair's lane (its starting column); the coordinator stands behind it. */
const HOME = [1, 4, 7];
/** The coordinators stand this far behind the near edge (rows run 0..8). */
const ZONE_Y = 9.6;
/** Haze pixels per cell. */
const CELL = 105;
const SMELL_RANGE = 2.25;
const CENTER = { x: REF_W / 2, y: 318 };
const DECIDE_MS = 10_000;
const STEP_MS = 650;
const CREEP_MS = 1000;
const TURNS = 8;
const BPM: Record<number, number> = { 3: 62, 2: 88, 1: 124 };

interface Speaker {
  name: string;
  /** Whom they lead. */
  pair: number;
  cls: string;
  signal: 'whistle' | 'pipe' | 'cough';
  signalName: string;
}

const NORKIN: Speaker = { name: 'Норкин', pair: ME, cls: 'norkin', signal: 'whistle', signalName: 'свист Норкина' };
const KOROCHKINA: Speaker = { name: 'Корочкина', pair: 0, cls: 'senior', signal: 'pipe', signalName: 'стук по трубе' };
const ZERNOV: Speaker = { name: 'Зернов', pair: 2, cls: 'junior', signal: 'cough', signalName: 'покашливание' };

interface Stats {
  said: number;
  followed: number;
  own: number;
  against: number;
  sniffs: number;
  decisions: number[];
  hits: number;
  covered: number;
  crushed: number;
  secrets: number;
}

type Phase = 'whisper' | 'listen' | 'decide' | 'exec' | 'end';

interface Run {
  id: number;
  seed: number;
  b: Battle;
  session: Session;
  phase: Phase;
  trust: number;
  scared: boolean;
  queue: Cmd[];
  slots: number;
  said: Cmd[];
  meant: Cmd[];
  intent: string;
  sharp: number;
  sharpTarget: number;
  decideAt: number;
  execIndex: number;
  stats: Stats;
  submit: (() => void) | null;
  skip: (() => void) | null;
}

const frame = createFrame();
const { ctx, ui } = frame;
const sound = new Sound();
const fx = sfx(sound);
const shake = new Shake();
const haze = new Haze();

let output: Output = 'headphones';
let captionsOn = true;
let run: Run | null = null;
let runCounter = 0;
let hitPulse = 0;
let heartPulse = 0;

// ---------- DOM layers ----------

const linesLayer = h('div', { class: 'layer', attrs: { 'aria-live': 'polite' } });
const captionsBox = h('div', { class: 'captions', attrs: { 'aria-live': 'polite', 'aria-label': 'Подписи звуков' } });
const turnPlate = h('div', { class: 'turn-plate' });
const barFill = h('i');
const bar = h('div', { class: 'bar' }, barFill);
const slotsBox = h('div', { class: 'slots' });
const doneBtn = h('button', { class: 'done', text: 'Готово', attrs: { type: 'button' } });
const dock = h('div', { class: 'dock' }, bar, h('div', { class: 'dock-row' }, slotsBox, doneBtn));
const keystrip = h('p', { class: 'keystrip' });
keystrip.innerHTML =
  '<kbd>W</kbd> шаг · <kbd>S</kbd> назад · <kbd>A</kbd> <kbd>D</kbd> шаг вбок · <kbd>Q</kbd> <kbd>E</kbd> поворот · <kbd>X</kbd> кругом · <kbd>Space</kbd> прыжок · <kbd>F</kbd> нюхать · <kbd>Backspace</kbd> стереть · <kbd>Enter</kbd> готово · <kbd>C</kbd> подписи';
const debugBox = h('pre', { class: 'debug-plan' });
const hudLayer = h('div', { class: 'layer hud' }, turnPlate, captionsBox, dock, keystrip, debugBox);
hudLayer.hidden = true;
debugBox.hidden = !DEBUG;
ui.append(linesLayer, hudLayer);

doneBtn.addEventListener('click', () => {
  doneBtn.blur();
  run?.submit?.();
});

function layoutHud(): void {
  place(frame, turnPlate, 24, 22);
  place(frame, captionsBox, 24, 64);
  place(frame, dock, REF_W / 2, 600, 0.5, 0);
  place(frame, keystrip, REF_W / 2, 690, 0.5, 0);
  place(frame, debugBox, REF_W - 24, 196, 1, 0);
  for (const el of linesLayer.querySelectorAll<HTMLElement>('.line')) {
    place(frame, el, Number(el.dataset.x), Number(el.dataset.y), Number(el.dataset.ax), Number(el.dataset.ay));
  }
}
frame.onResize(layoutHud);

// ---------- geometry: the world around the player ----------

function me(r: Run): Striker {
  return striker(r.b, ME);
}

/** A world point relative to the player: x to his right, z ahead. */
function rel(r: Run, wx: number, wy: number): Spot {
  const s = me(r);
  const dx = wx - s.x;
  const dy = wy - s.y;
  const right = rot(s.dir, 1);
  return { x: dx * DX[right] + dy * DY[right], z: dx * DX[s.dir] + dy * DY[s.dir] };
}

/** Each coordinator stands in the zone behind his striker's starting column. */
const coordSpot = (r: Run, sp: Speaker): Spot => rel(r, HOME[sp.pair]!, ZONE_Y);
const lampSpot = (r: Run): Spot => rel(r, 4, ZONE_Y + 0.4);

function whiffs(r: Run): Whiff[] {
  const out: Whiff[] = [];
  for (const c of r.b.creatures) {
    if (!c.alive) continue;
    const p = rel(r, c.x, c.y);
    const d = Math.hypot(p.x, p.z);
    if (d > SMELL_RANGE) continue;
    out.push({ phi: Math.atan2(-p.z, p.x), r: d * CELL, amp: (c.strong ? 1.25 : 1) * Math.max(0.3, Math.min(1, 1.35 - 0.45 * d)), strong: c.strong });
  }
  return out;
}

function nearestSmell(r: Run): number {
  let best = Infinity;
  for (const c of r.b.creatures) {
    if (!c.alive) continue;
    const p = rel(r, c.x, c.y);
    best = Math.min(best, Math.hypot(p.x, p.z));
  }
  return best <= SMELL_RANGE ? best : Infinity;
}

// ---------- lines and captions ----------

/** A coordinator's line at the screen edge, in his direction from the player (the top of the screen is «ahead»). */
function say(r: Run, sp: Speaker, text: string, opts: { signal?: boolean; whisper?: boolean } = {}): HTMLElement {
  const spot = coordSpot(r, sp);
  if (opts.signal !== false) {
    fx[sp.signal](spot);
    caption(`${sp.signalName} — ${sideWord(spot)}`);
  }
  for (const old of linesLayer.querySelectorAll<HTMLElement>(`.line.${sp.cls}`)) old.remove();
  const el = h('div', { class: `line ${sp.cls}${opts.whisper ? ' whisper' : ''}` }, h('span', { class: 'who', text: sp.name }), h('span', { class: 'text', text }));
  const sx = spot.x;
  const sy = -spot.z;
  const len = Math.hypot(sx, sy) || 1;
  const ux = sx / len;
  const uy = sy / len;
  const x = CENTER.x + ux * 540;
  const y = Math.min(585, Math.max(90, CENTER.y + uy * 270));
  const ax = 0.5 + 0.5 * ux;
  const ay = 0.5 + 0.5 * uy;
  Object.assign(el.dataset, { x: String(x), y: String(y), ax: String(ax), ay: String(ay) });
  linesLayer.append(el);
  place(frame, el, x, y, ax, ay);
  // Lines from nearby directions would cover each other. Норкин's stays where he is; the others make way.
  if (sp === NORKIN) for (const other of otherLines(el)) settle(other);
  else settle(el);
  return el;
}

const otherLines = (el: HTMLElement) => [...linesLayer.querySelectorAll<HTMLElement>('.line:not(.fade)')].filter((o) => o !== el);

/**
 * Moves a line off the lines it covers: sideways first (so it keeps its side of the screen), and toward
 * the centre only when the edge of the frame is in the way.
 */
function settle(el: HTMLElement): void {
  const { ax, ay } = { ax: Number(el.dataset.ax), ay: Number(el.dataset.ay) };
  let x = Number(el.dataset.x);
  let y = Number(el.dataset.y);
  const lo = frame.toScreen(8, 0).x;
  const hi = frame.toScreen(REF_W - 8, 0).x;
  for (let tries = 0; tries < 8; tries++) {
    const mine = el.getBoundingClientRect();
    const box = otherLines(el)
      .map((o) => o.getBoundingClientRect())
      .find((o) => mine.left < o.right && o.left < mine.right && mine.top < o.bottom && o.top < mine.bottom);
    if (!box) break;
    const dx = mine.left + mine.width / 2 >= box.left + box.width / 2 ? box.right - mine.left + 8 : -(mine.right - box.left + 8);
    if (mine.left + dx >= lo && mine.right + dx <= hi) x += dx / frame.fit.scale;
    else y += (ay >= 0.5 ? -(mine.bottom - box.top + 8) : box.bottom - mine.top + 8) / frame.fit.scale;
    place(frame, el, x, y, ax, ay);
  }
  el.dataset.x = String(x);
  el.dataset.y = String(y);
}

function fadeLines(): void {
  for (const el of linesLayer.querySelectorAll<HTMLElement>('.line')) {
    el.classList.add('fade');
    setTimeout(() => el.remove(), 500);
  }
}

function caption(text: string): void {
  if (!captionsOn) return;
  const el = h('p', { class: 'cap', text });
  captionsBox.append(el);
  while (captionsBox.children.length > 5) captionsBox.firstElementChild?.remove();
  setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => el.remove(), 400);
  }, 3600);
}

// ---------- the queue at the bottom ----------

function renderSlots(r: Run): void {
  slotsBox.replaceChildren();
  for (let i = 0; i < r.slots; i++) {
    const cmd = r.queue[i];
    const cls = ['slot', cmd ? '' : 'empty', r.phase === 'exec' && i === r.execIndex ? 'now' : ''].filter(Boolean).join(' ');
    slotsBox.append(h('span', { class: cls, text: cmd ? CMD_LABEL[cmd] : '·' }));
  }
  doneBtn.disabled = r.phase !== 'decide';
  turnPlate.textContent = r.phase === 'whisper' ? 'Перед боем' : `Ход ${Math.max(1, r.b.turn)} из ${TURNS}`;
}

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
  Space: 'jump',
  KeyF: 'sniff',
};

window.addEventListener('keydown', (e) => {
  if (e.repeat || isTyping(e.target) || !run) return;
  const r = run;
  if (r.phase === 'end') return;
  if (e.code === 'KeyC') {
    captionsOn = !captionsOn;
    captionsBox.hidden = !captionsOn;
    e.preventDefault();
    return;
  }
  if (r.phase === 'whisper' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) {
    e.preventDefault();
    r.skip?.();
    return;
  }
  if (r.phase !== 'decide') return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    r.submit?.();
    return;
  }
  if (e.code === 'Backspace') {
    e.preventDefault();
    // A sniff has already been spent: it stays.
    if (r.queue.length && r.queue[r.queue.length - 1] !== 'sniff') {
      r.queue.pop();
      fx.uiTick();
    }
    renderSlots(r);
    return;
  }
  const cmd = KEYMAP[e.code];
  if (!cmd) return;
  e.preventDefault();
  const last = r.queue[r.queue.length - 1];
  if (cmd === 'step' && last === 'step') {
    r.queue[r.queue.length - 1] = 'step2';
  } else {
    if (r.queue.length >= r.slots) return;
    r.queue.push(cmd);
  }
  if (cmd === 'sniff') {
    r.sharpTarget = 1;
    r.stats.sniffs++;
    sound.noise({ dur: 0.35, filter: 'bandpass', freq: 1800, to: 900, q: 1.2, gain: 0.12, attack: 0.08, bus: 'ui' });
  } else fx.uiTick();
  renderSlots(r);
});

// ---------- events → sound and captions ----------

const named = (r: Run, id: number) => striker(r.b, id).name;

function present(r: Run, evs: readonly Ev[]): void {
  let neighbourSteps = false;
  for (const e of evs) {
    switch (e.t) {
      case 'move':
      case 'jump': {
        if (e.s === ME) {
          if (e.t === 'jump') {
            fx.whoosh();
            setTimeout(() => fx.thud({ x: 0, z: 0.2 }), 180);
          } else fx.step(undefined, 0.38);
        } else {
          const spot = rel(r, e.to[0], e.to[1]);
          fx.step(spot, 0.22);
          if (!neighbourSteps && Math.hypot(spot.x, spot.z) < 3.5) caption(`шаги — ${where(spot)}`);
          neighbourSteps = true;
        }
        break;
      }
      case 'turn':
        if (e.s === ME) fx.step(undefined, 0.1);
        break;
      case 'wall':
        if (e.s === ME) {
          fx.thud({ x: 0, z: 0.5 });
          caption('лапа упёрлась в стену туннеля');
        }
        break;
      case 'bump':
        if (e.s === ME) {
          fx.thud({ x: 0, z: 0.5 });
          caption(`наткнулся на своего: ${named(r, e.other)}`);
        }
        break;
      case 'blocked':
        if (e.s === ME) {
          fx.thud({ x: 0, z: 0.6 });
          fx.rustle({ x: 0, z: 1 }, 0.4, 0.3);
          caption('впереди что-то плотное, не поддаётся');
        }
        break;
      case 'crush': {
        const spot = e.s === ME ? { x: 0, z: 0.3 } : rel(r, e.at[0], e.at[1]);
        fx.crunch(spot);
        if (e.s === ME) {
          r.stats.crushed++;
          shake.add(e.strong ? 0.35 : 0.2);
          caption(e.strong ? 'под тобой хрустнуло что-то большое' : 'под лапой что-то смялось');
        } else caption(`хруст — ${where(spot)}`);
        break;
      }
      case 'trap': {
        const spot = e.s === ME ? undefined : rel(r, e.at[0], e.at[1]);
        if (e.kind === 'pit') fx.sag(spot);
        else if (e.kind === 'mine') fx.pop(spot);
        else fx.twang(spot);
        if (e.s === ME) caption(e.kind === 'pit' ? 'пол проседает — яма' : e.kind === 'mine' ? 'хлопок под полом — мина' : 'лапа в петле: следующий ход короче');
        else if (spot) caption(`${e.kind === 'snare' ? 'звон проволоки' : 'хлопок'} — ${where(spot)}`);
        break;
      }
      case 'secret':
        if (e.s === ME) {
          fx.paper();
          r.stats.secrets++;
          caption(e.kind === 'hp' ? 'под лапой бумажка — и дышать легче (+хит)' : 'под лапой бумажка — в лапах лёгкость (+действие)');
        }
        break;
      case 'hit': {
        if (e.s === ME && !e.coord) {
          fx.cry(undefined, 1.05);
          hitPulse = 1;
          shake.add(0.6);
          r.stats.hits++;
          caption('удар!');
        } else if (e.s === ME && e.coord) {
          const spot = coordSpot(r, NORKIN);
          fx.cry(spot, 0.92);
          r.stats.covered++;
          say(r, NORKIN, 'Принимаю!', { signal: false });
          caption(`вскрик Норкина — ${sideWord(spot)}`);
        } else {
          const s = striker(r.b, e.s);
          const spot = e.coord ? coordSpot(r, e.s === 0 ? KOROCHKINA : ZERNOV) : rel(r, s.x, s.y);
          fx.cry(spot, e.s === 0 ? 1.15 : 0.85);
          caption(`вскрик — ${where(spot)}`);
        }
        break;
      }
      case 'death':
        if (e.s !== ME && !e.coord) caption(`${named(r, e.s)} затих`);
        break;
      case 'spawn': {
        const spot = rel(r, e.at[0], e.at[1]);
        fx.rustle(spot, 0.8, 0.12);
        caption(`новый шорох — ${where(spot)}`);
        break;
      }
      default:
        break;
    }
  }
}

/** The creatures' crawl: rustles from where they are now, the nearest two captioned. */
function presentCreep(r: Run, evs: readonly Ev[]): void {
  const spots: Spot[] = [];
  for (const e of evs) {
    if (e.t !== 'creep') continue;
    const spot = rel(r, e.to[0], e.to[1]);
    const d = Math.hypot(spot.x, spot.z);
    if (d > 5.5) continue;
    fx.rustle(spot, 0.7, Math.max(0.06, 0.28 - d * 0.04));
    spots.push(spot);
  }
  spots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  for (const s of spots.slice(0, 2)) if (Math.hypot(s.x, s.z) <= 3.5) caption(`шорох — ${where(s)}`);
}

// ---------- ambience: lamp beacon, drips, rustles, heart ----------

function startAmbience(): void {
  const lamp = () => {
    if (run && run.phase !== 'end' && me(run).alive) fx.click(lampSpot(run));
    setTimeout(lamp, 2000);
  };
  setTimeout(lamp, 600);
  const drip = () => {
    if (run && run.phase !== 'end') fx.drip({ x: Math.random() * 8 - 4, z: Math.random() * 8 - 4 });
    setTimeout(drip, 2500 + Math.random() * 3500);
  };
  setTimeout(drip, 1800);
  // Creatures don't keep still while the player thinks.
  const scrape = () => {
    if (run && (run.phase === 'listen' || run.phase === 'decide')) {
      const r = run;
      const near = r.b.creatures
        .filter((c) => c.alive)
        .map((c) => rel(r, c.x, c.y))
        .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
        .slice(0, 3);
      for (const s of near) {
        const d = Math.hypot(s.x, s.z);
        if (d < 4.5) fx.rustle(s, 0.35, Math.max(0.04, 0.16 - d * 0.025));
      }
    }
    setTimeout(scrape, 1700 + Math.random() * 600);
  };
  setTimeout(scrape, 2500);
  const heart = () => {
    const hp = run ? Math.max(1, me(run).hp) : 3;
    if (run && run.phase !== 'end' && me(run).alive) {
      fx.heart(hp === 1 ? 0.6 : hp === 2 ? 0.48 : 0.36);
      if (output === 'mute') heartPulse = 1;
    }
    setTimeout(heart, 60000 / (BPM[Math.min(3, hp)] ?? 62));
  };
  setTimeout(heart, 400);
  // Room tone: brown-ish noise, very low.
  sound.noise({ dur: 0.01, gain: 0.0001, bus: 'amb' });
  const tone = () => {
    sound.noise({ dur: 6.2, freq: 180, gain: 0.05, attack: 1.5, bus: 'amb' });
    setTimeout(tone, 6000);
  };
  tone();
}

// ---------- a run ----------

function freshStats(): Stats {
  return { said: 0, followed: 0, own: 0, against: 0, sniffs: 0, decisions: [], hits: 0, covered: 0, crushed: 0, secrets: 0 };
}

function newRun(): Run {
  const seed = params.has('seed') && runCounter === 0 ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
  const b = makeBattle({
    seed,
    pairs: [
      { name: 'Подвальный', coord: 'Корочкина', x: 1, y: START_ROW },
      { name: 'Ты', coord: 'Норкин', x: 4, y: START_ROW },
      { name: 'Хвостов', coord: 'Зернов', x: 7, y: START_ROW, jump: 3 },
    ],
    weak: 6,
    traps: 4,
    secrets: 4,
    arrivals: [
      [3, false],
      [3, false],
      [5, true],
      [5, true],
    ],
    retreatAfter: TURNS,
  });
  return {
    id: ++runCounter,
    seed,
    b,
    session: new Session('striker'),
    phase: 'whisper',
    trust: 1,
    scared: false,
    queue: [],
    slots: 3,
    said: [],
    meant: [],
    intent: '',
    sharp: 0,
    sharpTarget: 0,
    decideAt: 0,
    execIndex: -1,
    stats: freshStats(),
    submit: null,
    skip: null,
  };
}

const alive = (r: Run) => run === r;

async function startRun(): Promise<void> {
  const r = newRun();
  run = r;
  linesLayer.replaceChildren();
  captionsBox.replaceChildren();
  hudLayer.hidden = false;
  renderSlots(r);
  await wait(900);
  if (!alive(r)) return;
  // Before the first turn Норкин explains his words once, in a whisper.
  const line = say(r, NORKIN, 'Слушай. «Чуток» — это шаг. «Раз-два» — два шага. Я сзади.', { whisper: true });
  line.append(h('span', { class: 'next', text: 'Enter — дальше' }));
  await Promise.race([wait(9000), new Promise<void>((res) => (r.skip = res))]);
  r.skip = null;
  if (!alive(r)) return;
  fadeLines();
  await wait(500);
  while (alive(r) && !r.b.over && me(r).alive) await playTurn(r);
  if (alive(r)) finish(r);
}

/** Норкин sometimes asks for a sniff instead of standing still when something is close. */
function withSniff(r: Run, cmds: Cmd[]): Cmd[] {
  if (nearestSmell(r) === Infinity) return cmds;
  const i = cmds.indexOf('stay');
  if (i < 0) return cmds;
  const out = [...cmds];
  out[i] = 'sniff';
  return out;
}

async function playTurn(r: Run): Promise<void> {
  present(r, beginTurn(r.b));
  const self = me(r);
  r.phase = 'listen';
  r.queue = [];
  r.slots = self.actions;
  r.sharpTarget = 0;
  r.execIndex = -1;
  renderSlots(r);

  // Everyone's coordinators plan from the last flash; the player's own plan is Норкин's.
  const plans = new Map<number, Cmd[]>();
  const npcLines: [Speaker, Cmd[]][] = [];
  for (const sp of [KOROCHKINA, ZERNOV]) {
    const s = striker(r.b, sp.pair);
    if (!s.alive) continue;
    const p = plan(r.b, s.id, HOME[s.id]!).cmds;
    plans.set(s.id, p);
    npcLines.push([sp, p]);
  }
  const p = plan(r.b, ME, HOME[ME]!);
  r.meant = withSniff(r, p.cmds);
  // A strong one close by frightens him as much as a hit.
  if (r.b.creatures.some((c) => c.alive && c.strong && Math.abs(c.x - self.x) + Math.abs(c.y - self.y) <= 3)) r.scared = true;
  r.said = r.scared ? swapSides(r.meant) : r.meant;
  r.intent = p.intent;
  if (DEBUG) debugBox.textContent = `задумал: ${p.intent}\n${r.meant.map((c) => CMD_LABEL[c]).join(' · ') || '—'}\nсказал:  ${r.said.map((c) => CMD_LABEL[c]).join(' · ') || '—'}${r.scared ? '\n(напуган: путает стороны)' : ''}\nдоверие: ${r.trust}`;

  // Корочкина is senior and speaks first; Зернов, junior, talks over the end of the window.
  const [senior, junior] = [npcLines.find(([sp]) => sp === KOROCHKINA), npcLines.find(([sp]) => sp === ZERNOV)];
  if (senior) setTimeout(() => alive(r) && r.phase !== 'exec' && say(r, KOROCHKINA, plainLine(named(r, 0), senior[1])), 1300);
  if (junior) setTimeout(() => alive(r) && r.phase !== 'exec' && say(r, ZERNOV, plainLine(named(r, 2), junior[1])), 3300);
  await wait(2300);
  if (!alive(r)) return;
  say(r, NORKIN, norkinLine(r.said, r.scared));

  // The player's ten seconds.
  r.phase = 'decide';
  r.decideAt = performance.now();
  renderSlots(r);
  const smellBefore = nearestSmell(r);
  await new Promise<void>((resolve) => {
    r.submit = resolve;
    setTimeout(resolve, DECIDE_MS);
  });
  r.submit = null;
  if (!alive(r)) return;
  r.stats.decisions.push((performance.now() - r.decideAt) / 1000);
  r.phase = 'exec';
  fadeLines();

  // Followed as said? Unfilled slots count as «стой».
  const did: Cmd[] = Array.from({ length: Math.max(r.slots, r.queue.length) }, (_, i) => r.queue[i] ?? 'stay');
  let deviated = false;
  for (let i = 0; i < did.length; i++) {
    const asked = r.said[i] ?? 'stay';
    if (i < r.said.length) r.stats.said++;
    if (did[i] === asked) {
      if (i < r.said.length) r.stats.followed++;
    } else {
      r.stats.own++;
      deviated = true;
    }
  }
  plans.set(ME, r.queue);

  // Execution: everyone's i-th action at once.
  const crushedBefore = r.stats.crushed;
  const hitsBefore = r.stats.hits;
  const coverBefore = r.stats.covered;
  const phases = Math.max(...r.b.strikers.filter((s) => s.alive).map((s) => s.actions), r.queue.length);
  for (let i = 0; i < phases && me(r).alive; i++) {
    r.execIndex = i;
    renderSlots(r);
    present(r, stepPhase(r.b, plans, i));
    await wait(STEP_MS);
    if (!alive(r)) return;
  }
  r.execIndex = -1;
  renderSlots(r);
  if (!me(r).alive) return;

  // Creatures crawl; an attack on the player is taken by Норкин when he trusts him enough.
  const { ev, attacks } = creepPhase(r.b);
  presentCreep(r, ev);
  for (const a of attacks) {
    const s = striker(r.b, a.s);
    if (!s.alive) continue;
    const cover = a.s === ME ? r.trust >= 2 && s.coord.hp > 1 : s.hp === 1 && s.coord.hp > 1;
    present(r, hit(r.b, s, cover));
    if (cover && a.s !== ME) say(r, a.s === 0 ? KOROCHKINA : ZERNOV, 'Принимаю!', { signal: false });
  }
  await wait(CREEP_MS);
  if (!alive(r) || !me(r).alive) return;

  // Was going his own way a bet on the smell?
  const crushed = r.stats.crushed > crushedBefore;
  const hurt = r.stats.hits > hitsBefore;
  if (deviated && smellBefore !== Infinity && (crushed || nearestSmell(r) < smellBefore)) r.stats.against++;

  // Норкин's verdict, and trust.
  let reply = '';
  if (deviated) {
    reply = crushed ? 'Ты что творишь?! …Молодец.' : 'Ты что творишь?!';
    if (hurt) r.trust = Math.max(0, r.trust - 1);
  } else {
    if (crushed) reply = 'Молодец.';
    else if (hurt) reply = 'Прости. Прости…';
    r.trust = Math.min(3, r.trust + 1);
  }
  r.scared = hurt || r.stats.covered > coverBefore;

  const retreat = endTurn(r.b);
  if (retreat.length) {
    for (let i = 0; i < 4; i++) setTimeout(() => fx.rustle({ x: Math.cos(i * 1.7) * 4, z: Math.sin(i * 1.7) * 4 }, 1.2, 0.08), i * 250);
    caption('шорох уходит в темноту');
    reply = 'Уходят. Уходят! Живой?';
  }
  if (reply) {
    say(r, NORKIN, reply, { signal: false });
    await wait(1700);
    fadeLines();
  }
  await wait(600);
}

function finish(r: Run): void {
  r.phase = 'end';
  hudLayer.hidden = true;
  linesLayer.replaceChildren();
  const s = me(r);
  const survived = s.alive;
  const st = r.stats;
  const avg = st.decisions.length ? st.decisions.reduce((a, b) => a + b, 0) / st.decisions.length : 0;
  const followedPct = st.said ? Math.round((100 * st.followed) / st.said) : 0;
  const stats: [string, string | number][] = [
    ['итог', survived ? 'выжил' : `погиб на ходу ${r.b.turn}`],
    ['ходов', r.b.turn],
    ['команд Норкина выполнено как сказано', `${st.followed} из ${st.said} (${followedPct}%)`],
    ['своих действий', st.own],
    ['против команды — на запах', st.against],
    ['нюхал', st.sniffs],
    ['решение в среднем', `${avg.toFixed(1)} с`],
    ['ударов получил', st.hits],
    ['Норкин принял за него', st.covered],
    ['тварей раздавил', st.crushed],
    ['секретов', st.secrets],
    ['доверие в конце', `${r.trust} из 3`],
    ['зерно', r.seed],
  ];
  const rec = r.session.finish(survived ? 'выжил' : 'погиб', stats);
  showEnd(
    ui,
    {
      title: survived ? 'Отбой' : 'Ты упал',
      text: survived ? 'Твари отступили в темноту. Норкин снимает с тебя повязку.' : `На ${r.b.turn}-м ходу темнота закончилась. Норкин ещё зовёт тебя.`,
      stats,
      onAgain: () => void startRun(),
    },
    rec,
  );
}

// ---------- drawing ----------

let lastT = performance.now();

function draw(now: number): void {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  frame.begin();
  ctx.fillStyle = '#050404';
  ctx.fillRect(-2000, -2000, REF_W + 4000, REF_H + 4000);
  const r = run;
  if (r && r.phase !== 'end') {
    r.sharp += (r.sharpTarget - r.sharp) * Math.min(1, dt * (r.sharpTarget > r.sharp ? 5 : 1.5));
    const o = shake.offset(dt, 16);
    ctx.save();
    ctx.translate(CENTER.x + o.x, CENTER.y + o.y);
    ctx.rotate(o.r);
    if (me(r).alive) haze.draw(ctx, 0, 0, whiffs(r), r.sharp, now / 1000);
    drawSelf(ctx);
    ctx.restore();
    if (DEBUG) drawMap(ctx, r);
    barFill.style.transform = `scaleX(${r.phase === 'decide' ? Math.max(0, 1 - (now - r.decideAt) / DECIDE_MS) : 0})`;
  }
  // A hit flushes the edges red; with sound off, the heart pulses there.
  hitPulse = Math.max(0, hitPulse - dt * 1.4);
  heartPulse = Math.max(0, heartPulse - dt * 3);
  edge(ctx, `rgba(170, 32, 24, ${0.55 * hitPulse})`, hitPulse);
  if (heartPulse > 0) edge(ctx, `rgba(120, 30, 24, ${0.35 * heartPulse})`, heartPulse);
  requestAnimationFrame(draw);
}

function edge(c: CanvasRenderingContext2D, color: string, k: number): void {
  if (k <= 0) return;
  const g = c.createRadialGradient(REF_W / 2, REF_H / 2, 260, REF_W / 2, REF_H / 2, 760);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  c.fillStyle = g;
  c.fillRect(0, 0, REF_W, REF_H);
}

/** The faintest hint of the player's own head from above, nose up, with the white blindfold. */
function drawSelf(c: CanvasRenderingContext2D): void {
  c.save();
  c.globalAlpha = 0.09;
  c.strokeStyle = '#d8cbb0';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(0, 26, 22, 30, 0, 0, Math.PI * 2);
  c.moveTo(-14, 4);
  c.quadraticCurveTo(0, -46, 14, 4);
  c.stroke();
  c.globalAlpha = 0.16;
  c.fillStyle = '#f2ead8';
  c.fillRect(-15, -10, 30, 5);
  c.restore();
}

/** ?debug: the true field in a corner (what the player can't see). */
function drawMap(c: CanvasRenderingContext2D, r: Run): void {
  const cs = 16;
  const x0 = REF_W - 24 - cs * SIZE;
  const y0 = 24;
  c.fillStyle = 'rgba(234, 223, 198, 0.9)';
  c.fillRect(x0 - 4, y0 - 4, cs * SIZE + 8, cs * SIZE + 8);
  c.strokeStyle = 'rgba(28, 26, 24, 0.2)';
  for (let i = 0; i <= SIZE; i++) {
    c.beginPath();
    c.moveTo(x0 + i * cs, y0);
    c.lineTo(x0 + i * cs, y0 + SIZE * cs);
    c.moveTo(x0, y0 + i * cs);
    c.lineTo(x0 + SIZE * cs, y0 + i * cs);
    c.stroke();
  }
  for (const t of r.b.traps) {
    c.fillStyle = t.sprung ? '#8e1f17' : 'rgba(142, 31, 23, 0.35)';
    c.fillRect(x0 + t.x * cs + 4, y0 + t.y * cs + 4, cs - 8, cs - 8);
  }
  for (const s of r.b.secrets) {
    if (s.taken) continue;
    c.fillStyle = '#c9a227';
    c.beginPath();
    c.moveTo(x0 + s.x * cs + 4, y0 + s.y * cs + 11);
    c.lineTo(x0 + s.x * cs + 12, y0 + s.y * cs + 11);
    c.lineTo(x0 + s.x * cs + 8, y0 + s.y * cs + 5);
    c.fill();
  }
  for (const cr of r.b.creatures) {
    if (!cr.alive) continue;
    c.fillStyle = '#fff8ec';
    c.strokeStyle = '#1c1a18';
    c.fillRect(x0 + cr.x * cs + 2, y0 + cr.y * cs + 2, cs - 4, cs - 4);
    c.strokeRect(x0 + cr.x * cs + 2, y0 + cr.y * cs + 2, cs - 4, cs - 4);
    if (cr.strong) {
      c.beginPath();
      c.moveTo(x0 + cr.x * cs + 3, y0 + cr.y * cs + 3);
      c.lineTo(x0 + cr.x * cs + cs - 3, y0 + cr.y * cs + cs - 3);
      c.moveTo(x0 + cr.x * cs + cs - 3, y0 + cr.y * cs + 3);
      c.lineTo(x0 + cr.x * cs + 3, y0 + cr.y * cs + cs - 3);
      c.stroke();
    }
  }
  for (const s of r.b.strikers) {
    if (!s.alive) continue;
    const cx = x0 + s.x * cs + cs / 2;
    const cy = y0 + s.y * cs + cs / 2;
    c.fillStyle = s.id === ME ? '#c62f24' : '#1c1a18';
    c.beginPath();
    c.arc(cx, cy, 5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + DX[s.dir] * 8, cy + DY[s.dir] * 8);
    c.stroke();
    c.lineWidth = 1;
  }
}

// ---------- boot ----------

async function boot(): Promise<void> {
  requestAnimationFrame(draw);
  await fontsReady();
  output = await showStart(ui, {
    title: 'Ударник',
    lead: 'Ты на поле с завязанными глазами. Твой координатор Норкин видит поле во вспышках лампы и говорит, куда идти.',
    rules: [
      'Клавиши — относительно того, куда ты смотришь. Верх экрана — всегда «вперёд».',
      'Шаг давит слабую тварь. Сильную — только прыжок.',
      'Твари ползут к тебе. Ловушки спрятаны в полу.',
      'Три действия за ход. «Нюхать» тратит действие, зато запах становится чётче.',
      'Наушники желательны: каждый звук слышен оттуда, откуда он идёт.',
    ],
    keys: [
      ['W', 'шаг вперёд (ещё раз W — два шага за одно действие)'],
      ['S', 'шаг назад'],
      ['A D', 'шаг влево, вправо'],
      ['Q E', 'поворот налево, направо'],
      ['X', 'кругом'],
      ['Space', 'прыжок'],
      ['F', 'нюхать'],
      ['Backspace', 'стереть последнее'],
      ['Enter', 'готово'],
      ['C', 'подписи звуков'],
    ],
    output: 'headphones',
    button: 'Выйти на поле',
  });
  sound.unlock(output);
  captionsOn = output !== 'headphones';
  captionsBox.hidden = !captionsOn;
  layoutHud();
  startAmbience();
  void startRun();
}

void boot();
