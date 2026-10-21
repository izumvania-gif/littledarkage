/**
 * The firing range («полигон»): any battle on its own, outside the story, from `?battle=training|b1|b2|b3`
 * (with optional `&seed=` and `&trust=`). For playtests and for building the stages; the story reaches the
 * battles through main.ts.
 */
import { makeBattle } from '../../core/battle.ts';
import type { Settings } from '../../core/settings.ts';
import { BATTLES, type BattleId } from '../../content/battles.ts';
import type { AudioEngine } from '../../engine/audio.ts';
import type { Stage } from '../../render/stage.ts';
import { h } from '../../ui/dom.ts';
import { runBattle } from './run.ts';
import type { BattleContext } from './types.ts';

export function isBattleId(v: string | null): v is BattleId {
  return v !== null && Object.hasOwn(BATTLES, v);
}

const EXIT_TEXT = {
  over: 'Бой окончен.',
  partnerFell: 'Напарник погиб.',
  playerFell: 'Тебя больше нет на поле.',
} as const;

export async function battleRange(stage: Stage, ui: HTMLElement, audio: AudioEngine, settings: Settings, reduced: boolean, id: BattleId, params: URLSearchParams): Promise<void> {
  const def = BATTLES[id];
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
  const ctx: BattleContext = {
    stage,
    ui,
    audio,
    settings,
    reduced,
    def,
    battle: makeBattle({ ...def.setup, seed }),
    memory: { trust: Math.max(0, Math.min(3, Number(params.get('trust') ?? 1))), partnerScared: false, playerScared: false, stats: {} },
    commit: () => undefined,
    debug: params.has('debug'),
  };
  const exit = await runBattle(ctx);
  const stats = Object.entries(ctx.memory.stats)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const again = h('a', { class: 'primary', text: 'Ещё раз', attrs: { href: `?battle=${id}` } });
  const others = (Object.keys(BATTLES) as BattleId[]).map((other) => h('a', { text: BATTLES[other].title, attrs: { href: `?battle=${other}` } }));
  ui.append(
    h(
      'section',
      { class: 'intro', attrs: { 'aria-label': def.title } },
      h(
        'div',
        { class: 'intro-col' },
        h('h1', { text: def.title }),
        h('p', { class: 'lead', text: `${EXIT_TEXT[exit]} Ходов: ${ctx.battle.turn}.` }),
        stats ? h('p', { class: 'note', text: stats }) : null,
        h('p', { class: 'note', text: `Зерно поля: ${seed}.` }),
        again,
        h('p', { class: 'range-links' }, 'Полигон: ', ...others.flatMap((a, i) => (i ? [' · ', a] : [a]))),
      ),
    ),
  );
  again.focus();
}
