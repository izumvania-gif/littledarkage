import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, beginTurn, creepPhase, endTurn, makeBattle, mishears, relative, report, smell, strike, targetOf, unit, type Battle, type Fate } from '../src/core/battle.ts';

/** An empty field with the given strikers (facing north, 3 hits, each with a coordinator) and creatures. */
function field(strikers: [number, number, Fate?][], creatures: [number, number, boolean?][] = []): Battle {
  const b = makeBattle({ seed: 1, pairs: [], weak: 0, traps: 0, secrets: 0, retreatAfter: 8, maxTurns: 8 });
  strikers.forEach(([x, y, fate], i) => {
    b.units.push({ id: `s${i}`, x, y, dir: 0, hp: 3, alive: true, jump: 2, lost: 0, bonus: 0, actions: 3, sniffed: false, bag: false, coord: `c${i}`, fate: fate ?? 'free' });
    b.coords.push({ id: `c${i}`, x, hp: 3, alive: true });
  });
  for (const [x, y, strong] of creatures) b.creatures.push({ id: b.nextId++, x, y, strong: !!strong, alive: true, caught: false });
  return b;
}

test('a weak creature dies under a step; a strong one blocks the step', () => {
  const b = field([[4, 7]], [[4, 6], [4, 4, true]]);
  assert.ok(act(b, 's0', 'step').some((e) => e.t === 'crush'));
  assert.equal(unit(b, 's0').y, 6);
  act(b, 's0', 'step');
  assert.ok(act(b, 's0', 'step').some((e) => e.t === 'blocked'));
  assert.equal(unit(b, 's0').y, 5);
});

test('a jump lands on the first creature in its way and kills even a strong one', () => {
  const b = field([[4, 7]], [[4, 6, true]]);
  act(b, 's0', 'jump');
  assert.equal(unit(b, 's0').y, 6);
  assert.equal(b.creatures[0]!.alive, false);
  const open = field([[4, 7]]);
  act(open, 's0', 'jump');
  assert.equal(unit(open, 's0').y, 5);
});

test('commands are from the striker\'s side: facing east, «шаг влево» goes north', () => {
  const b = field([[4, 7]]);
  act(b, 's0', 'turnR');
  act(b, 's0', 'left');
  assert.deepEqual([unit(b, 's0').x, unit(b, 's0').y], [4, 6]);
});

test('two steps stop at the tunnel wall', () => {
  const b = field([[4, 1]]);
  assert.ok(act(b, 's0', 'step2').some((e) => e.t === 'wall'));
  assert.equal(unit(b, 's0').y, 0);
});

test('a creature crawls to the nearest striker, the one nearer the coordinators on a tie', () => {
  const b = field([[2, 4], [6, 6]], [[4, 3]]);
  assert.equal(targetOf(b, b.creatures[0]!)?.id, 's0');
  const tie = field([[2, 3], [6, 3], [4, 5]], [[4, 3]]);
  assert.equal(targetOf(tie, tie.creatures[0]!)?.id, 's2');
});

test('crawling into a striker is an attack; the creature stays', () => {
  const b = field([[4, 7]], [[4, 6]]);
  const { attacks } = creepPhase(b);
  assert.deepEqual(attacks, [{ c: b.creatures[0]!.id, s: 's0' }]);
  assert.equal(b.creatures[0]!.y, 6);
});

test('«Принять удар»: the coordinator takes the blow, and falls on his last hit', () => {
  const b = field([[4, 7]], [[4, 6]]);
  const [a] = creepPhase(b).attacks;
  assert.ok(a);
  strike(b, a, true);
  assert.equal(unit(b, 's0').hp, 3);
  assert.equal(b.coords[0]!.hp, 2);
  strike(b, a, true);
  assert.ok(strike(b, a, true).some((e) => e.t === 'coordDown'));
  // With his coordinator down, the next blow lands on the striker.
  strike(b, a, true);
  assert.equal(unit(b, 's0').hp, 2);
});

test('a spared soldier is grazed instead of killed', () => {
  const b = field([[4, 7, 'spared']]);
  unit(b, 's0').hp = 1;
  assert.ok(strike(b, { c: 0, s: 's0' }, false).some((e) => e.t === 'graze'));
  assert.ok(unit(b, 's0').alive);
});

test('the script takes a soldier at the end of his turn, and a coordinator too', () => {
  const b = field([[4, 7, { dies: 2 }], [1, 7]]);
  b.coords[1]!.dies = 2;
  beginTurn(b);
  assert.deepEqual(endTurn(b), []);
  beginTurn(b);
  const ev = endTurn(b);
  assert.ok(ev.some((e) => e.t === 'fall' && e.s === 's0' && e.scripted));
  assert.ok(ev.some((e) => e.t === 'coordDown' && e.c === 'c1'));
});

