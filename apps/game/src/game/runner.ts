/**
 * Plays the game scene by scene (content/scenes.ts) from wherever the save stands, after the opening on the
 * lineup picture: the barracks with the script's lines on the caption plate, the walks between hotspots, the
 * duties, the letters, the battle. The script's state lives in RunState: a scene works on a copy and commits
 * it with the next scene's id when it ends, so a reload replays the scene from its start with the state it
 * started with.
 */
import storyJson from '../../../../story/main.ink';
import { makeBattle, MAX_HP, report } from '../core/battle.ts';
import { recruitsAtTheWall, runRecords } from '../core/register.ts';
import { retireRun, writeSave, type KeyValue, type RunState, type SaveFile } from '../core/save.ts';
import { faceOf, FACES, instrumental, isFem, muster, PLAYER_FACE, rankWord, senior } from '../core/service.ts';
import type { Settings } from '../core/settings.ts';
import { BATTLES } from '../content/battles.ts';
import { PLAYER_SPEAKER, speaker } from '../content/cast.ts';
import { nextScene, scene as sceneOf, type Scene, type SceneId } from '../content/scenes.ts';
import { PLAYER_ID } from '../content/soldiers.ts';
import type { AudioEngine } from '../engine/audio.ts';
import { Music } from '../engine/music.ts';
import { TRACKS, type TrackId } from '../content/tracks.ts';
import { BattleSound } from '../engine/spatial.ts';
import { StoryEngine, type StoryHost } from '../engine/story.ts';
import type { Stage } from '../render/stage.ts';
import { BarracksStage } from '../stages/barracks/BarracksStage.ts';
import { runFinale, type Ending } from '../stages/finale/FinaleStage.ts';
import { runMutiny } from '../stages/mutiny/MutinyStage.ts';
import { runBattle } from '../stages/battle/run.ts';
import type { BattleContext } from '../stages/battle/types.ts';
import { runLeaves } from '../stages/duty/LeavesDuty.ts';
import { runPen } from '../stages/duty/PenDuty.ts';
import { runSpeechAssembly } from '../stages/speech/SpeechAssembly.ts';
import { SPEECH_FRAGMENTS } from '../content/speechFragments.ts';
import { runSofa } from '../stages/duty/SofaDuty.ts';
import type { DutyContext } from '../stages/duty/types.ts';
import type { CaptionPlate } from '../ui/caption.ts';
import { h, nextPress, wait } from '../ui/dom.ts';
import { openLetter, showLetter } from '../ui/letter.ts';
import { parseAction, type Action, type TrackName } from './actions.ts';

/** Tracks the music engine has (the script may name ones still being written). */
function playable(t: TrackName): t is TrackName & TrackId {
  return Object.hasOwn(TRACKS, t);
}

/** Which track to get ready in the background when a scene starts. */
const PRERENDER: Partial<Record<SceneId, TrackName>> = { amateur: 'disco', meeting: 'concert', c1_duties: 'tape', c2_muster: 'concert2', c3_muster: 'concert3', c3_confession: 'riot' };

