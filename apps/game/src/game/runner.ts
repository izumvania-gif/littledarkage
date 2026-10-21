/**
 * Plays the game scene by scene (content/scenes.ts) from wherever the save stands, after the opening on the
 * lineup picture: the barracks with the script's lines on the caption plate, the walks between hotspots, the
 * duties, the letters, the battle. The script's state lives in RunState: a scene works on a copy and commits
 * it with the next scene's id when it ends, so a reload replays the scene from its start with the state it
 * started with.
 */
import storyJson from '../../../../story/main.ink';
import { makeBattle, MAX_HP } from '../core/battle.ts';
import { writeSave, type KeyValue, type RunState, type SaveFile } from '../core/save.ts';
import type { Settings } from '../core/settings.ts';
import { BATTLES, type BattleId } from '../content/battles.ts';
import { PLAYER_SPEAKER, speaker } from '../content/cast.ts';
import { nextScene, scene as sceneOf, type Scene, type SceneId } from '../content/scenes.ts';
import { PLAYER_ID } from '../content/soldiers.ts';
import type { AudioEngine } from '../engine/audio.ts';
import { Music } from '../engine/music.ts';
import { BattleSound } from '../engine/spatial.ts';
import { StoryEngine, type StoryHost } from '../engine/story.ts';
import type { Stage } from '../render/stage.ts';
import { BarracksStage } from '../stages/barracks/BarracksStage.ts';
import { runBattle } from '../stages/battle/run.ts';
import type { BattleContext } from '../stages/battle/types.ts';
import { runLeaves } from '../stages/duty/LeavesDuty.ts';
import { runSofa } from '../stages/duty/SofaDuty.ts';
import type { DutyContext } from '../stages/duty/types.ts';
import type { CaptionPlate } from '../ui/caption.ts';
import { h, nextPress, wait } from '../ui/dom.ts';
import { openLetter, showLetter } from '../ui/letter.ts';
import { parseAction, type Action, type TrackName } from './actions.ts';

/** Which track to get ready in the background when a scene starts. */
const PRERENDER: Partial<Record<SceneId, TrackName>> = { amateur: 'disco', meeting: 'concert', c1_duties: 'tape' };

export interface RunnerDeps {
  stage: Stage;
  ui: HTMLElement;
  audio: AudioEngine;
  settings: Settings;
  reduced: boolean;
  plate: CaptionPlate;
  store: KeyValue | null;
  debug: boolean;
}

export class Runner {
  private readonly d: RunnerDeps;
  private readonly save: SaveFile;
  private readonly story: StoryEngine;
  private readonly music: Music;
  private readonly sound: BattleSound;
  private barracks: BarracksStage | null = null;
  /** The scene's working copy of the run; committed when the scene ends. */
  private live: RunState;

  constructor(deps: RunnerDeps, save: SaveFile) {
    this.d = deps;
    this.save = save;
    if (!save.run) throw new Error('no run to play');
    this.live = structuredClone(save.run);
    this.music = new Music(deps.audio);
    this.sound = new BattleSound(deps.audio);
    this.story = new StoryEngine(storyJson, this.host());
  }

  /** Plays from the saved scene to the end of what is built; resolves on the end card's restart. */
  async play(): Promise<void> {
    for (;;) {
      const sc = sceneOf(this.live.scene);
      if (sc.kind === 'end') return this.end();
      await this.playScene(sc);
      this.commit(nextScene(sc.id));
    }
  }

  private host(): StoryHost {
    return {
      name: () => this.live.name,
      fem: () => this.live.gender === 'f',
      trust: (id) => this.live.trust[id] ?? 0,
      trust_add: (id, by) => {
        this.live.trust[id] = Math.max(0, Math.min(3, (this.live.trust[id] ?? 0) + by));
      },
      flag: (f) => this.live.flags.includes(f),
      flag_set: (f) => {
        if (!this.live.flags.includes(f)) this.live.flags.push(f);
      },
      hp: () => this.live.hp,
    };
  }

  private commit(next: SceneId): void {
    this.live.scene = next;
    this.save.run = structuredClone(this.live);
    writeSave(this.d.store, this.save);
  }