test('a snare costs an action next turn, a secret gives one', () => {
  const b = field([[4, 7], [1, 7]]);
  b.traps.push({ x: 4, y: 6, kind: 'snare', sprung: false });
  b.secrets.push({ x: 1, y: 6, kind: 'action', taken: false });
  act(b, 's0', 'step');
  act(b, 's1', 'step');
  beginTurn(b);
  assert.equal(unit(b, 's0').actions, 2);
  assert.equal(unit(b, 's1').actions, 4);
});

test('the sack takes a weak creature alive and tears on a strong one', () => {
  const b = field([[4, 7], [1, 7]], [[4, 6], [1, 6, true]]);
  unit(b, 's0').bag = true;
  unit(b, 's1').bag = true;
  assert.ok(act(b, 's0', 'cover').some((e) => e.t === 'capture'));
  assert.equal(b.creatures[0]!.caught, true);
  assert.equal(unit(b, 's0').bag, false);
  assert.ok(act(b, 's1', 'cover').some((e) => e.t === 'miss'));
  assert.equal(unit(b, 's1').bag, true);
});

test('waves arrive on their turn from their side', () => {
  const b = field([[4, 7]]);
  b.waves = [
    { turn: 2, weak: 3, strong: 0, from: 'far' },
    { turn: 3, weak: 0, strong: 2, from: 'sides' },
  ];
  beginTurn(b);
  assert.equal(b.creatures.length, 0);
  beginTurn(b);
  assert.deepEqual(
    b.creatures.map((c) => c.y),
    [0, 0, 0],
  );
  beginTurn(b);
  const strong = b.creatures.filter((c) => c.strong);
  assert.equal(strong.length, 2);
  assert.ok(strong.every((c) => c.x === 0 || c.x === 8));
});

test('creatures retreat after the last turn; with no retreat the battle ends when everyone has fallen', () => {
  const b = field([[4, 7]], [[0, 0]]);
  for (let i = 0; i < 7; i++) {
    beginTurn(b);
    assert.deepEqual(endTurn(b), []);
  }
  beginTurn(b);
  assert.equal(endTurn(b).at(-1)?.t, 'end');
  assert.equal(b.outcome, 'retreat');
  const last = field([[4, 7, { dies: 3 }]]);
  last.retreatAfter = null;
  last.maxTurns = 12;
  for (let i = 0; i < 3; i++) {
    beginTurn(last);
    endTurn(last);
  }
  assert.equal(last.outcome, 'fallen');
});

test('a smell is told relative to where the striker looks', () => {
  const b = field([[4, 7]], [[5, 7], [4, 3]]);
  assert.deepEqual(
    smell(b, 's0', 2).map((s) => [s.right, s.ahead]),
    [[1, 0]],
  );
  act(b, 's0', 'turnR');
  const [s] = smell(b, 's0', 2);
  assert.deepEqual([s?.right, s?.ahead], [0, 1]);
  assert.deepEqual(relative(2, 1, 0), { right: -1, ahead: 0 });
});

test('one voice is never misheard', () => {
  const b = field([]);
  for (let i = 0; i < 50; i++) assert.equal(mishears(b, 1, true, 1), false);
});

test('a battle is plain data: saved mid-way, it plays on exactly the same', () => {
  const play = (b: Battle) => {
    const ev = [];
    for (let i = 0; i < 3; i++) {
      ev.push(...beginTurn(b));
      for (const u of b.units) ev.push(...act(b, u.id, 'step'));
      ev.push(...creepPhase(b).ev);
      ev.push(...endTurn(b));
    }
    return ev;
  };
  const setup = { seed: 42, pairs: [{ striker: 'a', coord: 'b', x: 4 }], weak: 4, traps: 3, secrets: 3, waves: [{ turn: 2, weak: 2, strong: 1, from: 'all' as const }], retreatAfter: 8, maxTurns: 8 };
  const one = makeBattle(setup);
  const two = makeBattle(setup);
  assert.deepEqual(play(one), play(two));
  const saved = JSON.parse(JSON.stringify(one)) as Battle;
  assert.deepEqual(play(saved), play(one));
  assert.deepEqual(saved, one);
});

test('a bunk stops a step and cuts a jump short, and the paw feels it', () => {
  const b = field([[4, 7]]);
  b.obstacles = [[4, 6]];
  assert.deepEqual(act(b, 's0', 'step').map((e) => e.t), ['obstacle']);
  assert.equal(act(b, 's0', 'jump')[0]?.t, 'obstacle');
  assert.equal(unit(b, 's0').y, 7);
  // A bunk two cells ahead: the jump lands on the cell before it.
  const short = field([[4, 7]]);
  short.obstacles = [[4, 5]];
  act(short, 's0', 'jump');
  assert.equal(unit(short, 's0').y, 6);
});

