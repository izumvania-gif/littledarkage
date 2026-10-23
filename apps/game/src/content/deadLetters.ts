/**
 * The box of undelivered letters in the barracks (concept §7 «Письма без адресата»): from the start it holds
 * letters that never found anyone — to «незнакомому защитнику», like letter 10 of the run; replies home from
 * soldiers of earlier barracks that never left; letters from home sent back «Адресат выбыл». Other players'
 * replies join them after moderation (net/api.ts). Drafts for the author, in the letters' own voice: adult
 * spelling fixed, the schoolboy's kept. What the creatures are, nobody here knows either.
 */
import { LETTER_ADDRESSEES } from '../net/api.ts';
import { seededRng } from '../core/rng.ts';
import { LETTERS, type LetterHand, type LetterPaper } from './letters.ts';

export interface DeadLetter {
  id: string;
  /** «Кому» on the triangle: one of LETTER_ADDRESSEES. */
  to: string;
  /** Who wrote it, as the sender line has it («от Гали»). */
  from: string;
  hand: LetterHand;
  paper: LetterPaper;
  /** Field post number on the stamp. */
  post: string;
  /** Paragraphs separated by a blank line. */
  text: string;
  /** What the post office stamped on it, if anything: «Адресат выбыл», «Не отправлено»… */
  stamp?: string;
}

const D = (l: DeadLetter): DeadLetter => l;

export const DEAD_LETTERS: readonly DeadLetter[] = [
  D({
    id: 'school',
    to: 'Незнакомому защитнику',
    from: 'от ученика 3-го класса',
    hand: 'child',
    paper: 'squared',
    post: '4802',
    // The schoolboy's spelling is his own.
    text: 'Здраствуй незнакомый защитник!\n\nПишит тебе ученик 3 класса Петя. Нам в школе сказали написать письмо тому кто охраняит коммуну. Я написал. Я хорошо учусь только по чистописанию тройка. Скажи пажалуйста какие они твари? Мишка гаварит что они бумажные а я ни верю. Если ты их видел нарисуй мне на обратной стороне. Я тоже хочу быть защитником но мама ни пускает. Возвращайся. Петя.',
  }),
  D({
    id: 'socks',
    to: 'Незнакомому защитнику',
    from: 'от Анны Тимофеевны',
    hand: 'pen',
    paper: 'lined',
    post: '4805',
    text: 'Сынок, здравствуй. Ты меня не знаешь, и я тебя не знаю, а носки я тебе связала. Две пары, шерсть хорошая, от старой кофты. Если не на твою ногу, отдай тому, кому впору, у вас там, говорят, ноги стынут.\n\nСвоих у меня трое было, все трое там, где ты. Пишут редко. Может, встретишь кого — Зотовы фамилия. Скажи, что мать вяжет. Кушай, что дают, и не лезь вперёд других. Обнимаю тебя, как своего.',
  }),
  D({
    id: 'answer',
    to: 'Незнакомой женщине',
    from: 'от рядового Ветошкина',
    hand: 'pencil',
    paper: 'plain',
    post: '4790',
    stamp: 'Не отправлено',
    text: 'Здравствуйте. Вам ответить некому, так что отвечаю я, хотя письмо ваше пришло не мне.\n\nВы спрашиваете, что мы о них знаем. Я думал, напишу всё как есть, а сел — и написать нечего. Один говорит, они бумажные. Другой — что от них пахнет мылом. Третий — что они тоже кого-то слушают. Я сам их ни разу не видел: я ударник, у меня повязка. Чувствую, только когда наступлю.\n\nВы пишите ещё, пожалуйста, кому-нибудь. Здесь письма читают все, даже чужие.',
  }),
  D({
    id: 'mother',
    to: 'Маме',
    from: 'от сына',
    hand: 'pencil',
    paper: 'lined',
    post: '4777',
    stamp: 'Не отправлено',
    text: 'Мама, здравствуй. У нас всё хорошо. Кормят. Сегодня переносили диван: два шага влево, потом обратно на место, так генерал приказал. Смешно, правда?\n\nГенерал у нас хороший, говорит красиво. Каждый раз одно и то же, только мы уже другие. Ты не волнуйся, если долго не будет писем: почта у нас ходит, когда хочет. Скажи Вере, что я помню про лодку. Твой сын.',
  }),
  D({
    id: 'fiance',
    to: 'Любимому',
    from: 'от Гали',
    hand: 'pen',
    paper: 'lined',
    post: '4846',
    stamp: 'Адресат выбыл',
    text: 'Любимый мой, это уже седьмое письмо, а от тебя ни одного. Я всё равно пишу, потому что, если перестану, мне кажется, ты там пропадёшь.\n\nПлатье я перешила, на свадьбу будет как новое. Твоя мама ходит ко мне по воскресеньям, мы пьём чай и читаем твоё единственное письмо по очереди, оно уже на сгибах протёрлось. Ты только напиши хоть два слова, хоть «жив». Больше ничего не надо. Твоя Галя.',
  }),
  D({
    id: 'friend',
    to: 'Другу',
    from: 'от Кости',
    hand: 'pen',
    paper: 'plain',
    post: '4859',
    stamp: 'Адресат выбыл',
    text: 'Здорово, дружище! Ну ты и пропал. Я узнал, что вашу часть перевели, и пишу на новый номер, вдруг дойдёт.\n\nУ нас в цеху теперь по две смены, говорят — для вас. Так что считай, каждый болт мой — тебе. Рассказывают, будто вы там воюете в темноте, с завязанными глазами. Я сначала смеялся, а теперь не смеюсь. Пиши, кто у тебя командир, как кормят, есть ли с кем поговорить. Жму руку. Костя.',
  }),
  D({
    id: 'censored',
    to: 'Сестре',
    from: 'от брата',
    hand: 'pencil',
    paper: 'squared',
    post: '4768',
    stamp: 'Задержано цензурой',
    text: 'Сестрёнка, привет. Меня поставили голосом. Это значит, я стою у лампы и говорю напарнику, куда шагать, а он идёт с завязанными глазами. Лампа мигает, и в каждую вспышку я их вижу.\n\nОни похожи на ████████████████. Только ████████ и ██████████████. Странно, да? Я никому не говорю, а тебе скажу.\n\nНе бойся за меня, я же не хожу, я только говорю. Береги маму.',
  }),
  D({
    id: 'father',
    to: 'Отцу',
    from: 'от сына Лёвы',
    hand: 'pen',
    paper: 'lined',
    post: '4833',
    stamp: 'Адресат выбыл',
    text: 'Папа, здравствуй. Мама просила написать, что у нас всё хорошо, так я пишу: у нас всё хорошо.\n\nНа самом деле не всё. Мама ночью сидит у окна и считает почтальонов. Я устроился на завод, на твоё место, мастер говорит, руки у меня твои. Говорят, у вас там новый генерал и речи хорошие. Ты нам, пап, речей не пиши. Напиши просто, как ты. Твой Лёва.',
  }),
  D({
    id: 'pocket',
    to: 'Домой',
    from: 'без обратного адреса',
    hand: 'pencil',
    paper: 'plain',
    post: '4751',
    stamp: 'Без адреса',
    text: 'Дорогие мои. Пишу перед тревогой, так что коротко. Если это письмо дошло, а меня нет — не плачьте долго, тут все так.\n\nНас здесь записывают в большую книгу, у каждого своя строка, так что я не потеряюсь. Отцу скажите, что я не трусил. А вообще-то трусил, но шёл. Нюрку поцелуйте. Сирена',
  }),
];

