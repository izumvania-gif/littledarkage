#!/usr/bin/env node
// The automatic playthroughs (needs `npm run build` first):
//   node agent/selftest.mjs [--variant plain|mutiny|fallen] [--shots DIR] [--url URL] [--headed] [-v]
// Each variant plays the whole game from the first screen through the prologue, three cycles and the finale,
// only through observe/act, with a fixed seed, and checks the ending the register remembers. It fails loudly on
// a page error, a screen with nothing to do, a stall (the same screen over and over) or an action that hangs.
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LdaGame } from './game.mjs';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? undefined : argv[i + 1];
};
const verbose = argv.includes('-v') || argv.includes('--verbose');
const shots = opt('shots') ? resolve(opt('shots')) : null;
const only = opt('variant');

/**
 * What each playthrough does differently. `choose` picks a reply on the caption plate (by its text), `blows`
 * takes every blow on the coordinator in battle 1, `place` picks a place in the barracks (by its index among n),
 * `final` is the answer to «Ну? Бей.».
 */
const MUTINY = /не пойд/i;
const VARIANTS = {
  // Обычный путь: никакого бунта, книга учёта, «Шеренга».
  plain: { seed: 11, names: ['Иванова'], gender: 'f', choose: (c) => Math.max(0, c.findIndex((t) => !MUTINY.test(t))), place: () => 0, ending: 'lineup', reply: true },
  // Бунт, драка, удар: «Новый генерал».
  mutiny: { seed: 23, names: ['Петров'], gender: 'm', choose: (c) => Math.max(0, c.findIndex((t) => MUTINY.test(t))), place: (n) => n - 1, final: 'strike', ending: 'newGeneral' },
  // Игрок принимает удары в первом бою, падает и возвращается под новым именем; бунт и «опустить руки»: «Пустая стена».
  fallen: { seed: 5, names: ['Сидорова', 'Кузнецова'], gender: 'f', choose: (c) => Math.max(0, c.findIndex((t) => MUTINY.test(t))), blows: 'c1_battle', place: (n) => Math.min(1, n - 1), final: 'spare', ending: 'emptyWall' },
};

/** Names for a roll call after the variant's own are used up (a return, the finale's wall). */
const POOL = { f: ['Морозова', 'Волкова', 'Лебедева', 'Соколова', 'Орлова'], m: ['Морозов', 'Волков', 'Лебедев', 'Соколов', 'Орлов'] };
/** Buttons a playthrough never presses on its own (they leave the story or open side panels). */
const NEVER = /^ui:(настройки|начать-заново|опустить-в-ящик|звук|клавиши|сначала|стереть)/;
/** Buttons that move a window on, in the order they are tried. */
const ONWARD = ['ui:встать-в-строй', 'ui:вернуться-в-строй', 'ui:играть-здесь', 'ui:продолжить', 'ui:развернуть', 'ui:прочитать-про-себя', 'ui:дальше', 'ui:сложить', 'ui:готово', 'ui:закрыть', 'ui:так', 'ui:ок'];

class Fail extends Error {}

