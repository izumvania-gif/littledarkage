/**
 * A thin wrapper over inkjs (as in Eferon). Scenes enter knots directly; the script never keeps state of its
 * own: who trusts whom, flags and the player's name and gender live in TypeScript (core/save.ts) and ink reads
 * and changes them through external functions. So a scene can always be replayed from its start, and a save
 * holds only which scene it was.
 *
 * Line tags:
 * - `#speaker:<id>` — who says it (a soldier id, 'general', 'krypotkin'); no speaker is narration;
 * - `#do:<action>` — something the scene runner does before the line shows (music, light, a walk, a letter…);
 *   a line with only tags still runs its actions.
 */
import { Story } from 'inkjs';

export interface StoryLine {
  text: string;
  speaker: string | null;
  /** Staging for this line, in order: `music:disco`, `walk:krypotkin:desk`, `letter:9`… */
  actions: string[];
}

export interface StoryChoice {
  index: number;
  text: string;
}

/** What the script may ask and change. Bound as external functions of the same names. */
export interface StoryHost {
  name(): string;
  /** The player is рядовая. */
  fem(): boolean;
  trust(id: string): number;
  trust_add(id: string, by: number): void;
  flag(name: string): boolean;
  flag_set(name: string): void;
  hp(): number;
  /** The name a face goes by now (Сырков's face is «Пышкин» after he fell); `player_former` is the player's last name before coming back. */
  who(face: string): string;
  /** 0 рядовой, 1 ефрейтор, 2 младший сержант, 3 сержант. */
  rank_of(face: string): number;
  /** Which chill: 1, 2 or 3. */
  cycle(): number;
}

export class StoryEngine {
  private readonly story: Story;
  /** Script errors since the last knot was entered: the scene ends its dialogue quietly when there are any. */
  errors: string[] = [];

  constructor(json: string, host: StoryHost) {
    this.story = new Story(json);
    this.story.onError = (message: string) => {
      this.errors.push(message);
      console.error(`[ink] ${message}`);
    };
    // Reads are lookahead-safe; writes are not (ink must call them only when it really gets there).
    this.story.BindExternalFunction('name', () => host.name(), true);
    this.story.BindExternalFunction('fem', () => host.fem(), true);
    this.story.BindExternalFunction('trust', (id: string) => host.trust(id), true);
    this.story.BindExternalFunction('flag', (f: string) => host.flag(f), true);
    this.story.BindExternalFunction('hp', () => host.hp(), true);
    this.story.BindExternalFunction('who', (face: string) => host.who(face), true);
    this.story.BindExternalFunction('rank_of', (face: string) => host.rank_of(face), true);
    this.story.BindExternalFunction('cycle', () => host.cycle(), true);
    this.story.BindExternalFunction(
      'trust_add',
      (id: string, by: number) => {
        host.trust_add(id, by);
        return true;
      },
      false,
    );
    this.story.BindExternalFunction(
      'flag_set',
      (f: string) => {
        host.flag_set(f);
        return true;
      },
      false,
    );
  }

  hasKnot(knot: string): boolean {
    return this.story.KnotContainerWithName(knot) !== null;
  }

  enter(knot: string): void {
    this.errors = [];
    this.story.ChoosePathString(knot);
  }

  /** The next line, or null when the story waits for a choice or the knot has ended. */
  next(): StoryLine | null {
    while (this.story.canContinue && !this.errors.length) {
      const raw = (this.story.Continue() ?? '').trim();
      if (this.errors.length) break;
      const line = parseLine(raw, this.story.currentTags ?? []);
      if (line.text || line.actions.length) return line;
    }
    return null;
  }

  choices(): StoryChoice[] {
    if (this.errors.length) return [];
    return this.story.currentChoices.map((c) => ({ index: c.index, text: c.text }));
  }

  choose(index: number): void {
    this.story.ChooseChoiceIndex(index);
  }
}

export function parseLine(text: string, tags: readonly string[]): StoryLine {
  const line: StoryLine = { text, speaker: null, actions: [] };
  for (const tag of tags) {
    const i = tag.indexOf(':');
    const key = (i < 0 ? tag : tag.slice(0, i)).trim();
    const value = i < 0 ? '' : tag.slice(i + 1).trim();
    if (key === 'speaker') line.speaker = value || null;
    else if (key === 'do' && value) line.actions.push(value);
  }
  return line;
}