/** «Кому» for each sender of a letter from home: the player's reply goes back to them. */
const REPLY_TO: Readonly<Record<string, (typeof LETTER_ADDRESSEES)[number]>> = {
  мать: 'Маме',
  отец: 'Отцу',
  сестра: 'Сестре',
  'сестра и братья': 'Сестре',
  брат: 'Брату',
  друг: 'Другу',
  'друг юности': 'Другу',
  подруга: 'Подруге',
  любимая: 'Любимой',
  возлюбленная: 'Любимой',
  любимый: 'Любимому',
  'незнакомая женщина': 'Незнакомой женщине',
};

/** Whom the player's reply to letter `n` is addressed to on the box's triangle (always one of LETTER_ADDRESSEES). */
export function replyAddressee(n: number): string {
  const from = LETTERS.find((l) => l.n === n)?.from;
  return (from && REPLY_TO[from]) || 'Домой';
}

/**
 * The order the triangles lie in the crate: the authored ones, with other players' letters slipped in
 * among them at places drawn from `seed` (so a reopened box looks the same during one visit).
 */
export function mixLetters<T>(authored: readonly T[], others: readonly T[], seed: number): T[] {
  const rnd = seededRng(seed);
  const out = [...authored];
  const rest = [...others];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  for (const item of rest) out.splice(Math.floor(rnd() * (out.length + 1)), 0, item);
  return out;
}
