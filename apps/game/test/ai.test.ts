import assert from 'node:assert/strict';
import { test } from 'node:test';
import { perform, plan, takesBlow } from '../src/core/ai.ts';
import { act, beginTurn, creepPhase, endTurn, makeBattle, stepPhase, strike, unit, type Battle, type Cmd } from '../src/core/battle.ts';
import { say, said } from '../src/core/voice.ts';
import { BATTLES, type BattleId } from '../src/content/battles.ts';
import { PLAYER_ID, SOLDIERS } from '../src/content/soldiers.ts';

function field(strikers: [number, number][], creatures: [number, number, boolean?][] = []): Battle {
  const b = makeBattle({ seed: 1, pairs: [], weak: 0, traps: 0, secrets: 0, retreatAfter: 8, maxTurns: 8 });
  strikers.forEach(([x, y], i) => {
    b.units.push({ id: `s${i}`, x, y, dir: 0, hp: 3, alive: true, jump: 2, lost: 0, bonus: 0, actions: 3, sniffed: false, bag: false, coord: `c${i}`, fate: 'free' });
    b.coords.push({ id: `c${i}`, x, hp: 3, alive: true });
  });
  for (const [x, y, strong] of creatures) b.creatures.push({ id: b.nextId++, x, y, strong: !!strong, alive: true, caught: false });
  return b;
}

const run = (b: Battle, id: string, cmds: readonly Cmd[]) => {
  for (const c of cmds) act(b, id, c);
  return b;
};

test('a coordinator crushes the creature right in front', () => {
  const b = field([[4, 7]], [[4, 6]]);
  const p = plan(b, 's0');
  assert.equal(run(structuredClone(b), 's0', p.cmds).creatures[0]!.alive, false, p.cmds.join(', '));
});

test('a coordinator turns his striker to meet a creature coming from the side', () => {
  const b = field([[4, 7]], [[6, 7]]);
  const after = run(structuredClone(b), 's0', plan(b, 's0').cmds);
  creepPhase(after);
  assert.equal(unit(after, 's0').hp, 3);
});

test('a coordinator keeps his striker in his own lane', () => {
  const b = field([[4, 7]], [[0, 2]]);
  const after = run(structuredClone(b), 's0', plan(b, 's0').cmds);
  assert.ok(Math.abs(unit(after, 's0').x - 4) <= 1);
});

test('a coordinator walks into a hidden trap he could not see', () => {
  const b = field([[4, 7]], [[4, 5]]);
  b.traps.push({ x: 4, y: 6, kind: 'pit', sprung: false });
  // The creature two cells ahead is worth a step; the pit under that step is not in the flash.
  const cmds = plan(b, 's0').cmds;
  assert.ok(cmds.includes('step') || cmds.includes('step2') || cmds.includes('jump'), cmds.join(', '));
});

test('alone in the dark, a striker knows only what he smells', () => {
  const b = field([[4, 7]], [[4, 1]]);
  const p = plan(b, 's0', { blind: 2 });
  assert.equal(p.intent, 'ждать, пока подползут');
});

test('quirks: scared Норкин swaps left and right unless he trusts the voice', () => {
  const b = field([[4, 7]]);
  const q = SOLDIERS.norkin!.quirks;
  assert.equal(perform(b, 's0', 'turnL', 0, q, { scared: true, trust: 0 }), 'turnR');
  assert.equal(perform(b, 's0', 'turnL', 0, q, { scared: true, trust: 2 }), 'turnL');
  assert.equal(perform(b, 's0', 'turnL', 0, q, { scared: false, trust: 0 }), 'turnL');
});

test('quirks: the timid one freezes next to a creature, the believer jumps at it, the wounded skips the third', () => {
  const b = field([[4, 7], [1, 7]], [[5, 7], [1, 5]]);
  assert.equal(perform(b, 's0', 'step', 0, ['timid'], { scared: false, trust: 0 }), 'stay');
  assert.equal(perform(b, 's1', 'step', 0, ['believer'], { scared: false, trust: 0 }), 'jump');
  unit(b, 's1').hp = 1;
  assert.equal(perform(b, 's1', 'turnL', 2, [], { scared: false, trust: 0 }), 'stay');
});

