import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { compileInkFile } from '../tools/ink.ts';
import { StoryEngine, type StoryHost } from '../src/engine/story.ts';
import { actors, parseAction } from '../src/game/actions.ts';
import { isSpeaker } from '../src/content/cast.ts';
import { SCENES } from '../src/content/scenes.ts';

const { json } = compileInkFile(resolve(import.meta.dirname, '../../../story/main.ink'));

/** A host with seeded random answers, recording what the script changed. */
function host(seed: number, fem: boolean) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const flags = new Set<string>();
  const trust: Record<string, number> = { norkin: 1 };
  const h: StoryHost = {
    name: () => 'Иванова',
    fem: () => fem,
    trust: (id) => trust[id] ?? 0,
    trust_add: (id, by) => void (trust[id] = Math.max(0, Math.min(3, (trust[id] ?? 0) + by))),
    flag: (f) => flags.has(f) || (f.startsWith('letter9_') ? rnd() < 0.33 : false),
    flag_set: (f) => void flags.add(f),
    hp: () => 1 + Math.floor(rnd() * 3),
  };
  return { h, rnd, flags };
}

/** Every knot the scenes enter: talk and roam knots, and each roam hotspot's knot. */
function knots(): string[] {
  const out: string[] = ['c1_after_sofa'];
  for (const sc of SCENES) {
    if (sc.kind === 'talk' || sc.kind === 'roam') out.push(sc.id);
    for (const h of sc.hotspots ?? []) out.push(`${sc.id}_${h.id}`);
  }
  return out;
}

function play(engine: StoryEngine, knot: string, rnd: () => number) {
  const lines: { text: string; speaker: string | null; actions: string[] }[] = [];
  engine.enter(knot);
  for (let guard = 0; guard < 500; guard++) {
    const line = engine.next();
    if (line) {
      lines.push(line);
      continue;
    }
    const choices = engine.choices();
    if (!choices.length) break;
    engine.choose(choices[Math.floor(rnd() * choices.length)]!.index);
  }
  return lines;
}

test('every scene knot exists in the script', () => {
  const { h } = host(1, false);
  const engine = new StoryEngine(json, h);
  for (const k of knots()) assert.ok(engine.hasKnot(k), `missing knot ${k}`);
});

test('every path through every knot runs without errors, with known speakers and valid staging', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { h, rnd } = host(seed, seed % 2 === 0);
    const engine = new StoryEngine(json, h);
    for (const k of knots()) {
      const lines = play(engine, k, rnd);
      assert.deepEqual(engine.errors, [], `${k} (seed ${seed})`);
      assert.ok(lines.length > 0, `${k} says nothing`);
      for (const l of lines) {
        if (l.speaker) assert.ok(isSpeaker(l.speaker), `${k}: unknown speaker ${l.speaker}`);
        assert.doesNotMatch(l.text, /\{|\}|#/, `${k}: unrendered markup in «${l.text}»`);
        for (const a of l.actions) {
          const parsed = parseAction(a);
          assert.ok(parsed, `${k}: bad action ${a}`);
          for (const id of actors(parsed)) assert.ok(isSpeaker(id), `${k}: unknown actor ${id} in ${a}`);
        }
      }
    }
  }
});

test('gender reaches the words: рядовая is addressed as рядовая', () => {
  const { h, rnd } = host(3, true);
  const engine = new StoryEngine(json, h);
  const text = play(engine, 'c1_mail', rnd).map((l) => l.text).join(' ');
  assert.match(text, /Рядовая Иванова/);
  const male = host(3, false);
  const text2 = play(new StoryEngine(json, male.h), 'c1_mail', male.rnd).map((l) => l.text).join(' ');
  assert.match(text2, /Рядовой Иванова/);
});
