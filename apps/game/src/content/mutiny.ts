/**
 * The mutiny brawl (concept «Бунт: драка с генералом»): the three rooms, the weapons of the barracks, every
 * number a playtest may change, and the words. A short cruel fight seen from above, in the style of Hotline
 * Miami: any blow kills, the player too, and a death restarts the room at once. The rules are in
 * stages/mutiny/brawl.ts; nothing there hard-codes a speed or a timing.
 */

export const MUTINY = {
  /** Where «Красные очки» stand during the brawl: the poster is whole and loud. */
  t: 0.2,
  /** …and after the lights go out: the poster comes off all at once. */
  tDark: 0.95,
  /** A rat on the floor, from above. */
  radius: 16,
  playerSpeed: 250,
  npcSpeed: 200,
  generalSpeed: 185,
  krypotkinSpeed: 78,
  /** The player's swing lands almost at once; an NPC raises his arm first, and that is the tell. */
  playerWindup: 0.05,
  npcWindup: 0.26,
  npcWindupJitter: 0.06,
  npcCooldown: 0.7,
  /** How fast a swing carries him forward along its line. */
  lunge: 120,
  /** Half the angle of a swing, radians. */
  arc: 1.05,
  /** A pressed attack waits this long for the cooldown to end. */
  buffer: 0.15,
  /** The general's men: how far and how wide they see, and how far a fight is heard. */
  view: 440,
  cone: 1.2,
  hear: 280,
  react: 0.2,
  /** An ally goes for an enemy this close; farther, he keeps near the player. */
  engage: 360,
  followNear: 80,
  followFar: 120,
  throwSpeed: 780,
  throwRange: 470,
  pickRange: 54,
  useRange: 64,
  /** «Смир-…но!»: the voice reaches this far unless a wall is in the way. */
  shoutRadius: 330,
  shoutWindup: 0.5,
  freeze: 1,
  shoutCooldown: 7,
  /** He never shouts while one of his men is this close to the player (a frozen player would just die). */
  shoutSafe: 150,
  /** Seconds into a room before his first shout or shot. */
  firstShout: 2.5,
  firstShot: 1.8,
  /** The nagan: the aim line shows this long before the shot, which goes along the line. */
  aim: 0.75,
  shotCooldown: 3.2,
  shotRange: 1000,
  ammo: 6,
  /** He backs away from the player this close; in the office he gives up this close. */
  retreatNear: 210,
  finalNear: 150,
  /** The sofa alone barely moves; pushed with an ally it rams, and crushes at this speed. */
  sofaAlone: 45,
  sofaTwo: 270,
  sofaCrush: 150,
  /** A waverer who sat out goes back to whichever side leads by this many. */
  waverLead: 2,
  waverThink: 3,
  /** Крыпоткин says «Ребята, не надо» this often while a fight is near him. */
  krypotkinEvery: 4.5,
  /** «Если не выходит»: deaths in one room before «без спешки», then before the skip to the office. */
  slowAfter: 8,
  skipAfter: 12,
  /** «Без спешки»: the whole fight runs at this speed, and the general's men wind up this much longer. */
  slowScale: 0.65,
  slowWindup: 1.4,
  /** How long the shake and the kill caption last. */
  shake: 0.45,
  killCaption: 0.55,
} as const;

export type WeaponKind = 'fists' | 'pen' | 'stool' | 'leg' | 'poker' | 'shovel' | 'bottle' | 'mug' | 'boot' | 'nagan';

export interface Weapon {
  /** As it is named on the floor and in the controls («табуретка»). */
  name: string;
  /** Reach of a swing beyond the attacker's body, reference pixels. */
  reach: number;
  /** Seconds between the player's swings. */
  cooldown: number;
  /** How hard the frame jolts on a kill with it (0..1). */
  shake: number;
  /** Can be thrown (everything but fists). */
  thrown: boolean;
}