async function play(key, v) {
  const t0 = Date.now();
  const profile = join(tmpdir(), `lda-selftest-${key}-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  const game = await new LdaGame({ url: opt('url'), profile, headed: argv.includes('--headed'), seed: v.seed, gamePort: 0 }).start();
  const log = (...a) => console.log(`[${key}]`, ...a);
  const shoot = async (what) => {
    if (!shots) return;
    mkdirSync(shots, { recursive: true });
    const path = join(shots, `${key}-${what}.png`);
    await Promise.race([game.screenshot(path), new Promise((r) => setTimeout(r, 15000))]).catch(() => undefined);
    log('screenshot', path);
  };
  const s = { tried: new Set(), slips: 0, replied: false, idle: 0, same: 0, last: '', scenes: [], battle: '' };
  let o = await game.newGame();
  let steps = 0;
  try {
    for (;;) {
      if (game.errors.length) throw new Fail(`page error: ${game.errors.join(' | ')}`);
      if (++steps > 6000) throw new Fail('too many steps');
      const scene = o.run?.scene ?? (o.where === 'Вступление' ? 'intro' : '');
      if (scene && scene !== s.scenes.at(-1)?.id) {
        s.scenes.push({ id: scene, at: Date.now() });
        log(`scene ${scene} (${((Date.now() - t0) / 1000).toFixed(0)} s, step ${steps})`);
      }
      // The end: the finale wrote the run into the register and the page reloaded for the next roll call.
      const memory = await game.page.evaluate(() => JSON.parse(localStorage.getItem('lda.save') ?? 'null')?.memory).catch(() => null);
      if (memory?.endings?.length) {
        const ending = memory.endings.at(-1);
        if (ending !== v.ending) throw new Fail(`ending ${ending}, expected ${v.ending}`);
        log(`ending ${ending} · ${s.scenes.length} scenes · ${steps} steps · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
        await shoot('end');
        return { ok: true, scenes: s.scenes.length, steps, seconds: (Date.now() - t0) / 1000 };
      }
      // Stalls: the same screen and actions over and over; screens with nothing to do but wait.
      const print = `${o.where}|${o.plate?.text ?? ''}|${o.screen.join('|')}|${o.actions.map((a) => a.id).join(',')}|${o.text.length}`;
      s.same = print === s.last ? s.same + 1 : 0;
      s.last = print;
      if (s.same > 40) throw new Fail(`stall: the same screen ${s.same} times`);
      const [id, arg] = decide(o, v, s);
      if (id === 'wait') {
        if (++s.idle > 30) throw new Fail('a screen with no action: only waiting');
      } else s.idle = 0;
      if (verbose) log(`> ${id}${arg ? ` ${arg}` : ''}`);
      const t = Date.now();
      o = await Promise.race([game.act(id, arg), new Promise((_, no) => setTimeout(() => no(new Fail(`action ${id} hangs (3 min)`)), 180_000))]);
      if (verbose) log(`  ${o.result} (${((Date.now() - t) / 1000).toFixed(1)} s)\n${o.text.replace(/^/gm, '    ')}`);
      if (/^Нет такого/.test(o.result)) throw new Fail(`the game refused ${id}: ${o.result}`);
    }
  } catch (e) {
    log(`FAIL at step ${steps}, scene ${s.scenes.at(-1)?.id ?? '?'}: ${e.message}`);
    log(`last screen:\n${o?.text?.replace(/^/gm, '    ')}`);
    await shoot('fail');
    return { ok: false, scenes: s.scenes.length, steps, seconds: (Date.now() - t0) / 1000, error: e.message };
  } finally {
    await game.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

/** One step of the policy: what a patient player who reads nothing between the lines would press. */
function decide(o, v, s) {
  const ids = o.actions.map((a) => a.id);
  const has = (id) => ids.includes(id);
  const action = (re) => o.actions.find((a) => re.test(a.id));
  // The roll call (and a return at a muster, and the name at the finale's wall).
  // A name already given (or refused: «уже числится») is not given again: the next from the variant, then the pool.
  const name = o.actions.find((a) => a.id.startsWith('type:') && /имя/i.test(a.label));
  if (name) {
    const value = /сейчас: «(.*)»/.exec(name.label)?.[1] ?? '';
    if (!value || s.tried.has(value)) return [name.id, [...v.names, ...POOL[v.gender]].find((n) => !s.tried.has(n))];
    const g = v.gender === 'f' ? 'ui:рядовая' : 'ui:рядовой';
    const radio = o.actions.find((a) => a.id === g);
    if (radio && !/выбрано/.test(radio.label)) return [g];
    if (has('ui:назвать')) {
      s.tried.add(value);
      return ['ui:назвать'];
    }
  }
  // «Кому:» on the triangle: the guessed dative is right.
  if (has('ui:так')) return ['ui:так'];
  // A question on the caption plate.
  if (o.plate?.choices.length) return [`say:${v.choose(o.plate.choices) + 1}`];
  // Battles: the coordinator's blow, then the same planner as the others; the striker does as heard.
  if (has('accept')) return [v.blows && o.run?.scene?.includes(v.blows) ? 'accept' : 'decline'];
  // The mutiny: the autopilot fights; at the end, the variant's answer.
  if (has('strike')) return [v.final ?? 'spare'];
  if (has('fight')) return ['fight'];
  // Duties and battles: «auto».
  if (has('auto')) return ['auto'];
  if (has('continue')) return ['continue'];
  // The speech: a few slips, then «Сказать».
  if (has('ui:промолчать')) {
    if (s.slips >= 4 && has('ui:сказать')) {
      s.slips = 0;
      return ['ui:сказать'];
    }
    const slip = o.actions.find((a) => a.id.startsWith('ui:') && !/^ui:(промолчать|убрать|сказать|настройки)/.test(a.id));
    if (slip) {
      s.slips++;
      return [slip.id];
    }
    if (has('ui:сказать')) return ['ui:сказать'];
  }
  // A letter: read it; once in a run, write a reply home.
  if (v.reply && !s.replied && has('ui:написать-ответ')) return ['ui:написать-ответ'];
  const reply = action(/^type:ответ-домой/);
  if (reply && !/сейчас/.test(reply.label)) {
    s.replied = true;
    return [reply.id, 'Живы. Кормят. Пишите чаще.'];
  }
  for (const id of ONWARD) if (has(id)) return [id];
  // The barracks: the variant's place among those offered (the first, the last — the box of letters —, the second).
  const places = o.actions.filter((a) => a.id.startsWith('go:'));
  if (places.length) return [places[v.place(places.length)].id];
  const ui = o.actions.find((a) => a.id.startsWith('ui:') && !NEVER.test(a.id));
  if (ui) return [ui.id];
  return ['wait', '2'];
}

const list = only ? [only] : Object.keys(VARIANTS);
for (const k of list) if (!VARIANTS[k]) throw new Error(`No variant ${k}. Есть: ${Object.keys(VARIANTS).join(', ')}`);
const results = [];
for (const k of list) results.push([k, await play(k, VARIANTS[k])]);
console.log('\nИтог:');
for (const [k, r] of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${k}: ${r.scenes} scenes, ${r.steps} steps, ${r.seconds.toFixed(0)} s${r.error ? ` — ${r.error}` : ''}`);
process.exit(results.every(([, r]) => r.ok) ? 0 : 1);
