/**
 * «Летопись бунта» (concept): straight after the fight, instead of a score table, the mutiny retells itself as
 * ROSTA windows with captions, built from what the player really did. The brawl turns into its own propaganda
 * at once — the philosopher «попал под руку», the people «проявил милость» — and that is again about people,
 * not about the idea. Pure: the frames are drawn from these ids by frames.ts.
 */
import type { WeaponKind } from '../../content/mutiny.ts';
import type { Stats } from './brawl.ts';

export type Frame =
  | { id: 'deaf' }
  | { id: 'weapon'; weapon: WeaponKind | 'sofa' | 'none' }
  | { id: 'tape' }
  | { id: 'sofa' }
  | { id: 'order' }
  | { id: 'nagan' }
  | { id: 'philosopher'; by: NonNullable<Stats['krypotkin']> }
  | { id: 'waverers' }
  | { id: 'heroes' }
  | { id: 'end'; outcome: 'killed' | 'spared' };

/** «НАРОД ВЗЯЛ ТАБУРЕТКУ»: the weapon that did the most. Drafts for the author. */
const TOOK: Record<WeaponKind | 'sofa' | 'none', string> = {
  fists: 'НАРОД СЖАЛ КУЛАК.',
  pen: 'НАРОД ВЗЯЛСЯ ЗА РУЧКУ.',
  stool: 'НАРОД ВЗЯЛ ТАБУРЕТКУ.',
  leg: 'НАРОД РАЗОБРАЛ НАРЫ.',
  poker: 'НАРОД ВЗЯЛ КОЧЕРГУ.',
  shovel: 'НАРОД ВЗЯЛСЯ ЗА ЛОПАТУ.',
  bottle: 'НАРОД РАЗБИЛ БУТЫЛКУ.',
  mug: 'НАРОД ПОДНЯЛ КРУЖКУ.',
  boot: 'НАРОД СНЯЛ САПОГ.',
  nagan: 'НАРОД ВЗЯЛ НАГАН.',
  sofa: 'ДИВАН ПОШЁЛ ВПЕРЁД.',
  none: 'НАРОД ДОШЁЛ ДО КАБИНЕТА.',
};

const TEXT: Record<Exclude<Frame['id'], 'weapon' | 'philosopher' | 'end'>, string> = {
  deaf: 'ГЕНЕРАЛ НЕ СЛЫШАЛ НАРОД.',
  tape: 'МУЗЫКА ЗАГЛУШИЛА ПРИКАЗ.',
  sofa: 'ДИВАН ПОШЁЛ НА ДВА ШАГА ВПЕРЁД.',
  order: '«СМИРНО» БОЛЬШЕ НЕ ДЕЙСТВУЕТ.',
  nagan: 'НАГАН ПЕРЕШЁЛ К НАРОДУ.',
  waverers: 'КОЛЕБЛЮЩИЕСЯ СЕЛИ НА НАРЫ.',
  heroes: 'ГЕРОИ ПАЛИ ЗА ОБЩЕЕ ДЕЛО.',
};

/** What the chronicle shows, 3–5 windows: the deaf general, the weapon, one feat, one loss, the end. */
export function frames(st: Stats, outcome: 'killed' | 'spared'): Frame[] {
  const out: Frame[] = [{ id: 'deaf' }];
  const ranked = (Object.entries(st.byWeapon) as [WeaponKind | 'sofa', number][]).sort((a, c) => c[1] - a[1]);
  const weapon = ranked[0]?.[0] ?? 'none';
  out.push({ id: 'weapon', weapon });
  if (st.tape) out.push({ id: 'tape' });
  else if (st.sofaKills > 0 && weapon !== 'sofa') out.push({ id: 'sofa' });
  else if (st.revolver && weapon !== 'nagan') out.push({ id: 'nagan' });
  else if (st.frozen > 0) out.push({ id: 'order' });
  if (st.krypotkin) out.push({ id: 'philosopher', by: st.krypotkin });
  else if (st.wavered.length > st.rejoined.length) out.push({ id: 'waverers' });
  else if (st.alliesLost.length) out.push({ id: 'heroes' });
  out.push({ id: 'end', outcome });
  return out;
}

export function caption(f: Frame): string {
  switch (f.id) {
    case 'weapon':
      return TOOK[f.weapon];
    case 'philosopher':
      // Whoever did it, the poster has its version.
      return f.by === 'player' || f.by === 'ally' ? 'ФИЛОСОФ ПОПАЛ ПОД РУКУ.' : 'ФИЛОСОФ ПАЛ ОТ РУКИ ПРИСПЕШНИКОВ.';
    case 'end':
      return f.outcome === 'killed' ? 'ТИРАН ПАЛ.' : 'НАРОД ПРОЯВИЛ МИЛОСТЬ.';
    default:
      return TEXT[f.id];
  }
}

/** The captions in order, numbered as on a ROSTA window: «1. ГЕНЕРАЛ НЕ СЛЫШАЛ НАРОД.» */
export function chronicle(st: Stats, outcome: 'killed' | 'spared'): string[] {
  return frames(st, outcome).map((f, i) => `${i + 1}. ${caption(f)}`);
}
