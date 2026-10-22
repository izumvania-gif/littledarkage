import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MUTINY, ROOM_MEN } from '../src/content/mutiny.ts';
import {
  alive,
  enterRoom,
  find,
  findPath,
  GENERAL,
  IDLE_INPUT,
  muster,
  newBrawl,
  offers,
  player,
  reach,
  resultOf,
  restartRoom,
  sides,
  skipToFinal,
  step,
  type Brawl,
  type Ev,
  type Input,
} from '../src/stages/mutiny/brawl.ts';
import { chronicle } from '../src/stages/mutiny/chronicle.ts';

const DT = 1 / 60;

function brawl(over: Partial<Parameters<typeof newBrawl>[0]> = {}): Brawl {
  return newBrawl({ allies: ['norkin'], waverers: [], loyal: ['syrkov', 'khvostov'], krypotkin: true, seed: 7, ...over });
}

function run(b: Brawl, seconds: number, input: Partial<Input> = {}): Ev[] {
  const out: Ev[] = [];
  for (let t = 0; t < seconds; t += DT) out.push(...step(b, DT, { ...IDLE_INPUT, ...input }));
  return out;
}

/** Everyone but the player and the general off the floor, so a rule can be watched alone. */
function only(b: Brawl, ...ids: string[]): void {
  b.units = b.units.filter((u) => u.id === 'player' || u.id === GENERAL || ids.includes(u.id));
}

test('the sides the concept fixes: Подвальный is with the general, Седой sits it out', () => {
  const s = sides({ allies: ['norkin', 'podvalny', 'sedoy'], waverers: ['korochkina', 'norkin'], loyal: ['syrkov', 'player', 'krypotkin'] });
  assert.deepEqual(s.allies, ['norkin']);
  assert.deepEqual(s.waverers, ['korochkina']);
  assert.deepEqual(s.loyal, ['syrkov', 'podvalny']);
  assert.equal(s.sedoy, true);
});

test('the general’s men: the bedroom first, nameless soldiers fill the rest, Подвальный by the general', () => {
  const m = muster(['syrkov', 'khvostov', 'podvalny']);
  assert.deepEqual(m[0], ['syrkov', 'khvostov', ...Array(ROOM_MEN[0] - 2).fill('extra')]);
  assert.equal(m[1]!.length, ROOM_MEN[1]);
  assert.ok(m[2]!.includes('podvalny'));
  assert.equal(m[2]!.length, ROOM_MEN[2]);
  const b = brawl({ loyal: ['podvalny'] });
  enterRoom(b, 2);
  const pod = find(b, 'podvalny')!;
  assert.equal(pod.side, 'loyal');
  assert.ok(Math.hypot(pod.x - find(b, GENERAL)!.x, pod.y - find(b, GENERAL)!.y) < 150);
});

test('any blow kills: the bedroom’s first man stands with his back turned, and one swing is enough', () => {
  const b = brawl();
  only(b, 'syrkov');
  const s = find(b, 'syrkov')!;
  assert.equal(s.dir, 0, 'he faces away from the door');
  const p = player(b);
  p.x = s.x - 40;
  p.y = s.y;
  const ev = run(b, 0.3, { attack: true, ax: s.x, ay: s.y });
  assert.ok(ev.some((e) => e.t === 'kill' && e.id === 'syrkov'));
  assert.equal(alive(s), false);
  assert.equal(b.stats.kills, 1);
  assert.equal(b.stats.byWeapon.pen, 1, 'the sharpened pen from the duty is in hand');
});

test('walls stop the general’s voice: «…но!» freezes whoever it reaches, not the one behind the partition', () => {
  const b = brawl();
  only(b, 'syrkov');
  const p = player(b);
  const s = find(b, 'syrkov')!;
  // The general by the partition's far side; the player behind it, the man in the open, both within reach.
  b.shout = { kind: 'attention', x: 700, y: 120, t: 0.01 };
  p.x = 560;
  p.y = 120;
  s.x = 760;
  s.y = 271;
  const ev = run(b, 0.05);
  const heard = ev.find((e) => e.t === 'heard');
  assert.ok(heard && heard.t === 'heard' && !heard.drowned);
  assert.ok(s.frozen > 0, 'the man in the open stands frozen');
  assert.equal(p.frozen, 0, 'the partition kept the voice off the player');
  // In the open the player freezes too.
  p.x = 700;
  p.y = 271;
  b.shout = { kind: 'attention', x: 760, y: 200, t: 0.01 };
  run(b, 0.05);
  assert.ok(p.frozen > 0);
  assert.equal(b.stats.frozen, 1);
});