  private room(): BarracksStage {
    if (!this.barracks) this.barracks = new BarracksStage(this.d.stage, this.d.ui, this.d.audio, this.d.settings, this.d.reduced);
    this.barracks.setVisible(true);
    return this.barracks;
  }

  private async playScene(sc: Scene): Promise<void> {
    const { plate } = this.d;
    // Tracks are synthesized in the background a scene or two before they play.
    const soon = PRERENDER[sc.id];
    if (soon) void this.music.prerender(soon);
    if (sc.kind === 'battle') return this.battle(sc);
    const room = this.room();
    room.setT(sc.t);
    room.setLight('warm');
    plate.el.hidden = false;
    plate.clear();
    if (sc.cast) this.arrange(room, sc.cast);
    if (sc.chapter) await this.chapter(sc.chapter);
    plate.header(sc.num, sc.title);
    if (sc.music) void this.music.play(sc.music);
    await this.knot(sc.id);
    if (sc.kind === 'roam') {
      const left = [...(sc.hotspots ?? [])];
      for (let i = 0; i < (sc.picks ?? 1) && left.length; i++) {
        plate.clear();
        this.music.duck(false);
        const id = await room.roam(left);
        left.splice(
          left.findIndex((hs) => hs.id === id),
          1,
        );
        await this.knot(`${sc.id}_${id}`);
      }
    }
    if (sc.then === 'duties') await this.duties(sc);
    if (sc.music) await this.music.stop();
  }

  /** Puts the scene's cast in their places (the script moves them from there). */
  private arrange(room: BarracksStage, cast: Readonly<Record<string, string>>): void {
    room.show(this.living(Object.keys(cast)));
    for (const [id, where] of Object.entries(cast)) {
      const [spot = 'center', pose] = where.split(':');
      room.place(id, spot, pose ? { pose: pose as never } : {});
    }
  }

  /** The fallen are not in the barracks any more, whatever a scene's cast says. */
  private living(ids: readonly string[]): string[] {
    return ids.filter((id) => !this.live.flags.includes(`${id}_fell`));
  }

  /** Plays one knot of the script: its staging, its lines, its choices. */
  private async knot(name: string): Promise<void> {
    const { plate } = this.d;
    if (!this.story.hasKnot(name)) return;
    this.story.enter(name);
    for (let guard = 0; guard < 2000; guard++) {
      const line = this.story.next();
      if (line) {
        for (const a of line.actions) {
          const act = parseAction(a);
          if (act) await this.stage(act);
        }
        if (!line.text) continue;
        const who = line.speaker === PLAYER_SPEAKER ? { name: this.live.name, style: 'serif' as const } : line.speaker ? speaker(line.speaker) : null;
        this.barracks?.speaking(line.speaker && line.speaker !== PLAYER_SPEAKER ? line.speaker : null);
        this.music.duck(true);
        await plate.line({ speaker: who?.name ?? null, style: who ? who.style : 'narration', text: line.text });
        continue;
      }
      const choices = this.story.choices();
      if (!choices.length) break;
      this.barracks?.speaking(null);
      const i = await plate.choose(choices.map((c) => c.text));
      this.story.choose(choices[i]!.index);
    }
    this.barracks?.speaking(null);
  }