test('creatures crawl around a bunk; the nearest striker is the nearest by the way round', () => {
  // A wall of bunks between the creature and the striker straight below it.
  const b = field([[4, 7], [8, 4]], [[4, 3]]);
  b.obstacles = [[3, 5], [4, 5], [5, 5], [6, 5], [2, 5], [1, 5], [0, 5], [7, 5]];
  // As the crow flies s0 is 4 away and s1 4 too; round the wall s0 is far further.
  assert.equal(targetOf(b, b.creatures[0]!)?.id, 's1');
  const open = field([[4, 7]], [[4, 4]]);
  open.obstacles = [[4, 5]];
  const { ev } = creepPhase(open);
  const step = ev.find((e) => e.t === 'creep');
  assert.ok(step && step.t === 'creep');
  assert.notDeepEqual(step.to, [4, 5]);
  assert.equal(step.to[1], 4, 'it sidesteps the bunk');
  for (let i = 0; i < 4; i++) creepPhase(open);
  assert.ok(creepPhase(open).attacks.length, 'and gets to him in the end');
});

test('nothing is set up or arrives on an obstacle', () => {
  const obstacles = [0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((x): [number, number][] => [[x, 0], [x, 2]]);
  for (let seed = 1; seed <= 10; seed++) {
    const b = makeBattle({ seed, pairs: [{ striker: 'a', coord: null, x: 4 }], weak: 6, traps: 3, secrets: 3, obstacles, creatureRows: [0, 3], waves: [{ turn: 1, weak: 6, strong: 2, from: 'all' }], retreatAfter: null, maxTurns: 4 });
    beginTurn(b);
    const bad = (x: number, y: number) => obstacles.some(([ox, oy]) => ox === x && oy === y);
    for (const c of b.creatures) assert.ok(!bad(c.x, c.y), `creature on a bunk at ${c.x},${c.y}`);
    for (const t of [...b.traps, ...b.secrets]) assert.ok(!bad(t.x, t.y));
  }
});

test('a soldier the script takes on a turn is grazed, not killed, before it', () => {
  const b = field([[4, 7, { dies: 3, spared: true }], [2, 7, { dies: 3 }]]);
  unit(b, 's0').hp = 1;
  unit(b, 's1').hp = 1;
  assert.ok(strike(b, { c: 0, s: 's0' }, false).some((e) => e.t === 'graze'));
  assert.ok(strike(b, { c: 0, s: 's1' }, false).some((e) => e.t === 'fall'));
  for (let i = 0; i < 3; i++) {
    beginTurn(b);
    endTurn(b);
  }
  assert.equal(unit(b, 's0').alive, false);
});

test('one coordinator may speak for two strikers: he stands at the first', () => {
  const b = makeBattle({ seed: 3, pairs: [{ striker: 'norkin', coord: 'me', x: 5 }, { striker: 'krypotkin', coord: 'me', x: 3 }], weak: 0, traps: 0, secrets: 0, retreatAfter: null, maxTurns: 4 });
  assert.equal(b.coords.length, 1);
  assert.equal(b.coords[0]!.x, 5);
  assert.deepEqual(b.units.map((u) => u.coord), ['me', 'me']);
});

test('the report: who fell, a creature taken alive, who crushed how many', () => {
  const b = field([[4, 7], [1, 7]], [[4, 6], [4, 4], [1, 6]]);
  unit(b, 's1').bag = true;
  act(b, 's0', 'step');
  act(b, 's0', 'jump');
  act(b, 's1', 'cover');
  unit(b, 's1').hp = 1;
  strike(b, { c: 0, s: 's1' }, false);
  assert.deepEqual(report(b), { fell: ['s1'], caught: true, kills: { s0: 2 } });
});

test('obstacles are plain data too: a saved field with bunks plays on the same', () => {
  const setup = { seed: 9, pairs: [{ striker: 'a', coord: null, x: 4 }], weak: 3, traps: 0, secrets: 1, obstacles: [[3, 3], [5, 3], [4, 1]] as [number, number][], waves: [{ turn: 2, weak: 1, strong: 2, from: 'all' as const }], retreatAfter: null, maxTurns: 6 };
  const play = (b: Battle) => {
    const ev = [];
    for (let i = 0; i < 4; i++) {
      ev.push(...beginTurn(b), ...act(b, 'a', i % 2 ? 'turnL' : 'step'), ...creepPhase(b).ev, ...endTurn(b));
    }
    return ev;
  };
  const one = makeBattle(setup);
  play(one);
  const saved = JSON.parse(JSON.stringify(one)) as Battle;
  assert.deepEqual(play(saved), play(one));
});