test('the tape recorder on full drowns the orders', () => {
  const b = brawl();
  only(b, 'syrkov');
  const p = player(b);
  const tape = [71, 76];
  p.x = tape[0]!;
  p.y = tape[1]! + 40;
  const ev = run(b, DT, { use: true });
  assert.ok(ev.some((e) => e.t === 'tape'));
  assert.equal(b.tape, true);
  b.shout = { kind: 'attention', x: p.x + 60, y: p.y, t: 0.01 };
  const ev2 = run(b, 0.05);
  const heard = ev2.find((e) => e.t === 'heard');
  assert.ok(heard && heard.t === 'heard' && heard.drowned);
  assert.equal(p.frozen, 0);
  assert.equal(b.stats.drowned, 1);
  assert.equal(resultOf(b, 'spared').tapeUsed, true);
});

test('the general never shouts while one of his men stands by the player', () => {
  const b = brawl();
  only(b, 'syrkov');
  const p = player(b);
  const g = find(b, GENERAL)!;
  const s = find(b, 'syrkov')!;
  p.x = 1000;
  p.y = 270;
  s.x = 1040;
  s.y = 270;
  s.frozen = 99;
  b.shoutCd = 0;
  // A frozen man doesn't count as a threat: put him to sleep another way, by the rule's own measure.
  s.frozen = 0;
  s.mode = 'recover';
  s.timer = 99;
  const ev = run(b, 0.2);
  assert.ok(!ev.some((e) => e.t === 'shout'), 'no shout with a man at the player’s side');
  s.x = 1180;
  s.y = 470;
  const ev2 = run(b, 0.2);
  assert.ok(ev2.some((e) => e.t === 'shout' && e.kind === 'attention'));
  assert.ok(Math.hypot(g.x - p.x, g.y - p.y) <= MUTINY.shoutRadius);
});

test('«Отставить!» sends a waverer to the bunks; he goes over to the side that leads', () => {
  const b = brawl({ allies: ['korochkina', 'zernov'], waverers: ['norkin'], loyal: ['syrkov'] });
  only(b, 'syrkov', 'norkin', 'korochkina', 'zernov');
  const n = find(b, 'norkin')!;
  n.x = 900;
  n.y = 270;
  b.shout = { kind: 'cancel', x: 1000, y: 270, t: 0.01 };
  run(b, 0.05);
  assert.equal(n.side, 'neutral');
  assert.equal(n.mode, 'waver');
  assert.deepEqual(b.stats.wavered, ['norkin']);
  // The general's men fall; the rebels lead by two or more, and he comes back.
  find(b, 'syrkov')!.mode = 'down';
  run(b, 8);
  assert.equal(n.side, 'ally');
  assert.deepEqual(b.stats.rejoined, ['norkin']);
});

test('death restarts the room from its door at once; the count stays, and so does the music', () => {
  const b = brawl();
  only(b, 'syrkov');
  const s = find(b, 'syrkov')!;
  const p = player(b);
  b.tape = true;
  b.stats.tape = true;
  p.x = s.x + 40;
  p.y = s.y;
  s.mode = 'windup';
  s.aim = 0;
  s.timer = 0.01;
  s.target = 'player';
  const ev = run(b, 0.1);
  assert.ok(ev.some((e) => e.t === 'dead'));
  assert.equal(b.phase, 'dead');
  assert.equal(b.deaths[0], 1);
  restartRoom(b);
  assert.equal(b.phase, 'fight');
  assert.ok(alive(player(b)));
  assert.equal(player(b).x, 80, 'back at the door');
  assert.equal(b.deaths[0], 1);
  assert.equal(b.tape, true);
  assert.equal(find(b, 'syrkov')!.dir, 0, 'the room as it was: his back turned again');
});

