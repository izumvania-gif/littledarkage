/**
 * The register (книга учёта) at the end of a run (concept «Финал и второе прохождение»): what the player did is
 * written next to their names — whom they covered, whether they went on the recon, took a creature alive, raised
 * the mutiny, what speech they gave as general; Крыпоткин «пал смертью храбрых» if he crushed his creature, else
 * just «выбыл». The general writes it, so the notes are his: short, in the book's words.
 */
import type { RegisterRecord, RunState } from './save.ts';
import { FACE_NAMES, FACES, PLAYER_FACE } from './service.ts';

const IN_BATTLE = ['', 'в первом бою', 'во втором бою', 'в третьем бою'] as const;

/** «пал»/«пала», «ходил»/«ходила»: the past tense of a verb stem for the soldier's gender. */
const past = (stem: string, fem: boolean, refl = false): string => (fem ? `${stem}а${refl ? 'сь' : ''}` : `${stem}${refl ? 'ся' : ''}`);

/** The lines this run adds: the player under every name, then Крыпоткин. */
export function runRecords(run: RunState): RegisterRecord[] {
  const has = (f: string) => run.flags.includes(f);
  const fem = run.gender === 'f';
  const out: RegisterRecord[] = [];
  const names = [...run.formerNames, run.name];
  names.forEach((name, i) => {
    const last = i === names.length - 1;
    const notes: string[] = [];
    if (!last) {
      const cycle = [1, 2].filter((c) => has(`player_fell_c${c}`))[i] ?? i + 1;
      notes.push(`${past('выбыл', fem)} ${IN_BATTLE[cycle]}`);
      notes.push(`${past('вернул', fem, true)} под именем ${names[i + 1]}`);
    } else {
      if (has('mutiny_fought')) notes.push(`${past('пал', fem)} в темноте казармы`);
      else notes.push(`${past('пал', fem)} в третьем бою`);
      if (has('recon')) notes.push(`${past('ходил', fem)} в разведку`);
      if (has('caught_creature')) notes.push(`${past('взял', fem)} тварь живой`);
      for (const face of ['norkin', ...FACES]) {
        if (has(`covered_${face}`)) {
          notes.push(`${past('прикрыл', fem)} товарища`);
          break;
        }
      }
      if (run.general === PLAYER_FACE) notes.push(speechNote(run, fem));
      if (has('mutiny')) notes.push(`${past('поднял', fem)} бунт`);
      if (has('mutiny_surrendered')) notes.push(`${past('встал', fem)} в строй`);
      if (has('mutiny_killed')) notes.push(`${past('убил', fem)} генерала`);
      if (has('mutiny_spared')) notes.push(`${past('пощадил', fem)} генерала`);
      if (has('krypotkin_killed_by_player')) notes.push(`${past('убил', fem)} товарища Крыпоткина`);
    }
    out.push({ name, note: notes.join('; ') });
  });
  out.push({ name: 'Крыпоткин', note: krypotkinNote(run) });
  return out;
}

function speechNote(run: RunState, fem: boolean): string {
  const has = (f: string) => run.flags.includes(f);
  if (has('speech_truth')) return `генералом ${past('сказал', fem)} правду`;
  if (has('speech_hollow')) return `генералом ${past('повторил', fem)} слова товарища Крыпоткина`;
  if (has('speech_order')) return `генералом ${past('отдал', fem)} приказ`;
  if (has('speech_silence')) return `генералом ${past('промолчал', fem)}`;
  return `${past('был', fem)} генералом`;
}

function krypotkinNote(run: RunState): string {
  const has = (f: string) => run.flags.includes(f);
  if (has('krypotkin_fell_mutiny')) return has('krypotkin_killed_by_player') ? 'убит в бунте' : 'погиб в бунте';
  return has('krypotkin_killed_one') ? 'пал смертью храбрых' : 'выбыл';
}

/** The recruits at the finale's wall: the faces of the dead under the names they come back with. */
export function recruitsAtTheWall(run: RunState, faces: readonly string[]): string[] {
  return faces.map((face) => {
    const list = FACE_NAMES[face] ?? [face];
    return list[Math.min(list.length - 1, (run.roster[face]?.life ?? 0) + 1)]!;
  });
}