  /** One `#do:` action from the script. */
  private async stage(a: Action): Promise<void> {
    const room = this.barracks;
    switch (a.kind) {
      case 'show':
        room?.show(this.living(a.ids));
        return;
      case 'place':
        room?.place(a.id, a.at, { ...(a.facing ? { facing: a.facing } : {}), ...(a.pose ? { pose: a.pose as never } : {}) });
        return;
      case 'walk':
        await room?.walk(a.id, a.to);
        return;
      case 'pose':
        room?.pose(a.id, a.pose as never);
        return;
      case 'face':
        room?.face(a.id, a.facing);
        return;
      case 'light':
        room?.setLight(a.light);
        return;
      case 'music':
        // Not awaited: if the track isn't ready yet, the scene goes on and the music joins it.
        void this.music.play(a.track);
        return;
      case 'musicStop':
        await this.music.stop({ click: a.click });
        return;
      case 'sfx':
        if (a.sound === 'stomp') this.d.audio.stomp(9);
        else if (a.sound === 'click') this.d.audio.click();
        else if (a.sound === 'bell') this.d.audio.bell();
        else this.sound.siren();
        return;
      case 'clap':
        await this.applause();
        return;
      case 'letterShow':
        this.music.duck(true);
        await showLetter(this.d.ui, a.n, { reduced: this.d.reduced, reader: a.reader === PLAYER_SPEAKER ? this.live.name : (speaker(a.reader)?.name ?? a.reader) });
        return;
      case 'letterOpen':
      case 'letterReply': {
        this.music.duck(true);
        const res = await openLetter(this.d.ui, a.n, { gender: this.live.gender, name: this.live.name, reduced: this.d.reduced, canReply: true, onFold: () => this.sound.paper() });
        if (a.kind === 'letterOpen') this.host().flag_set(`letter${a.n}_${res.read}`);
        if (res.reply?.trim()) this.live.replies[String(a.n)] = res.reply.trim();
        return;
      }
      case 'pause':
        await wait(a.ms);
        return;
    }
  }

  /** A chapter card over the picture («ЧИЛЛ ПЕРВЫЙ. СЛУХ»), until a press or three seconds. */
  private async chapter(text: string): Promise<void> {
    const card = h('div', { class: 'chapter-card', attrs: { role: 'status' } }, h('p', { text }));
    this.d.ui.append(card);
    await Promise.race([wait(3000), nextPress(['Space', 'Enter', 'NumpadEnter'], card)]);
    card.remove();
  }