test('after eight deaths in one room, «без спешки»; a few more, the skip straight to «Ну? Бей»', () => {
  const b = brawl();
  assert.deepEqual(offers(b), { slow: false, skip: false });
  b.deaths[0] = MUTINY.slowAfter;
  assert.deepEqual(offers(b), { slow: true, skip: false });
  b.slow = true;
  b.deaths[0] = MUTINY.skipAfter;
  assert.deepEqual(offers(b), { slow: false, skip: true });
  skipToFinal(b);
  assert.equal(b.room, 2);
  assert.equal(b.phase, 'final');
  assert.equal(find(b, GENERAL)!.ammo, 0);
  assert.equal(b.stats.skipped, true);
  assert.equal(resultOf(b, 'spared').deaths, MUTINY.skipAfter);
});

test('«Встать в строй» is a choice, not a defeat: no chronicle, the rest as it was', () => {
  const b = brawl();
  run(b, 1);
  const r = resultOf(b, 'surrendered');
  assert.equal(r.outcome, 'surrendered');
  assert.deepEqual(r.chronicle, []);
  assert.equal(r.krypotkinKilledBy, null);
});

test('the general loses his nagan to a blow, never his life; the player can take it and fire', () => {
  const b = brawl();
  enterRoom(b, 2);
  // His men stand by, busy with something else, so the office isn't over yet.
  for (const u of b.units) if (u.side === 'loyal') Object.assign(u, { mode: 'recover', timer: 99 });
  const g = find(b, GENERAL)!;
  const p = player(b);
  b.shoutCd = 99;
  b.shotCd = 99;
  p.x = g.x - 40;
  p.y = g.y;
  run(b, 0.2, { attack: true, ax: g.x, ay: g.y });
  assert.ok(alive(g));
  assert.equal(g.weapon, 'fists');
  const gun = b.items.find((i) => i.kind === 'nagan')!;
  assert.equal(gun.ammo, MUTINY.ammo);
  p.x = gun.x;
  p.y = gun.y;
  run(b, DT, { use: true });
  assert.equal(p.weapon, 'nagan');
  assert.equal(b.stats.revolver, true);
});

test('in the office, without men and cartridges, the general backs into the corner: «Ну? Бей»', () => {
  const b = brawl();
  enterRoom(b, 2, { empty: true });
  const g = find(b, GENERAL)!;
  g.weapon = 'fists';
  g.ammo = 0;
  const ev = run(b, 0.1);
  assert.ok(ev.some((e) => e.t === 'cornered'));
  const p = player(b);
  run(b, 2);
  p.x = g.x - 100;
  p.y = g.y;
  const ev2 = run(b, 0.1);
  assert.ok(ev2.some((e) => e.t === 'final'));
  assert.equal(b.phase, 'final');
});

test('the sofa barely moves alone; pushed with an ally it rams and crushes', () => {
  const b = brawl({ allies: ['norkin'], loyal: ['syrkov'] });
  only(b, 'syrkov', 'norkin');
  const sofa = b.sofa!;
  const p = player(b);
  const n = find(b, 'norkin')!;
  const s = find(b, 'syrkov')!;
  s.mode = 'recover';
  s.timer = 99;
  p.x = sofa.x - 18;
  p.y = sofa.y + 10;
  n.mode = 'recover';
  n.timer = 99;
  run(b, DT, { use: true });
  assert.equal(sofa.held, true);
  const x0 = sofa.x;
  run(b, 1, { mx: 1 });
  assert.ok(sofa.x - x0 < MUTINY.sofaAlone * 1.1, 'alone: a crawl');
  // The ally comes to push beside the player.
  n.mode = 'follow';
  run(b, 3);
  assert.equal(sofa.attached, true);
  s.x = sofa.x + sofa.w + 60;
  s.y = sofa.y + sofa.h / 2;
  const ev = run(b, 0.6, { mx: 1 });
  assert.ok(ev.some((e) => e.t === 'kill' && e.id === 'syrkov' && e.weapon === 'sofa'));
  assert.equal(b.stats.sofaKills, 1);
});

test('Крыпоткин can be hit, and the book of record knows by whom', () => {
  const b = brawl();
  enterRoom(b, 1);
  only(b, 'krypotkin');
  const k = find(b, 'krypotkin')!;
  const p = player(b);
  p.x = k.x - 40;
  p.y = k.y;
  run(b, 0.2, { attack: true, ax: k.x, ay: k.y });
  assert.equal(alive(k), false);
  assert.equal(resultOf(b, 'killed').krypotkinKilledBy, 'player');
});