const cap = (s: string): string => s.charAt(0).toLocaleUpperCase('ru') + s.slice(1);

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

  /** Plays from the saved scene to the finale; resolves when the run is over and written into the register. */
  async play(): Promise<void> {
    for (;;) {
      const sc = sceneOf(this.live.scene);
      if (sc.kind === 'finale') return this.finale();
      await this.playScene(sc);
      this.commit(nextScene(sc.id, this.live.flags));
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
      // `replay`: this is not the first soldier in the register (Седой: «Я тебя где-то видел»).
      flag: (f) => this.live.flags.includes(f) || (f === 'replay' && this.save.memory.names.length > 0),
      flag_set: (f) => {
        if (!this.live.flags.includes(f)) this.live.flags.push(f);
      },
      hp: () => this.live.hp,
      who: (face) => this.who(face),
      rank_of: (face) => this.live.roster[face]?.rank ?? 0,
      cycle: () => this.cycle(),
    };
  }

  /** The name a face goes by now; the player's own; a guest's (Крыпоткин, the general) as cast. */
  private who(face: string): string {
    if (face === PLAYER_FACE) return this.live.name;
    // The name the player went by before the last return (letters still come to it).
    if (face === 'player_former') return this.live.formerNames.at(-1) ?? this.live.name;
    return this.live.roster[face]?.name ?? speaker(face)?.name ?? face;
  }

  private cycle(): number {
    const sc = this.live.scene;
    return sc.startsWith('c3') || sc === 'finale' ? 3 : sc.startsWith('c2') ? 2 : 1;
  }

  /** «Посидеть с {ins:syrkov}» → «Посидеть с Пышкиным». */
  private label(text: string): string {
    return text.replace(/\{(ins|nom):(\w+)\}/g, (_, form: string, face: string) => (form === 'nom' ? this.who(face) : instrumental(this.who(face), isFem(face, this.live.gender === 'f'))));
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
    if (soon && playable(soon)) void this.music.prerender(soon);
    if (sc.kind === 'battle') return this.battle(sc);
    if (sc.kind === 'mutiny') return this.mutiny(sc);
    const room = this.room();
    room.setT(sc.t);
    room.setLight('warm');
    plate.el.hidden = false;
    plate.clear();
    if (sc.cast) this.arrange(room, sc.cast);
    if (sc.chapter) await this.chapter(sc.chapter);
    plate.header(sc.num, sc.title);
    if (sc.kind === 'muster') await this.muster();
    if (sc.music && playable(sc.music)) void this.music.play(sc.music);
    await this.knot(sc.id);
    if (sc.kind === 'roam') {
      const left = (sc.hotspots ?? []).map((hs) => ({ ...hs, label: this.label(hs.label) }));
      for (let i = 0; i < (sc.picks ?? 1) && left.length; i++) {
        plate.clear();
        this.music.duck(false);
        const id = await room.roam(left);
        left.splice(
          left.findIndex((hs) => hs.id === id),
          1,
        );
        const hurt = this.live.flags.includes('recon_hurt');
        await this.knot(`${sc.id}_${id}`);
        // Something in the far tunnel touched the player: one hit off the pool, never the last.
        if (!hurt && this.live.flags.includes('recon_hurt')) this.live.hp = Math.max(1, this.live.hp - 1);
      }
    }
    if (sc.then === 'duties') await this.duties(sc);
    if (sc.then === 'duties2') await this.duties2(sc);
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

  /**
   * The fallen of this cycle's battle are not in the barracks any more, whatever a scene's cast says; at the next
   * muster their faces come back under new names.
   */
  private living(ids: readonly string[]): string[] {
    const c = this.cycle();
    const gone = (id: string) => this.live.flags.includes(`${id}_fell_c${c}`) || (id === 'krypotkin' && this.live.flags.includes('krypotkin_fell_mutiny'));
    return ids.filter((id) => !gone(id));
  }

  /**
   * «Выбыли — прибыли» (concept «Казарма», 1): the general reads who fell and who came with the same face, the
   * player names themself again if it was them, then the ranks; at the third muster he also names the new
   * general (the script announces it). Newcomers trust nobody yet, and nobody knows a returned player.
   */
  private async muster(): Promise<void> {
    const { plate } = this.d;
    const run = this.live;
    const cycle = this.cycle();
    const says = (text: string) => plate.line({ speaker: 'Генерал', style: 'type', text });
    const fell = (face: string) => run.flags.includes(`${face}_fell_c${cycle - 1}`);
    const fallen = FACES.filter(fell);
    let newName: string | undefined;
    if (fell(PLAYER_FACE)) {
      const fem = run.gender === 'f';
      await says(`Выбыл${fem ? 'а' : ''} ${rankWord(run.roster[PLAYER_FACE]?.rank ?? 0, fem)} ${run.name}.`);
      await says('Прибыло пополнение. Имя!');
      const taken = [...this.save.memory.names, ...run.formerNames, run.name, ...Object.values(run.roster).map((s) => s.name)];
      const given = await plate.askName(taken, run.gender);
      await plate.callout(given.name);
      run.formerNames.push(run.name);
      run.name = newName = given.name;
      run.gender = given.gender;
      run.hp = MAX_HP;
      run.trust = { norkin: 1 };
      fallen.push(PLAYER_FACE);
      this.host().flag_set('player_returned');
    }
    const m = muster(run.roster, cycle, fallen, run.seed, newName);
    const fem = (face: string) => isFem(face, run.gender === 'f');
    for (const e of m.events) {
      if (e.arrived && e.face !== PLAYER_FACE) {
        const a = fem(e.face) ? 'а' : '';
        await says(`Выбыл${a} ${rankWord(0, fem(e.face))} ${e.left}. Прибыл${a} ${rankWord(0, fem(e.face))} ${e.arrived}.`);
        run.trust[e.face] = 0;
        this.host().flag_set(`returned_${e.face}`);
      } else if (e.refused) {
        await says(`${cap(rankWord(0, false))} ${this.who(e.face)} — ефрейтор.`);
        await plate.line({ speaker: this.who(e.face), style: speaker(e.face)?.style ?? 'serif', text: 'Мне и так хорошо.' });
        await says(`…${cap(rankWord(0, false))} ${this.who(e.face)}.`);
        this.host().flag_set(`${e.face}_refused_c${cycle}`);
      } else if (e.rank) {
        await says(`${cap(rankWord(e.rank, fem(e.face)))} ${this.who(e.face)}.`);
      }
    }
    if (m.general) {
      run.general = m.general;
      this.host().flag_set(`general_${m.general}`);
    }
    const head = this.seniorHere();
    if (head) this.host().flag_set(`senior_${head}_c${cycle}`);
  }

  /** The pen on the general's stopwatch (blind in cycle 2), with the room already hidden. */
  private async pen(t: number, blind: boolean): Promise<void> {
    const res = await runPen(this.dutyCtx(t), { blind });
    if (res.score >= 0.7) this.host().flag_set(`pen_good_c${this.cycle()}`);
  }

  /**
   * The player, named general, puts the speech together from slips (stages/speech), the old general prompting;
   * then says it on the caption plate. Its kind becomes `speech_<kind>` for the script and the register.
   */
  private async assemble(): Promise<void> {
    const room = this.room();
    const sc = sceneOf(this.live.scene);
    room.setVisible(false);
    let res: Awaited<ReturnType<typeof runSpeechAssembly>>;
    try {
      res = await runSpeechAssembly(this.dutyCtx(sc.t), { fragments: SPEECH_FRAGMENTS });
    } finally {
      room.setVisible(true);
      this.d.plate.header(sc.num, sc.title);
    }
    this.host().flag_set(`speech_${res.kind}`);
    for (const text of res.lines) {
      // «(Помолчать.)» is a stage direction, not words.
      if (/^\(.*\)$/.test(text)) await this.d.plate.line({ speaker: null, style: 'narration', text: text.slice(1, -1) });
      else await this.d.plate.line({ speaker: this.live.name, style: 'serif', text });
    }
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
        const cast = line.speaker && line.speaker !== PLAYER_SPEAKER ? speaker(line.speaker) : null;
        const who = line.speaker === PLAYER_SPEAKER ? { name: this.live.name, style: 'serif' as const } : cast && line.speaker ? { name: this.who(line.speaker), style: cast.style } : null;
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
        if (playable(a.track)) void this.music.play(a.track);
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
        await showLetter(this.d.ui, a.n, { reduced: this.d.reduced, reader: this.who(a.reader) });
        return;
      case 'letterOpen':
      case 'letterReply': {
        this.music.duck(true);
        const res = await openLetter(this.d.ui, a.n, { gender: this.live.gender, name: this.live.name, reduced: this.d.reduced, canReply: true, onFold: () => this.sound.paper() });
        if (a.kind === 'letterOpen') this.host().flag_set(`letter${a.n}_${res.read}`);
        if (res.reply?.trim()) {
          this.live.replies[String(a.n)] = res.reply.trim();
          this.host().flag_set(`replied_${a.n}`);
        }
        return;
      }
      case 'pause':
        await wait(a.ms);
        return;
      case 'cap':
        room?.cap(a.id);
        return;
      case 'box':
        room?.setBox(a.on);
        return;
      case 'duty':
        await this.dutyHere(a.duty, a.partner);
        return;
      case 'assemble':
        await this.assemble();
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

  /** What a duty needs from the game; the general speaks through the caption plate. */
  private dutyCtx(t: number): DutyContext {
    return {
      stage: this.d.stage,
      ui: this.d.ui,
      audio: this.d.audio,
      settings: this.d.settings,
      reduced: this.d.reduced,
      t,
      say: async (text, opts) => {
        const who = { speaker: opts?.speaker ?? 'Генерал', style: (opts?.speaker ? 'serif' : 'type') as 'serif' | 'type', text };
        if (opts?.timeoutMs !== undefined) {
          this.d.plate.show(who);
          await wait(opts.timeoutMs);
        } else await this.d.plate.line(who);
      },
    };
  }

  /** After the general hands the duties out: the sofa, the leaves if the player took them, then a word with the partner. */
  private async duties(sc: Scene): Promise<void> {
    const room = this.room();
    const flags = this.host();
    const ctx = this.dutyCtx(sc.t);
    room.setVisible(false);
    try {
      const partner = flags.flag('sofa_khvostov') ? 'khvostov' : 'norkin';
      this.d.plate.header('7.', 'ДИВАН');
      const sofa = await runSofa(ctx, partner, this.who(partner));
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

  /**
   * Cycle 2's duties under ranks: the senior hands them out in the script («Есть!»), the general still commands
   * the sofa, carried with the newcomer (or whoever the script named with `sofa2_<face>`), then the pen, blind.
   */
  private async duties2(sc: Scene): Promise<void> {
    const room = this.room();
    const partner = FACES.find((f) => this.live.flags.includes(`sofa2_${f}`)) ?? 'syrkov';
    room.setVisible(false);
    try {
      // A ranked player may have given the sofa to others.
      if (!this.live.flags.includes('sofa2_none')) {
        this.d.plate.header(sc.num, 'ДИВАН');
        const sofa = await runSofa(this.dutyCtx(sc.t), partner, this.who(partner));
        if (Number(sofa.notes.drops ?? 0) > 0) this.host().flag_set('sofa2_dropped');
      }
      this.d.plate.header(sc.num, 'РУЧКА');
      await this.pen(sc.t, true);
    } finally {
      room.setVisible(true);
    }
    this.d.plate.header(sc.num, sc.title);
  }

  /** A duty the script calls in the middle of a scene (`#do:duty:sofa:khvostov`). */
  private async dutyHere(duty: 'sofa' | 'leaves' | 'pen', partner?: string): Promise<void> {
    const room = this.room();
    const t = sceneOf(this.live.scene).t;
    room.setVisible(false);
    try {
      if (duty === 'sofa') {
        const who = partner ?? 'norkin';
        await runSofa(this.dutyCtx(t), who, this.who(who));
      } else if (duty === 'leaves') await runLeaves(this.dutyCtx(t));
      else await this.pen(t, this.cycle() === 2);
    } finally {
      room.setVisible(true);
    }
  }

  /** Who stands where in the barracks now: the senior among those present gives orders. */
  private seniorHere(): string | null {
    return senior(this.live.roster, this.living(FACES));
  }

  /**
   * The brawl with the general (stages/mutiny). The barracks splits by trust: who trusts the player stands with
   * them, who half-trusts wavers, the rest stand with the general — Подвальный always, and the new general if
   * it's one of them; Седой stays on his bunk. The tape recorder plays the band's riot, loud, round and round.
   */
  private async mutiny(sc: Scene): Promise<void> {
    const run = this.live;
    const general = run.general && run.general !== PLAYER_FACE ? run.general : null;
    const allies: string[] = [];
    const waverers: string[] = [];
    const loyal: string[] = [];
    for (const face of this.living(FACES)) {
      const t = run.trust[face] ?? 0;
      if (face === general || face === 'podvalny' || face === 'sedoy') loyal.push(face);
      else if (t >= 2 || (face === 'norkin' && t >= 1)) allies.push(face);
      else if (t === 1) waverers.push(face);
      else loyal.push(face);
    }
    const names: Record<string, string> = { general: 'Генерал', krypotkin: this.who('krypotkin') };
    for (const face of FACES) names[face] = this.who(face);
    this.barracks?.setVisible(false);
    this.d.plate.el.hidden = false;
    this.d.plate.clear();
    this.d.plate.header(sc.num, sc.title);
    let res: Awaited<ReturnType<typeof runMutiny>>;
    try {
      res = await runMutiny({
        stage: this.d.stage,
        ui: this.d.ui,
        audio: this.d.audio,
        settings: this.d.settings,
        reduced: this.d.reduced,
        allies,
        waverers,
        loyal,
        krypotkin: !this.live.flags.includes('krypotkin_fell_mutiny'),
        names,
        player: { name: run.name, fem: run.gender === 'f' },
        say: this.dutyCtx(sc.t).say,
        tape: (on) => {
          if (!on) void this.music.stop({ click: true });
          else if (playable('riot')) {
            this.music.duck(false);
            void this.music.play('riot', { loop: true });
          }
        },
      });
    } finally {
      await this.music.stop();
      this.barracks?.setVisible(true);
    }
    const flags = this.host();
    flags.flag_set(`mutiny_${res.outcome}`);
    if (res.outcome !== 'surrendered') flags.flag_set('mutiny_fought');
    if (res.krypotkinKilledBy) {
      flags.flag_set('krypotkin_fell_mutiny');
      flags.flag_set(`krypotkin_killed_by_${res.krypotkinKilledBy}`);
    }
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
    // Крыпоткин who fell in the brawl doesn't go into the tunnel (the mutiny put down, battle 3 after all).
    const setup = this.live.flags.includes('krypotkin_fell_mutiny') ? { ...def.setup, pairs: def.setup.pairs.filter((p) => p.striker !== 'krypotkin') } : def.setup;
    const fresh = () => {
      const b = makeBattle({ ...setup, seed: Math.floor(Math.random() * 1e9) });
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
      // Who goes by which name now: the soldiers of a face that fell are someone else (b2's Пышкин is Сырков's face).
      names: Object.fromEntries(setup.pairs.flatMap((p) => [p.striker, p.coord ?? '']).filter((id) => id && id !== PLAYER_ID).map((id) => [id, this.who(faceOf(id))])),
    };
    await runBattle(ctx);
    const b = ctx.battle;
    const me = b.coords.find((c) => c.id === PLAYER_ID);
    const meOnField = b.units.find((u) => u.id === PLAYER_ID);
    this.live.hp = Math.max(0, Math.min(MAX_HP, meOnField ? meOnField.hp : (me?.hp ?? this.live.hp)));
    this.live.trust[def.partner] = ctx.memory.trust;
    this.live.battle = null;
    const flags = this.host();
    const cycle = this.cycle();
    const fell = (id: string) => {
      const face = id === PLAYER_ID ? PLAYER_FACE : faceOf(id);
      flags.flag_set(`${face}_fell_c${cycle}`);
      // The first cycle's scenes were written with the plain flag.
      if (cycle === 1) flags.flag_set(`${face}_fell`);
    };
    for (const u of b.units) if (!u.alive) fell(u.id);
    for (const c of b.coords) if (!c.alive && c.id !== PLAYER_ID) fell(c.id);
    if ((me && !me.alive) || (meOnField && !meOnField.alive)) fell(PLAYER_ID);
    // For the register and the script: the player took a blow for the partner; the sack held a creature.
    if ((ctx.memory.stats.accepted ?? 0) > 0) flags.flag_set(`covered_${def.partner}`);
    const r = report(b);
    if (r.caught || (ctx.memory.stats.caught ?? 0) > 0) flags.flag_set('caught_creature');
    if (r.kills.krypotkin) flags.flag_set('krypotkin_killed_one');
    this.barracks?.setVisible(true);
    plate.el.hidden = false;
  }

  /**
   * The finale (stages/finale): the ending the mutiny chose, the replies home in the dark, the register, the wall.
   * Then the run is over: its soldier goes into the register under every name, crossed out, and the name given
   * at the new wall waits for the next roll call. A reload during the finale plays it again.
   */
  private async finale(): Promise<void> {
    const run = this.live;
    const has = (f: string) => run.flags.includes(f);
    const ending: Ending = has('mutiny_killed') ? 'newGeneral' : has('mutiny_spared') ? 'emptyWall' : 'lineup';
    this.barracks?.setVisible(false);
    this.d.plate.el.hidden = true;
    await this.music.stop();
    const records = runRecords(run);
    const res = await runFinale({
      stage: this.d.stage,
      ui: this.d.ui,
      audio: this.d.audio,
      settings: this.d.settings,
      reduced: this.d.reduced,
      ending,
      replies: Object.entries(run.replies)
        .map(([n, text]) => ({ n: Number(n), text }))
        .sort((a, b) => a.n - b.n),
      player: { name: run.name, fem: run.gender === 'f' },
      recruits: ending === 'emptyWall' ? [] : recruitsAtTheWall(run, WALL_FACES),
      taken: [...this.save.memory.names],
      register: [...this.save.memory.records.map((r) => ({ ...r, crossed: true })), ...records.map((r) => ({ ...r, crossed: false }))],
      formerNames: [...run.formerNames],
    });
    const done = retireRun(this.save, { records, ending, next: res.newName });
    writeSave(this.d.store, done);
  }
}

/** The faces along the finale's wall, in the order its puppets stand (stages/finale/wall.ts). */
const WALL_FACES = ['norkin', 'korochkina', 'syrkov', 'podvalny', 'sedoy', 'khvostov', 'zernov', 'kroshkin', 'cherdakov'];
