/**
 * Prototype В: one room of the mutiny (concept §6 «Бунт: драка с генералом»). Hotline Miami on a ROSTA
 * poster: any hit kills, R restarts at once, the general's «Смир-…но!» freezes everyone it reaches,
 * blood is flat poster red and stays. Question: does it work, and does the player want another go?
 */
import '../shared/fonts.ts';
import '../shared/base.css';
import './brawl.css';
import { h } from '../shared/dom.ts';
import { fontsReady } from '../shared/fonts.ts';
import { createFrame, place, Shake } from '../shared/frame.ts';
import { Session, showEnd, showStart } from '../shared/session.ts';
import { Sound, sfx, type Spot } from '../shared/sound.ts';
import { CREAM, drawCrosshair, drawDebug, drawFrozen, drawItem, drawRat, drawTape, drawVoice, drawWindup, floorBase, INK, lookOf, propsLayer, reachOf, splat, stampBody } from './draw.ts';
import { TapeMusic } from './music.ts';
import { ITEM, VOICE_RADIUS, World, type Actor, type AttemptStats, type WEv } from './world.ts';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const CALM = params.has('calm');
const SLOGANS = ['ДОЛОЙ!', 'ХВАТИТ!', 'НЕ ПОЙДЁМ!'];
const SLOW_AFTER = 8;

const frame = createFrame();
const { ctx, ui } = frame;
const sound = new Sound();
const fx = sfx(sound);
let music: TapeMusic | null = null;

const base = floorBase();
const props = propsLayer();
const floor = document.createElement('canvas');
floor.width = base.width;
floor.height = base.height;
const floorCtx = floor.getContext('2d')!;

// ---------- the run: one Session, many attempts at the room ----------

interface Run {
  session: Session;
  deaths: number;
  attempts: AttemptStats[];
  rDelays: number[];
  deathAt: number | null;
  tape: string | null;
  krypDeaths: number;
  krypKillers: string[];
  slow: boolean;
}

const newRun = (): Run => ({ session: new Session('brawl'), deaths: 0, attempts: [], rDelays: [], deathAt: null, tape: null, krypDeaths: 0, krypKillers: [], slow: false });

let run = newRun();
let world = new World();
let paused = false;
let ended = true;
let hitStop = 0;
let flash = 0;
let tracer: { from: { x: number; y: number }; to: { x: number; y: number }; t: number } | null = null;
const shake = new Shake();

// ---------- DOM plates ----------

const slogan = h('div', { class: 'slogan', attrs: { 'aria-hidden': 'true' } });
const voiceEl = h('div', { class: 'voice', attrs: { 'aria-live': 'assertive' } });
const holdEl = h('div', { class: 'hud' });
const hintEl = h('div', { class: 'hud' });
const deathEl = h('div', { class: 'center-plate' }, h('p', {}, h('kbd', { text: 'R' }), ' — заново'));
const slowBtn = h('button', { class: 'secondary', text: 'Без спешки', attrs: { type: 'button' } });
const slowEl = h('div', { class: 'center-plate' }, h('p', { text: 'Не выходит? Можно медленнее: всё на 0,7 скорости.' }), slowBtn);
const pauseEl = h('div', { class: 'center-plate' }, h('p', { text: 'Пауза' }), h('p', {}, h('kbd', { text: 'P' }), ' — дальше, ', h('kbd', { text: 'R' }), ' — комната заново'));
const helpKeys = h('dl', { class: 'keys' });
const HELP: [string, string][] = [
  ['W A S D', 'идти'],
  ['мышь', 'целиться'],
  ['ЛКМ', 'ударить'],
  ['ПКМ', 'бросить'],
  ['E', 'поднять, магнитофон'],
  ['R', 'комната заново'],
  ['P', 'пауза'],
  ['H', 'закрыть'],
];
for (const [k, v] of HELP) {
  helpKeys.append(h('dt', {}, ...k.split(' ').flatMap((p, i) => [i ? ' ' : '', /^[а-я]/.test(p) ? p : h('kbd', { text: p })])), h('dd', { text: v }));
}
const helpEl = h('div', { class: 'center-plate' }, h('p', { text: 'Управление' }), helpKeys);
const clearEl = h('div', { class: 'center-plate big' }, h('p', { text: 'Комната чиста.' }), h('p', { text: 'Генерал ушёл в кабинет.' }));
for (const el of [deathEl, slowEl, pauseEl, helpEl, clearEl, voiceEl, holdEl, hintEl, slogan]) el.hidden = true;
const bubbles = new Map<number, { el: HTMLElement; until: number; actor: Actor }>();