test('a room replays exactly from the same seed and input', () => {
  const a = brawl({ waverers: ['korochkina'] });
  const c = brawl({ waverers: ['korochkina'] });
  for (let i = 0; i < 900; i++) {
    const input: Input = { ...IDLE_INPUT, mx: Math.sin(i / 40), my: Math.cos(i / 70), attack: i % 50 === 0 };
    step(a, DT, input);
    step(c, DT, input);
  }
  assert.equal(JSON.stringify(a), JSON.stringify(c));
});

test('the chronicle retells the brawl in 3–5 windows, from what really happened', () => {
  const b = brawl();
  const st = b.stats;
  st.byWeapon = { stool: 3, pen: 1 };
  st.tape = true;
  st.krypotkin = 'player';
  const c = chronicle(st, 'killed');
  assert.deepEqual(c, ['1. ГЕНЕРАЛ НЕ СЛЫШАЛ НАРОД.', '2. НАРОД ВЗЯЛ ТАБУРЕТКУ.', '3. МУЗЫКА ЗАГЛУШИЛА ПРИКАЗ.', '4. ФИЛОСОФ ПОПАЛ ПОД РУКУ.', '5. ТИРАН ПАЛ.']);
  const bare = chronicle(newBrawl({ allies: [], waverers: [], loyal: [], krypotkin: false, seed: 1 }).stats, 'spared');
  assert.ok(bare.length >= 3 && bare.length <= 5);
  assert.equal(bare.at(-1), `${bare.length}. НАРОД ПРОЯВИЛ МИЛОСТЬ.`);
});

test('a whole brawl can be won: the rooms open one by one and end at the general', () => {
  // A plain robot: go for the nearest of the general's men and swing, then through the open door.
  const b = brawl({ allies: ['norkin', 'korochkina'], loyal: ['syrkov'], slow: false });
  let guard = 0;
  while (b.phase !== 'final' && guard++ < 60 * 400) {
    if (b.phase === 'dead') {
      restartRoom(b);
      continue;
    }
    if (b.phase === 'exit') {
      enterRoom(b, b.room + 1);
      continue;
    }
    const p = player(b);
    const foe = b.units.filter((u) => u.side === 'loyal' && alive(u)).sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y))[0];
    const g = find(b, GENERAL)!;
    const ex = b.room < 2 ? { x: 1270, y: 270 } : g;
    const t = foe ?? ex;
    // A room replays exactly, so the robot varies itself from one attempt to the next, as a person would.
    const attempt = b.deaths[b.room]!;
    const input = b.roomTime < (attempt % 4) * 0.4 ? { ...IDLE_INPUT } : driveTo(b, t.x, t.y, !!foe || b.room === 2);
    if (b.aim) {
      // Out of the aim line, sideways, to whichever side has room.
      const up = b.aim.dir - Math.PI / 2;
      const down = b.aim.dir + Math.PI / 2;
      const a = reach(b, p.x, p.y, up, 200, 'move') > reach(b, p.x, p.y, down, 200, 'move') ? up : down;
      input.mx = Math.cos(a);
      input.my = Math.sin(a);
    }
    step(b, DT, input);
  }
  assert.equal(b.phase, 'final', `stuck in room ${b.room} after ${b.deaths.join('/')} deaths`);
});

/** Steers the player along the room's grid toward a point, swinging when near. */
function driveTo(b: Brawl, x: number, y: number, swing: boolean): Input {
  const p = player(b);
  const d = Math.hypot(x - p.x, y - p.y);
  return { ...IDLE_INPUT, ...toward(b, x, y), ax: x, ay: y, attack: swing && d < 60 };
}

function toward(b: Brawl, x: number, y: number): { mx: number; my: number } {
  const p = player(b);
  const path = findPath(b.room, p.x, p.y, x, y);
  const tx = path[0] ?? x;
  const ty = path[1] ?? y;
  const nx = path.length >= 4 && Math.hypot(tx - p.x, ty - p.y) < 8 ? path[2]! : tx;
  const ny = path.length >= 4 && Math.hypot(tx - p.x, ty - p.y) < 8 ? path[3]! : ty;
  const d = Math.hypot(nx - p.x, ny - p.y) || 1;
  return { mx: (nx - p.x) / d, my: (ny - p.y) / d };
}
