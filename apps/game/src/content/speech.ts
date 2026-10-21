/**
 * The general's speech: typed out at the lineup in the prologue and, word for word, in the final.
 * It must stay identical to the draft in docs/concept.md («Речь генерала»); a test checks that.
 */
export const SPEECH: readonly string[] = [
  'Смирно! Вольно.',
  'Новобранцы. С этой минуты вы — крысиная гвардия коммуны. Кем вы были дома, чему учились, кто вас ждёт — здесь это никому не интересно. Здесь смотрят на выслугу.',
  'Под нами туннели. В туннелях темно, и светлее там не станет. Глазам там не верьте. Верьте носу и голосу у себя за спиной. Посмотрите на того, кто стоит справа от вас. Запомните его голос: лица в туннеле вы не увидите.',
  'Враг лезет снизу. Что это такое, вам знать не нужно. Вам нужно знать, куда наступать.',
  'Приказы здесь не обсуждаются. Наряды выполняются. Письма раздаются, когда приходят.',
  'Вы не первые, кто стоит в этой шеренге, и не последние. Коммуна помнит каждого. Каждое ваше имя будет записано вот в эту книгу. Те, кто вернётся домой, расскажут о тех, кто не вернулся.',
  'Сейчас каждый громко и чётко назовёт своё имя. Потом подойдёте ко мне и запишетесь.',
  'Сегодня к нам прибывает товарищ Крыпоткин. Встретим как положено.',
];

/** The paragraph that snaps the line to attention: the rats stomp and straighten on it. */
export const ATTENTION_PARAGRAPH = 0;

/** Typing pace: characters per second, and the pause after punctuation and between paragraphs (ms). */
export const TYPE_CPS = 32;
export const PAUSE_AFTER: Record<string, number> = { '.': 320, '!': 380, '?': 380, ',': 120, ':': 180, '—': 140 };
export const PARAGRAPH_PAUSE = 1100;