slowBtn.addEventListener('click', () => {
  run.slow = true;
  slowEl.hidden = true;
  slowBtn.blur();
});

function layout(): void {
  place(frame, deathEl, 640, 600, 0.5, 0.5);
  place(frame, slowEl, 640, 470, 0.5, 0.5);
  place(frame, pauseEl, 640, 360, 0.5, 0.5);
  place(frame, helpEl, 640, 360, 0.5, 0.5);
  place(frame, clearEl, 640, 360, 0.5, 0.5);
  place(frame, holdEl, 48, 705, 0, 0.5);
}
frame.onResize(layout);

let sloganTimer = 0;
function showSlogan(): void {
  if (CALM) return;
  slogan.textContent = SLOGANS[Math.floor(Math.random() * SLOGANS.length)]!;
  const xs = [230, 520, 820];
  place(frame, slogan, xs[Math.floor(Math.random() * xs.length)]!, 28, 0.5, 0.5);
  slogan.hidden = false;
  slogan.classList.add('on');
  window.clearTimeout(sloganTimer);
  sloganTimer = window.setTimeout(() => {
    slogan.classList.remove('on');
    slogan.hidden = true;
  }, 420);
}

function say(a: Actor, text: string, seconds = 1.8): void {
  let b = bubbles.get(a.id);
  if (!b) {
    b = { el: h('div', { class: 'bubble' }), until: 0, actor: a };
    ui.append(b.el);
    bubbles.set(a.id, b);
  }
  b.el.textContent = text;
  b.until = performance.now() + seconds * 1000;
  b.actor = a;
}

/** The general's line: «Смир-…» for as long as he draws breath, then «…но!» for a moment. Crossed out under the music. */
let barkUntil = 0;
let barkDrowned = false;
let voiceShown = '';
function voiceLine(text: string, drowned: boolean): void {
  const key = `${text}|${drowned}`;
  if (key === voiceShown) return;
  voiceShown = key;
  voiceEl.replaceChildren(drowned ? h('s', { text }) : text, drowned ? h('small', { text: 'не слышно' }) : '');
  voiceEl.classList.toggle('drowned', drowned);
}

// ---------- input: actions, not keys ----------

const held = new Set<string>();
const aim = { x: 640, y: 360 };
let attackAt = -1e9;
let throwAt = -1e9;
let useAt = -1e9;
const BUFFER_MS = 120;

window.addEventListener('keydown', (e) => {
  if (ended) return;
  held.add(e.code);
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyE':
      useAt = performance.now();
      break;
    case 'KeyR':
      e.preventDefault();
      restartRoom();
      break;
    case 'KeyH':
      helpEl.hidden = !helpEl.hidden;
      if (!helpEl.hidden) pauseEl.hidden = true;
      paused = !helpEl.hidden;
      break;
    case 'KeyP':
    case 'Escape':
      if (!helpEl.hidden) {
        helpEl.hidden = true;
        paused = false;
      } else {
        paused = !paused;
        pauseEl.hidden = !paused;
      }
      break;
    case 'KeyK':
      if (DEBUG) world.killAll();
      break;
    case 'Space':
      e.preventDefault();
      break;
  }
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());
frame.canvas.addEventListener('mousemove', (e) => {
  const p = frame.toRef(e.clientX, e.clientY);
  aim.x = p.x;
  aim.y = p.y;
});
frame.canvas.addEventListener('mousedown', (e) => {
  if (ended || paused) return;
  if (e.button === 0) attackAt = performance.now();
  else if (e.button === 2) throwAt = performance.now();
});
frame.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !ended) {
    paused = true;
    pauseEl.hidden = !helpEl.hidden ? true : false;
  }
});

