/**
 * The new general's speech, in pieces (concept «Новый генерал из игроков»): when the player is named general
 * at the third muster, he puts his speech before the last battle together from these, against the clock, the
 * old general prompting. Four kinds: Крыпоткин's words that sounded true at the welcome and sound empty now
 * (and the general's own formulas, after the crossed-out names), plain truth, a short order, silence.
 * What the speech mostly was decides how the rats hold in the last battle (the runner sets `speech_<kind>`).
 *
 * Texts are drafts for the author to check. Silence is written as a stage direction in brackets: the runner
 * shows such a line as narration, not as words. Every piece fits a slip: no longer than 64 characters.
 */

export type SpeechKind = 'truth' | 'hollow' | 'order' | 'silence' | 'mixed';

export interface SpeechFragment {
  id: string;
  text: string;
  kind: Exclude<SpeechKind, 'mixed'>;
}

export const SPEECH_FRAGMENTS: readonly SpeechFragment[] = [
  // Крыпоткин at the welcome (prologue), and his wintering rats (cycle 1): he said it, he didn't believe it.
  { id: 'hollow_families', kind: 'hollow', text: 'С вами в коммуне борются ваши семьи, друзья, любимые!' },
  { id: 'hollow_ideas', kind: 'hollow', text: 'Только благодаря вам все наши идеи будут жить!' },
  { id: 'hollow_nose', kind: 'hollow', text: 'Не вешайте нос, крысы! Это наш час, наше время!' },
  { id: 'hollow_poster', kind: 'hollow', text: 'Сила — в сплочённости!' },
  { id: 'hollow_warm', kind: 'hollow', text: 'Выживает не сильный. Выживает тот, кто греет других.' },
  // The general's speech, after the register: the names in it are crossed out, and nobody went home.
  { id: 'hollow_remember', kind: 'hollow', text: 'Коммуна помнит каждого.' },
  { id: 'hollow_home', kind: 'hollow', text: 'Те, кто вернётся, расскажут о тех, кто не вернулся.' },

  { id: 'truth_below', kind: 'truth', text: 'Что там внизу, я не знаю. Никто не знает.' },
  { id: 'truth_names', kind: 'truth', text: 'Нас было больше. Вы помните их имена. Я тоже.' },
  { id: 'truth_letters', kind: 'truth', text: 'Письма из дома отвечают не нам, а тем, кем мы были.' },
  { id: 'truth_philosopher', kind: 'truth', text: 'Философ в свои слова не верил. Держались за них мы.' },
  { id: 'truth_back', kind: 'truth', text: 'Вернутся не все. Я тоже могу не вернуться.' },

  { id: 'order_voice', kind: 'order', text: 'Слушать координатора. Остальное — потом.' },
  { id: 'order_places', kind: 'order', text: 'По местам.' },
  { id: 'order_nose', kind: 'order', text: 'Ударникам — нюхать. Координаторам — смотреть.' },
  { id: 'order_line', kind: 'order', text: 'Строй держать.' },

  { id: 'silence_look', kind: 'silence', text: '(Молча посмотреть на каждого.)' },
  { id: 'silence_pause', kind: 'silence', text: '(Помолчать.)' },
];
