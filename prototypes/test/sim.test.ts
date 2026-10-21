import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plan } from '../shared/planner.ts';
import { act, beginTurn, creepPhase, endTurn, makeBattle, striker, targetOf, type Battle } from '../shared/sim.ts';

/** An empty field with the given strikers (all facing north, 3 hits) and creatures. */
function field(strikers: [number, number][], creatures: [number, number, boolean?][] = []): Battle {
  const b = makeBattle({ seed: 1, pairs: [], weak: 0, traps: 0, secrets: 0 });
  strikers.forEach(([x, y], i) => b.strikers.push({ id: i, name: `s${i}`, x, y, dir: 0, hp: 3, alive: true, jump: 2, lost: 0, bonus: 0, actions: 3, sniffed: false, coord: { name: `c${i}`, hp: 3 } }));
  creatures.forEach(([x, y, strong]) => b.creatures.push({ id: b.nextId++, x, y, strong: !!strong, alive: true }));
  return b;
}

test('a weak creature dies under a step, a strong one blocks it', () => {
  const b = field([[4, 7]], [[4, 6], [4, 4, true]]);
  const ev = act(b, 0, 'step');
  assert.ok(ev.some((e) => e.t === 'crush'));
  assert.equal(striker(b, 0).y, 6);
  act(b, 0, 'step');
  const blocked = act(b, 0, 'step');
  assert.ok(blocked.some((e) => e.t === 'blocked'));
  assert.equal(striker(b, 0).y, 5);
});

test('a jump lands on the first creature in the way and kills a strong one', () => {
  const b = field([[4, 7]], [[4, 6, true]]);
  act(b, 0, 'jump');
  assert.equal(striker(b, 0).y, 6);
  assert.equal(b.creatures[0]!.alive, false);
  const far = field([[4, 7]]);
  act(far, 0, 'jump');
  assert.equal(striker(far, 0).y, 5);
});

test('two steps stop at the wall', () => {
  const b = field([[4, 1]]);
  const ev = act(b, 0, 'step2');
  assert.equal(striker(b, 0).y, 0);
  assert.ok(ev.some((e) => e.t === 'wall'));
});

test('a creature crawls to the nearest striker, nearer the coordinators on a tie', () => {
  const b = field([[2, 4], [6, 6]], [[4, 3]]);
  // (2,4) is 3 steps away, (6,6) is 5: the first one wins.
  assert.equal(targetOf(b, b.creatures[0]!)?.id, 0);
  const tie = field([[2, 3], [6, 3], [4, 5]], [[4, 3]]);
  assert.equal(targetOf(tie, tie.creatures[0]!)?.id, 2);
});

test('crawling into a striker is an attack, and the creature stays', () => {
  const b = field([[4, 7]], [[4, 6]]);
  const { attacks } = creepPhase(b);
  assert.deepEqual(attacks, [{ c: b.creatures[0]!.id, s: 0 }]);
  assert.equal(b.creatures[0]!.y, 6);
});

test('a snare costs an action next turn, a secret gives one', () => {
  const b = field([[4, 7], [1, 7]]);
  b.traps.push({ x: 4, y: 6, kind: 'snare', sprung: false });
  b.secrets.push({ x: 1, y: 6, kind: 'action', taken: false });
  act(b, 0, 'step');
  act(b, 1, 'step');
  beginTurn(b);
  assert.equal(striker(b, 0).actions, 2);
  assert.equal(striker(b, 1).actions, 4);
});

test('creatures retreat after the eighth turn', () => {
  const b = makeBattle({ seed: 7, pairs: [{ name: 'Норкин', coord: 'Игрок', x: 4 }], weak: 6, traps: 3, secrets: 3 });
  for (let i = 0; i < 7; i++) {
    beginTurn(b);
    assert.deepEqual(endTurn(b), []);
  }
  beginTurn(b);
  assert.deepEqual(endTurn(b), [{ t: 'retreat' }]);
  assert.ok(b.over);
});

test('a coordinator crushes the creature right in front', () => {
  const b = field([[4, 7]], [[4, 6]]);
  const p = plan(b, 0);
  const after = structuredClone(b);
  for (const c of p.cmds) act(after, 0, c);
  assert.equal(after.creatures[0]!.alive, false, `plan was ${p.cmds.join(', ')}`);
});

test('a coordinator turns the striker toward a creature at its side', () => {
  const b = field([[4, 7]], [[6, 7]]);
  const p = plan(b, 0);
  const after = structuredClone(b);
  for (const c of p.cmds) act(after, 0, c);
  creepPhase(after);
  assert.equal(striker(after, 0).hp, 3, `plan was ${p.cmds.join(', ')}`);
});