function readInput() {
  const now = performance.now();
  const ax = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
  const ay = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
  const input = { mx: ax, my: ay, aim: { ...aim }, attack: now - attackAt < BUFFER_MS, throw: now - throwAt < BUFFER_MS, use: now - useAt < BUFFER_MS };
  // Throws and E fire once; an attack stays buffered until a swing actually happens.
  throwAt = -1e9;
  useAt = -1e9;
  return input;
}

// ---------- sound helpers ----------

const spot = (x: number): Spot => ({ x: (x - 640) / 240, z: 1.2 });

function inhaleSound(): void {
  sound.noise({ dur: 0.45, filter: 'bandpass', freq: 500, to: 1800, q: 1.4, gain: 0.16, attack: 0.3, spot: spot(world.general.x) });
}

function barkSound(drowned: boolean): void {
  const s = spot(world.general.x);
  const k = drowned ? 0.35 : 1;
  sound.tone({ freq: 175, to: 120, type: 'sawtooth', dur: 0.34, gain: 0.32 * k, spot: s });
  sound.tone({ freq: 88, to: 70, type: 'square', dur: 0.3, gain: 0.18 * k, spot: s });
  sound.noise({ dur: 0.26, filter: 'bandpass', freq: 950, q: 2, gain: 0.3 * k, spot: s });
}

// ---------- events → blood, shake, sound, plates ----------

function handle(ev: WEv): void {
  switch (ev.t) {
    case 'swing':
      if (ev.a.kind === 'player') attackAt = -1e9;
      if (ev.weapon) fx.whoosh(spot(ev.a.x));
      else sound.noise({ dur: 0.1, filter: 'bandpass', freq: 900, to: 1600, q: 1.2, gain: 0.14, spot: spot(ev.a.x) });
      break;
    case 'kill': {
      const v = ev.victim;
      const size = ev.how === 'weapon' ? 30 : ev.how === 'shot' ? 26 : 20;
      splat(floorCtx, v.x, v.y, ev.dir, size);
      stampBody(floorCtx, v, ev.dir);
      fx.crunch(spot(v.x));
      fx.thud(spot(v.x));
      fx.splat(spot(v.x));
      if (v.kind === 'man') {
        hitStop = 0.07;
        if (!CALM) shake.add(ev.how === 'weapon' ? 0.48 : ev.how === 'shot' ? 0.32 : 0.36);
        showSlogan();
      } else if (v.kind === 'player') {
        if (!CALM) shake.add(0.6);
        fx.cry(spot(v.x), 0.9);
        run.deaths++;
        run.deathAt = performance.now();
        deathEl.hidden = false;
        if (run.deaths >= SLOW_AFTER && !run.slow) slowEl.hidden = false;
      } else if (v.kind === 'krypotkin') {
        // No slogan, no hit-stop: this one should feel wrong.
        if (!CALM) shake.add(0.18);
        run.krypDeaths++;
        run.krypKillers.push(v.killer ?? 'никто');
        bubbles.get(v.id)?.el.remove();
        bubbles.delete(v.id);
      } else {
        if (!CALM) shake.add(0.25);
        fx.cry(spot(v.x), 1.15);
        bubbles.get(v.id)?.el.remove();
        bubbles.delete(v.id);
      }
      break;
    }
    case 'knock':
      if (ev.how === 'fists') splat(floorCtx, ev.victim.x, ev.victim.y, ev.dir, 6);
      fx.thud(spot(ev.victim.x));
      if (!CALM) shake.add(0.16);
      break;
    case 'throw':
      fx.whoosh(spot(ev.a.x));
      break;
    case 'clatter':
      sound.noise({ dur: 0.12, filter: 'bandpass', freq: 1400, q: 2, gain: 0.25, spot: spot(ev.x) });
      sound.tone({ freq: 240, to: 180, dur: 0.12, gain: 0.12, spot: spot(ev.x) });
      break;
    case 'pick':
      fx.uiTick();
      break;
    case 'aim':
      fx.click(spot(world.general.x));
      break;
    case 'shot':
      fx.shot(spot(ev.from.x));
      tracer = { from: ev.from, to: ev.to, t: 0.09 };
      if (!CALM) shake.add(0.26);
      break;
    case 'empty':
      sound.tone({ freq: 2200, dur: 0.03, gain: 0.12, type: 'square', spot: spot(world.general.x) });
      say(world.general, 'Щёлк.', 1.2);
      break;
    case 'inhale':
      inhaleSound();
      break;
    case 'bark':
      barkSound(ev.drowned);
      barkUntil = world.time + 0.9;
      barkDrowned = ev.drowned;
      if (!ev.drowned && !CALM) flash = 0.16;
      break;
    case 'say':
      say(ev.a, ev.text, ev.a.kind === 'ally' ? 2.2 : 1.8);
      if (ev.a.kind === 'ally') fx.cry(spot(ev.a.x), 1.2);
      break;
    case 'tape':
      fx.click(spot(640));
      if (ev.on) {
        music?.start();
        if (!run.tape) run.tape = `включён в попытке ${run.attempts.length + 1}, на ${Math.round(world.time)}-й секунде`;
      } else music?.stop();
      break;
    case 'gone':
      fx.thud(spot(world.general.x));
      break;
    case 'clear':
      finishAttempt();
      clearEl.hidden = false;
      window.setTimeout(endRun, 2400);
      break;
    default:
      break;
  }
}