export const WEAPONS: Readonly<Record<WeaponKind, Weapon>> = {
  fists: { name: 'кулаки', reach: 26, cooldown: 0.28, shake: 0.35, thrown: false },
  pen: { name: 'заточенная ручка', reach: 30, cooldown: 0.22, shake: 0.3, thrown: true },
  stool: { name: 'табуретка', reach: 42, cooldown: 0.42, shake: 0.6, thrown: true },
  leg: { name: 'ножка от нар', reach: 48, cooldown: 0.36, shake: 0.5, thrown: true },
  poker: { name: 'кочерга', reach: 54, cooldown: 0.38, shake: 0.5, thrown: true },
  shovel: { name: 'сапёрная лопата', reach: 52, cooldown: 0.44, shake: 0.7, thrown: true },
  bottle: { name: 'разбитая бутылка', reach: 32, cooldown: 0.26, shake: 0.4, thrown: true },
  mug: { name: 'кружка', reach: 26, cooldown: 0.3, shake: 0.35, thrown: true },
  boot: { name: 'сапог', reach: 26, cooldown: 0.3, shake: 0.35, thrown: true },
  nagan: { name: 'наган', reach: 26, cooldown: 0.35, shake: 0.8, thrown: true },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Furniture stops feet; tall furniture (bunks, a safe) also stops eyes, throws and bullets, never a voice. */
export interface Furniture extends Rect {
  kind: 'bunk' | 'table' | 'desk' | 'safe' | 'shelf' | 'tape';
  tall: boolean;
}

/** x, y, facing (radians: 0 is to the right, π/2 down the screen). */
export type Spot = readonly [number, number, number];

export interface RoomDef {
  id: 'bedroom' | 'mess' | 'office';
  name: string;
  /** Walls stop everything: feet, eyes, throws, bullets and the general's voice. */
  walls: readonly Rect[];
  furniture: readonly Furniture[];
  /** A bright decoration on the poster floor (a blanket, a red carpet): no effect on the fight. */
  carpet?: Rect;
  entry: readonly [number, number];
  /** The door on, open once the general's men here are down; none in the office. */
  exit: Rect | null;
  allySpots: readonly (readonly [number, number])[];
  /** Where the general's men stand and what they hold. The bedroom's first stands with his back turned. */
  loyalSpots: readonly (readonly [number, number, number, WeaponKind])[];
  /** Подвальный's place in the office: next to the general. */
  podvalny?: Spot;
  general: readonly [number, number];
  /** The corner the general backs into at the end. */
  corner?: readonly [number, number];
  items: readonly (readonly [WeaponKind, number, number])[];
  /** Седой sits on the bunks and takes no side. */
  sedoy?: Spot;
  krypotkin?: readonly [number, number];
  /** The tape recorder, by the bunks: E turns it on full. */
  tape?: readonly [number, number];
  sofa?: Rect;
  /** Where waverers sit it out. */
  sitSpots: readonly (readonly [number, number])[];
}

/** The picture above the caption band, inside the poster's frame. Each room fits it; the camera never moves. */
export const ROOM = { left: 20, top: 20, right: 1260, bottom: 522, wall: 18 } as const;
/** The doors in the side walls. */
const DOOR = { top: 226, bottom: 314 } as const;

/** The outer walls, with a gap for the door on the right when there is one (the door we came in by is shut). */
function outer(exit: boolean): Rect[] {
  const { left, top, right, bottom, wall } = ROOM;
  const walls: Rect[] = [
    { x: left, y: top, w: right - left, h: wall },
    { x: left, y: bottom - wall, w: right - left, h: wall },
    { x: left, y: top, w: wall, h: bottom - top },
  ];
  if (exit) walls.push({ x: right - wall, y: top, w: wall, h: DOOR.top - top }, { x: right - wall, y: DOOR.bottom, w: wall, h: bottom - DOOR.bottom });
  else walls.push({ x: right - wall, y: top, w: wall, h: bottom - top });
  return walls;
}

const EXIT: Rect = { x: ROOM.right - ROOM.wall, y: DOOR.top, w: ROOM.wall, h: DOOR.bottom - DOOR.top };

const ENTRY_ALLIES = [
  [124, 226],
  [124, 314],
  [60, 180],
  [60, 360],
  [170, 226],
  [170, 314],
] as const;

const bunk = (x: number, y: number): Furniture => ({ x, y, w: 78, h: 156, kind: 'bunk', tall: true });
const table = (x: number, y: number): Furniture => ({ x, y, w: 300, h: 52, kind: 'table', tall: false });

export const ROOMS: readonly RoomDef[] = [
  {
    // Two rows of bunks with a corridor between, a partition across the middle with a gap: behind it the
    // general's voice can't reach. The sofa of the duty stands in the corridor, the tape recorder in the corner.
    id: 'bedroom',
    name: 'Спальня',
    walls: [...outer(true), { x: 616, y: 38, w: 18, h: 160 }, { x: 616, y: 342, w: 18, h: 162 }],
    furniture: [
      bunk(128, 38),
      bunk(288, 38),
      bunk(448, 38),
      bunk(714, 38),
      bunk(874, 38),
      bunk(1034, 38),
      bunk(128, 348),
      bunk(288, 348),
      bunk(448, 348),
      bunk(714, 348),
      bunk(874, 348),
      bunk(1034, 348),
      { x: 48, y: 58, w: 46, h: 36, kind: 'tape', tall: false },
    ],
    entry: [80, 270],
    exit: EXIT,
    allySpots: ENTRY_ALLIES,
    loyalSpots: [
      [520, 270, 0, 'fists'],
      [800, 271, Math.PI, 'stool'],
      [992, 122, Math.PI / 2, 'leg'],
      [1176, 420, Math.PI, 'fists'],
    ],
    general: [1196, 270],
    items: [
      ['stool', 86, 430],
      ['leg', 406, 122],
      ['boot', 246, 150],
    ],
    sedoy: [246, 430, -Math.PI / 2],
    tape: [71, 76],
    sofa: { x: 196, y: 248, w: 120, h: 50 },
    sitSpots: [
      [86, 474],
      [570, 474],
      [570, 70],
      [1176, 70],
    ],
  },
  {
    // Long tables (they stop feet, not eyes), the brick stove in the middle (it stops everything, the voice
    // too): the general shoots down the room from the far door, and the stove is the only cover.
    id: 'mess',
    name: 'Столовая',
    walls: [...outer(true), { x: 596, y: 214, w: 88, h: 112 }],
    furniture: [table(170, 96), table(770, 96), table(170, 392), table(770, 392)],
    entry: [80, 270],
    exit: EXIT,
    allySpots: ENTRY_ALLIES,
    loyalSpots: [
      [430, 300, -Math.PI / 2, 'fists'],
      [880, 270, Math.PI, 'poker'],
      [1040, 196, Math.PI, 'stool'],
      [1040, 346, Math.PI, 'fists'],
      [300, 470, 0, 'leg'],
    ],
    general: [1196, 270],
    items: [
      ['mug', 136, 214],
      ['mug', 520, 186],
      ['mug', 760, 336],
      ['bottle', 900, 470],
      ['poker', 556, 364],
    ],
    krypotkin: [640, 170],
    sitSpots: [
      [70, 70],
      [70, 474],
      [1200, 70],
      [1200, 474],
    ],
  },
  {
    // An anteroom, a doorway, the office with a red carpet, the desk (low: bullets fly over it), a safe and
    // the shelf. The general stands behind the desk with Подвальный at his side.
    id: 'office',
    name: 'Кабинет',
    walls: [...outer(false), { x: 404, y: 38, w: 18, h: 152 }, { x: 404, y: 350, w: 18, h: 154 }],
    furniture: [
      { x: 940, y: 196, w: 84, h: 148, kind: 'desk', tall: false },
      { x: 1182, y: 40, w: 58, h: 58, kind: 'safe', tall: true },
      { x: 560, y: 38, w: 200, h: 36, kind: 'shelf', tall: true },
    ],
    carpet: { x: 500, y: 130, w: 690, h: 280 },
    entry: [80, 270],
    exit: null,
    allySpots: ENTRY_ALLIES,
    loyalSpots: [
      [300, 130, Math.PI / 2, 'fists'],
      [300, 410, -Math.PI / 2, 'stool'],
      [680, 270, Math.PI, 'leg'],
      [820, 452, Math.PI, 'fists'],
    ],
    podvalny: [1092, 384, Math.PI],
    general: [1110, 270],
    corner: [1212, 476],
    items: [
      ['shovel', 110, 92],
      ['boot', 120, 462],
      ['mug', 860, 118],
    ],
    sitSpots: [
      [70, 474],
      [70, 66],
      [380, 474],
    ],
  },
];

/** How many of the general's men each room holds at least; nameless soldiers fill the places nobody named takes. */
export const ROOM_MEN = [4, 5, 4] as const;

/** The general's words: dry formulas, as everywhere. Drafts for the author. */
export const GENERAL_LINES = {
  rooms: ['Приказы не обсуждаются. По местам.', 'Отставить бардак. Кто со мной — ко мне.', 'В кабинет без доклада не входят.'],
  firstShot: 'Предупреждаю один раз.',
  empty: 'Пусто.',
  disarmed: 'Отдай.',
  final: 'Ну? Бей.',
  surrender: 'Встать в строй. Разойдись.',
} as const;

/** What the soldiers shout, as short lines near them (no voices yet). */
export const BARKS = {
  start: ['Не пойдём!', 'Хватит!', 'Не пойдём в туннель!'],
  tape: 'Магнитофон! Врубай!',
  waver: ['Я… я посижу.', 'Не, я пас.', 'Без меня.'],
  rejoin: 'Ладно. Я с вами.',
  turn: 'Я с генералом.',
  loyal: ['Назад!', 'Приказ!', 'Стоять!'],
  podvalny: 'Товарищ генерал, я с вами!',
  krypotkin: ['Ребята, не надо.', 'Ребята… это же свои.', 'Не надо, ребята.'],
} as const;

/** The captions that flash on the frame's edge for a moment at each kill. */
export const KILL_WORDS = ['ДОЛОЙ!', 'ХВАТИТ!', 'НЕ ПОЙДЁМ!', 'ДОЛОЙ!', 'ДОВОЛЬНО!'] as const;