test('an NPC coordinator takes the blow only for a striker on his last hit, never with his own last', () => {
  const b = field([[4, 7]]);
  assert.equal(takesBlow(b, 's0'), false);
  unit(b, 's0').hp = 1;
  assert.equal(takesBlow(b, 's0'), true);
  b.coords[0]!.hp = 1;
  assert.equal(takesBlow(b, 's0'), false);
  b.coords[0]!.hp = 3;
  unit(b, 's0').hp = 3;
  assert.equal(takesBlow(b, 's0', { forPlayer: true, trust: 2 }), true);
});

test('Норкин\'s words: «чуток» is a step, «раз-два» two, and scared he swaps sides and stumbles', () => {
  const w = SOLDIERS.norkin!.words;
  assert.equal(say(['step', 'turnR', 'jump'], w), 'Чуток вперёд. Направо. Прыгай!');
  assert.equal(say(['step2', 'right', 'stay'], w), 'Раз-два вперёд. Чуток вправо. Стой.');
  assert.equal(say(['stay', 'stay', 'stay'], w), 'Стой. Ждём.');
  assert.equal(say(['turnL', 'step'], w, { scared: true }), 'На… направо. Чуток вперёд.');
  assert.deepEqual(said(['turnL', 'step'], w, true), ['turnR', 'step']);
  assert.equal(say(['step', 'turnL'], SOLDIERS.zernov!.words, { scared: true }), 'Вперёд. Налево.');
  assert.equal(say(['stay', 'step'], {}, { to: 'Подвальный' }), 'Подвальный, стой. Шаг вперёд.');
});

/** Plays a whole battle with every coordinator an NPC; `idle` makes the player's partner stand still. */
function simulate(id: BattleId, seed: number, idle: boolean) {
  const def = BATTLES[id];
  const b = makeBattle({ ...def.setup, seed });
  const partnerHits = { n: 0 };
  const falls: string[] = [];
  while (!b.over) {
    beginTurn(b);
    const plans = new Map<string, Cmd[]>();
    for (const u of b.units) {
      if (!u.alive) continue;
      const alone = !u.coord || !b.coords.find((c) => c.id === u.coord)?.alive;
      plans.set(u.id, idle && u.id === def.partner ? [] : plan(b, u.id, alone ? { blind: 2 } : {}).cmds);
    }
    const n = Math.max(0, ...b.units.map((u) => u.actions));
    for (let i = 0; i < n; i++) stepPhase(b, plans, i);
    const { attacks } = creepPhase(b);
    for (const a of attacks) {
      if (a.s === def.partner) partnerHits.n++;
      strike(b, a, a.s !== def.partner && takesBlow(b, a.s));
    }
    for (const e of endTurn(b)) if (e.t === 'fall') falls.push(e.s);
  }
  return { b, partnerHits: partnerHits.n, falls };
}

test('every battle sets up and plays to its end', () => {
  for (const id of Object.keys(BATTLES) as BattleId[]) {
    for (let seed = 1; seed <= 8; seed++) {
      const { b } = simulate(id, seed, false);
      assert.ok(b.over, `${id} seed ${seed}`);
      assert.ok(b.turn <= b.maxTurns);
    }
  }
});

test('battle 1 is not won without the player: an idle Норкин gets hit, a guided one less', () => {
  let idle = 0;
  let guided = 0;
  for (let seed = 1; seed <= 20; seed++) {
    idle += simulate('b1', seed, true).partnerHits;
    guided += simulate('b1', seed, false).partnerHits;
  }
  assert.ok(idle / 20 >= 0.6, `idle Норкин took ${idle / 20} hits a battle`);
  assert.ok(guided < idle, `guided ${guided} vs idle ${idle}`);
});

test('the script: Сырков falls in battle 1, Крыпоткин first in battle 3, nobody is left at the end of it', () => {
  for (let seed = 1; seed <= 6; seed++) {
    assert.ok(simulate('b1', seed, false).falls.includes('syrkov'));
    const three = simulate('b3', seed, false);
    assert.equal(three.falls[0], 'krypotkin');
    assert.equal(three.b.outcome, 'fallen');
    assert.ok(!three.b.units.some((u) => u.alive));
  }
  assert.ok(!BATTLES.b2.setup.pairs.some((p) => p.striker !== PLAYER_ID && typeof p.fate === 'object'));
});