// ---------- attempts ----------

function finishAttempt(): void {
  run.attempts.push({ ...world.stats });
}

function resetRoom(): void {
  world = new World();
  floorCtx.drawImage(base, 0, 0);
  hitStop = 0;
  flash = 0;
  tracer = null;
  shake.trauma = 0;
  attackAt = throwAt = useAt = -1e9;
  music?.stop();
  for (const b of bubbles.values()) b.el.remove();
  bubbles.clear();
  deathEl.hidden = true;
  slowEl.hidden = true;
  voiceEl.hidden = true;
  barkUntil = 0;
  clearEl.hidden = true;
}

function restartRoom(): void {
  if (ended || world.cleared) return;
  if (run.deathAt !== null) run.rDelays.push((performance.now() - run.deathAt) / 1000);
  run.deathAt = null;
  finishAttempt();
  resetRoom();
  paused = false;
  pauseEl.hidden = true;
  helpEl.hidden = true;
}

function sum(k: keyof AttemptStats): number {
  return run.attempts.reduce((s, a) => s + ((a[k] as number | null) ?? 0), 0);
}

function endRun(): void {
  ended = true;
  music?.stop();
  clearEl.hidden = true;
  holdEl.hidden = true;
  hintEl.hidden = true;
  const avgR = run.rDelays.length ? run.rDelays.reduce((a, b) => a + b, 0) / run.rDelays.length : null;
  const k = world.kryp;
  const krypNow = k.state === 'dead' ? `погиб, удар: ${k.killer}` : 'жив';
  const krypBefore = run.krypDeaths - (k.state === 'dead' ? 1 : 0);
  const stats: [string, string | number][] = [
    ['смертей до победы', run.deaths],
    ['победная попытка', `${Math.round(world.time)} с`],
    ['от смерти до R, в среднем', avgR === null ? '—' : `${avgR.toFixed(1)} с`],
    ['убийств оружием / кулаками', `${sum('killsWeapon')} / ${sum('killsFists')}`],
    ['бросков / сбито броском', `${sum('throws')} / ${sum('knocksThrow')}`],
    ['«Смирно!» прозвучало', sum('shouts')],
    ['заморозило тебя', sum('froze')],
    ['голос не достал: за стеной', sum('hid')],
    ['голос заглушён магнитофоном', sum('drowned')],
    ['магнитофон', run.tape ?? 'не включали'],
    ['Крыпоткин в победной попытке', krypNow],
    ['Крыпоткин погибал раньше', krypBefore ? `${krypBefore} раз (${run.krypKillers.slice(0, krypBefore).join(', ')})` : 'нет'],
    ['без спешки', run.slow ? 'да' : 'нет'],
  ];
  const rec = run.session.finish('комната пройдена', stats);
  showEnd(
    ui,
    {
      title: 'Комната чиста',
      text: k.state === 'dead' ? `Генерал ушёл в кабинет. Крыпоткин лежит в спальне: удар — ${k.killer === 'ты' ? 'твой' : k.killer}.` : 'Генерал ушёл в кабинет. Дальше были бы столовая и его кабинет.',
      stats,
      onAgain: () => {
        run = newRun();
        resetRoom();
        ended = false;
        paused = false;
      },
    },
    rec,
  );
}