  /** «Аплодисменты!»: the player claps with Space; the general wants it louder, twice, whatever the player does. */
  private async applause(): Promise<void> {
    const { plate, ui } = this.d;
    const count = h('span', { text: '0' });
    const card = h('div', { class: 'applause', attrs: { role: 'status' } }, h('p', {}, 'Аплодисменты! ', h('kbd', { text: 'Пробел' }), ' — хлопать'), h('p', {}, 'Хлопков: ', count));
    ui.append(card);
    let claps = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      claps++;
      count.textContent = String(claps);
      this.sound.noise({ dur: 0.05, filter: 'bandpass', freq: 1400 + Math.random() * 900, q: 1.2, gain: 0.5 });
    };
    window.addEventListener('keydown', onKey);
    // The barracks claps too, on and off.
    const crowd = window.setInterval(() => {
      for (let i = 0; i < 4; i++) this.sound.noise({ dur: 0.04, filter: 'bandpass', freq: 1200 + Math.random() * 1500, q: 1, gain: 0.18, at: this.sound.now + Math.random() * 0.25 });
    }, 260);
    try {
      await wait(1800);
      plate.show({ speaker: 'Генерал', style: 'type', text: 'Громче!' });
      await wait(1800);
      plate.show({ speaker: 'Генерал', style: 'type', text: 'Громче!' });
      await wait(1600);
    } finally {
      window.removeEventListener('keydown', onKey);
      window.clearInterval(crowd);
      card.remove();
    }
    if (claps > 0) this.host().flag_set('clapped');
  }

  /** After the general hands the duties out: the sofa, the leaves if the player took them, then a word with the partner. */
  private async duties(sc: Scene): Promise<void> {
    const room = this.room();
    const flags = this.host();
    const ctx: DutyContext = {
      stage: this.d.stage,
      ui: this.d.ui,
      audio: this.d.audio,
      settings: this.d.settings,
      reduced: this.d.reduced,
      t: sc.t,
      say: async (text, opts) => {
        const who = { speaker: opts?.speaker ?? 'Генерал', style: (opts?.speaker ? 'serif' : 'type') as 'serif' | 'type', text };
        if (opts?.timeoutMs !== undefined) {
          this.d.plate.show(who);
          await wait(opts.timeoutMs);
        } else await this.d.plate.line(who);
      },
    };
    room.setVisible(false);
    try {
      const partner = flags.flag('sofa_khvostov') ? 'khvostov' : 'norkin';
      this.d.plate.header('7.', 'ДИВАН');
      const sofa = await runSofa(ctx, partner);
      if (Number(sofa.notes.drops ?? 0) > 0) flags.flag_set('sofa_dropped');
      if (flags.flag('took_leaves')) {
        this.d.plate.header('7.', 'ЛИСТОЧКИ');
        const leaves = await runLeaves(ctx);
        if (leaves.score >= 0.7) flags.flag_set('leaves_good');
      }
    } finally {
      room.setVisible(true);
    }
    this.d.plate.header(sc.num, sc.title);
    await this.knot('c1_after_sofa');
  }

  /** The battle of the scene: saved every turn; afterwards the hits, trust and who fell go into the run. */
  private async battle(sc: Scene): Promise<void> {
    const id = sc.battle;
    if (!id) return;
    const def = BATTLES[id];
    const { plate } = this.d;
    this.barracks?.setVisible(false);
    plate.el.hidden = true;
    const saved = this.live.battle?.id === id ? this.live.battle : null;
    const fresh = () => {
      const b = makeBattle({ ...def.setup, seed: Math.floor(Math.random() * 1e9) });
      // The player's one pool of hits goes into the battle, in whichever seat.
      const me = b.coords.find((c) => c.id === PLAYER_ID) ?? b.units.find((u) => u.id === PLAYER_ID);
      if (me) me.hp = this.live.hp;
      return b;
    };
    const ctx: BattleContext = {
      stage: this.d.stage,
      ui: this.d.ui,
      audio: this.d.audio,
      settings: this.d.settings,
      reduced: this.d.reduced,
      def,
      battle: saved?.state ?? fresh(),
      memory: saved?.memory ?? { trust: this.live.trust[def.partner] ?? 1, partnerScared: false, playerScared: false, stats: {} },
      commit: () => {
        this.live.battle = { id, state: ctx.battle, memory: ctx.memory };
        if (this.save.run) this.save.run.battle = this.live.battle;
        writeSave(this.d.store, this.save);
      },
      debug: this.d.debug,
    };
    await runBattle(ctx);
    const b = ctx.battle;
    const me = b.coords.find((c) => c.id === PLAYER_ID);
    const meOnField = b.units.find((u) => u.id === PLAYER_ID);
    this.live.hp = Math.max(0, Math.min(MAX_HP, meOnField ? meOnField.hp : (me?.hp ?? this.live.hp)));
    this.live.trust[def.partner] = ctx.memory.trust;
    this.live.battle = null;
    const flags = this.host();
    for (const u of b.units) if (!u.alive) flags.flag_set(`${u.id}_fell`);
    if (me && !me.alive) flags.flag_set('player_fell');
    this.barracks?.setVisible(true);
    plate.el.hidden = false;
  }

  /** The end of what is built: what comes next, and «Начать с построения». */
  private async end(): Promise<void> {
    const room = this.room();
    room.setLight('warm');
    const { plate } = this.d;
    plate.el.hidden = false;
    plate.clear();
    plate.header('', 'ПРОДОЛЖЕНИЕ СЛЕДУЕТ');
    const rank = this.live.gender === 'f' ? 'Рядовая' : 'Рядовой';
    const fell = this.live.flags.includes('player_fell');
    await plate.end(
      fell
        ? `${rank} ${this.live.name} выбыл${this.live.gender === 'f' ? 'а' : ''} в первом бою. Во втором цикле погибшие возвращаются новичками под новым именем — это следующая веха.`
        : `Первый цикл окончен. Дальше — второй: «Выбыл рядовой Сырков. Прибыл рядовой Пышкин». Это следующая веха.`,
      `${rank} ${this.live.name} уйдёт в книгу учёта зачёркнутым, и взять это имя снова будет нельзя.`,
      rangeLinks(),
    );
  }
}

/** Links to the battles on their own, until the story reaches them. */
function rangeLinks(): HTMLElement {
  const ids: BattleId[] = ['b1', 'b2', 'b3'];
  const links = ids.map((id) => h('a', { text: BATTLES[id].title, attrs: { href: `?battle=${id}` } }));
  return h('p', { class: 'range-links' }, 'Бои отдельно, на полигоне: ', ...links.flatMap((a, i) => (i ? [' · ', a] : [a])), '.');
}