// ---------- drawing ----------

function draw(realDt: number): void {
  frame.begin();
  const off = CALM ? { x: 0, y: 0, r: 0 } : shake.offset(realDt, 16);
  ctx.save();
  ctx.translate(640 + off.x, 360 + off.y);
  ctx.rotate(off.r);
  ctx.translate(-640, -360);
  ctx.drawImage(floor, 0, 0);
  ctx.drawImage(props, 0, 0);
  const p = world.player;
  const playerUp = world.alive(p);
  drawTape(ctx, world.tapeOn, world.time, playerUp && world.nearTape() && !world.underfoot());
  for (const it of world.items) if (!it.flying) drawItem(ctx, it);
  for (const a of world.actors) {
    if (a.state === 'down') drawRat(ctx, a.x, a.y, a.face + 1.3, { ...lookOf(a), lying: true, outline: undefined, marker: false }, null, 0, null);
  }
  const g = world.general;
  if (world.voice) drawVoice(ctx, g, world.voice.poly, world.voice.k, VOICE_RADIUS);
  for (const a of world.actors) {
    if (a.state === 'windup') drawWindup(ctx, a, reachOf(a), 1 - a.t / 0.25);
  }
  for (const a of world.actors) {
    if (a.state === 'dead' || a.state === 'gone' || a.state === 'down') continue;
    drawRat(ctx, a.x, a.y, a.kind === 'man' && a.state === 'windup' ? a.swing : a.face, lookOf(a), a.hold, a.swingT, a.swingT > 0 ? a.face : null);
    if (a.freeze > 0) drawFrozen(ctx, a);
  }
  for (const it of world.items) if (it.flying) drawItem(ctx, it);
  if (world.aimLine) {
    ctx.save();
    ctx.strokeStyle = '#c62f24';
    ctx.lineWidth = world.aimLine.locked ? 3 : 1.5;
    if (!world.aimLine.locked) ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(world.aimLine.from.x, world.aimLine.from.y);
    ctx.lineTo(world.aimLine.to.x, world.aimLine.to.y);
    ctx.stroke();
    ctx.restore();
  }
  if (tracer) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.globalAlpha = Math.min(1, tracer.t / 0.09);
    ctx.beginPath();
    ctx.moveTo(tracer.from.x, tracer.from.y);
    ctx.lineTo(tracer.to.x, tracer.to.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    tracer.t -= realDt;
    if (tracer.t <= 0) tracer = null;
  }
  if (flash > 0) {
    ctx.fillStyle = CREAM;
    ctx.globalAlpha = Math.min(0.55, flash * 4);
    ctx.fillRect(0, 0, 1280, 720);
    ctx.globalAlpha = 1;
    flash -= realDt;
  }
  if (DEBUG) drawDebug(ctx, world);
  ctx.restore();
  if (!ended) drawCrosshair(ctx, aim.x, aim.y);
}

function updateDom(): void {
  const now = performance.now();
  for (const [id, b] of bubbles) {
    if (now > b.until || !world.alive(b.actor)) {
      b.el.remove();
      bubbles.delete(id);
      continue;
    }
    place(frame, b.el, b.actor.x, b.actor.y - 24, 0.5, 1);
  }
  const g = world.general;
  if (world.voice) voiceLine('Смир-…', world.tapeOn);
  else if (world.time < barkUntil) voiceLine('…но!', barkDrowned);
  voiceEl.hidden = ended || g.state === 'gone' || (!world.voice && world.time >= barkUntil);
  if (!voiceEl.hidden) place(frame, voiceEl, g.x - 30, g.y + 30, 1, 0);
  const p = world.player;
  if (ended || !world.alive(p)) {
    hintEl.hidden = true;
  } else {
    const it = world.underfoot();
    const hint = it ? ['E', ` — поднять ${ITEM[it.kind].acc}`] : world.nearTape() ? ['E', world.tapeOn ? ' — выключить магнитофон' : ' — включить магнитофон'] : null;
    hintEl.hidden = !hint;
    if (hint) {
      hintEl.replaceChildren(h('kbd', { text: hint[0]! }), hint[1]!);
      place(frame, hintEl, p.x, p.y + 30, 0.5, 0);
    }
  }
  holdEl.hidden = ended;
  holdEl.textContent = `В руках: ${p.hold ? ITEM[p.hold].name : 'кулаки'}${run.slow ? ' · без спешки' : ''}`;
}

// ---------- loop ----------

const perf = { dom: 0, draw: 0 };
let last = performance.now();
function loop(now: number): void {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && !ended) {
    if (hitStop > 0) hitStop -= realDt;
    else {
      world.update(realDt * (run.slow ? 0.7 : 1), readInput());
      const evs = world.events;
      world.events = [];
      for (const ev of evs) handle(ev);
    }
  }
  const t0 = performance.now();
  updateDom();
  const t1 = performance.now();
  draw(realDt);
  perf.dom = perf.dom * 0.9 + (t1 - t0) * 0.1;
  perf.draw = perf.draw * 0.9 + (performance.now() - t1) * 0.1;
  requestAnimationFrame(loop);
}

// ---------- start ----------

async function start(): Promise<void> {
  ui.append(slogan, voiceEl, holdEl, hintEl, deathEl, slowEl, pauseEl, helpEl, clearEl);
  layout();
  floorCtx.drawImage(base, 0, 0);
  await fontsReady();
  requestAnimationFrame(loop);
  const seen = (() => {
    try {
      return sessionStorage.getItem('lda.proto.brawl.seen') === '1';
    } catch {
      return false;
    }
  })();
  const out = await showStart(
    ui,
    seen
      ? { title: 'Бунт', lead: 'Та же спальня. Генерал у дальней двери.', keys: [['W A S D', 'идти'], ['ЛКМ', 'ударить'], ['ПКМ', 'бросить'], ['E', 'поднять, магнитофон'], ['R', 'заново'], ['H', 'управление']] }
      : {
          title: 'Бунт',
          lead: 'Генерал ответил: «Приказы не обсуждаются». Казарма раскололась. «Не пойдём» — это были твои слова, и рядом встали не все.',
          rules: ['Любой удар убивает. Тебя тоже.', 'R — комната заново, сразу.', 'Кулак сбивает с ног, лежачего добивают. Табуретка, ножка от нар и кочерга убивают сразу.', '«Смирно!» генерала замораживает всех, до кого долетит голос. Стены его глушат.'],
          keys: [
            ['W A S D', 'идти, мышь — целиться'],
            ['ЛКМ', 'ударить'],
            ['ПКМ', 'бросить то, что в руках'],
            ['E', 'поднять, магнитофон'],
            ['H', 'управление, P — пауза'],
          ],
          output: 'speakers',
        },
  );
  try {
    sessionStorage.setItem('lda.proto.brawl.seen', '1');
  } catch {
    /* private mode: the full card shows again, that's fine */
  }
  sound.unlock(out);
  if (sound.ctx) {
    const bus = sound.bus('music');
    if (bus) music = new TapeMusic(sound.ctx, bus);
  }
  run = newRun();
  resetRoom();
  ended = false;
  last = performance.now();
}

void start();

// ?debug: the console and the playtest scripts can reach the room.
if (DEBUG) (window as unknown as { brawl: unknown }).brawl = { get world() { return world; }, perf };

