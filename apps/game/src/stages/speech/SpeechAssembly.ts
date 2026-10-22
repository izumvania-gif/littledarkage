/**
 * The new general's speech (concept «Новый генерал из игроков»): the player, named general at the third muster,
 * stands before the lineup with the old general beside him (bareheaded now: the cap went to the player) and
 * puts his speech together from slips against the clock. The old general prompts in his formulas. Крыпоткин's
 * welcome lines lie among the slips and sound empty now; there is the truth, a short order, and silence. What
 * the speech mostly was is handed back; the runner shows the lines as the player's words and sets the flag.
 * «Без таймера»: no clock, the prompts still come.
 */
import { BattleSound } from '../../engine/spatial.ts';
import { Puppet, type PuppetColors } from '../../render/puppet.ts';
import { PuppetPair, buildLineup } from '../../render/lineup.ts';
import { POSTER, TRUTH } from '../../render/palette.ts';
import { LINEUP_HOLES } from '../../render/tears.ts';
import { h, isTyping } from '../../ui/dom.ts';
import type { SpeechFragment, SpeechKind } from '../../content/speechFragments.ts';
import { DutyScene } from '../duty/scene.ts';
import type { DutyContext } from '../duty/types.ts';
import { COUNTDOWN, deal, MAX_LINES, NUDGE_AT, SPEECH_SECONDS, SpeechDraft, WAIT_AT } from './speechModel.ts';
import './speech.css';

export type { SpeechFragment, SpeechKind } from '../../content/speechFragments.ts';

/** The old general's prompts. He taught the soldiers in formulas; he teaches the new general the same way. */
const SAY = {
  intro: 'Речь. Перед строем. Перед боем.',
  how: 'Бумажки — вот. Что говорить — решай сам. Цифрами — бумажку, Enter — сказать.',
  nudge: 'Начни с приказа. Приказ поймут все.',
  wait: 'Строй ждёт.',
  ten: 'Десять секунд.',
  first: {
    hollow: 'Это слова Крыпоткина. Их уже слышали.',
    truth: 'Правду можно. Коротко.',
    order: 'Приказ. Это поймут.',
    silence: 'Помолчать — тоже речь.',
  } as Record<string, string>,
  full: 'Хватит. Говори.',
  silent: 'Молчишь. Строй поймёт.',
  timeSome: 'Время. Говори, что собрал.',
  timeNone: 'Время. Молчишь — значит, молчишь.',
};

const POSTER_COLORS: PuppetColors = { body: POSTER.black, seam: POSTER.cream, eye: POSTER.cream };
const TRUTH_COLORS: PuppetColors = { body: TRUTH.cut, seam: 0x1b1815, eye: TRUTH.eye };
const SHADOW_COLORS: PuppetColors = { body: 0x000000, seam: 0x000000, eye: 0x000000 };
/** The lineup's floor line and the old general's place, behind the new one's shoulder. */
const FLOOR = 500;
const OLD_GENERAL = { x: 128, scale: 1.95 };

const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
const NUMPAD = DIGITS.map((d) => d.replace('Digit', 'Numpad'));

export function runSpeechAssembly(ctx: DutyContext, opts: { fragments: readonly SpeechFragment[] }): Promise<{ kind: SpeechKind; lines: string[] }> {
  const a = new Assembly(ctx, opts.fragments);
  return a.run().finally(() => a.destroy());
}

class Assembly {
  private readonly ctx: DutyContext;
  private readonly scene: DutyScene;
  private readonly sound: BattleSound;
  private readonly draft: SpeechDraft;
  private readonly player: PuppetPair;
  private readonly old: PuppetPair;
  private readonly slips: HTMLButtonElement[];
  private readonly lines: HTMLOListElement;
  private readonly timer: HTMLElement;
  private readonly sayBtn: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly sheet: HTMLElement;
  private readonly slipBox: HTMLElement;
  private readonly firsts = new Set<string>();
  private outcome: 'said' | 'silent' | null = null;
  /** The clock is running: slips can be taken. */
  private live = false;
  private barking = false;
  private poseUntil = 0;
  private oldUntil = 0;
  private readonly onKey = (e: KeyboardEvent) => this.key(e);

  constructor(ctx: DutyContext, fragments: readonly SpeechFragment[]) {
    this.ctx = ctx;
    this.draft = new SpeechDraft(deal(fragments, Math.random));
    this.scene = new DutyScene(ctx, LINEUP_HOLES);
    this.sound = new BattleSound(ctx.audio);
    const L = this.scene.layers;
    const lineup = buildLineup();
    L.poster.addChild(lineup.poster);
    L.truth.addChild(lineup.truth);
    this.player = lineup.general;
    this.player.setPose('attention');
    for (const r of lineup.recruits) r.setPose('attention');
    // The old general, bareheaded, a step behind the new one: in both prints, his shadow in the truth's blur.
    const g = lineup.general;
    const make = (colors: PuppetColors, scale: number, dx: number, beside: Puppet) => {
      const p = new Puppet(colors, { general: true, phase: 5, look: { hat: 'none', stoop: 0.05 } });
      p.root.position.set(OLD_GENERAL.x + dx, FLOOR + dx);
      p.root.scale.set(scale, scale);
      const parent = beside.root.parent!;
      parent.addChildAt(p.root, parent.getChildIndex(beside.root));
      return p;
    };
    const s = OLD_GENERAL.scale;
    this.old = new PuppetPair(make(POSTER_COLORS, s, 0, g.poster), make(TRUTH_COLORS, s * 0.97, 0, g.truth), make(SHADOW_COLORS, s * 0.97, 6, g.shadow));
    this.old.setPose('rest');
    this.scene.onFrame((f) => {
      if (this.poseUntil && this.scene.now > this.poseUntil) {
        this.poseUntil = 0;
        this.player.setPose('attention');
      }
      if (this.oldUntil && this.scene.now > this.oldUntil) {
        this.oldUntil = 0;
        this.old.setPose('rest');
      }
      if (!ctx.reduced) {
        lineup.step(f);
        this.old.step(f);
      }
    });

    // ---- the sheet and the slips ----
    this.timer = h('span', { class: 'speech-timer', attrs: { 'aria-hidden': 'true' } });
    this.lines = h('ol', { class: 'speech-lines', attrs: { 'aria-label': 'Речь', 'aria-live': 'polite' } });
    this.sayBtn = h('button', { class: 'say', attrs: { type: 'button', disabled: '' } }, 'Сказать', h('kbd', { text: 'Enter' }));
    this.backBtn = h('button', { attrs: { type: 'button', disabled: '' } }, 'Убрать', h('kbd', { text: '⌫' }));
    const silentBtn = h('button', { attrs: { type: 'button' } }, 'Промолчать', h('kbd', { text: '0' }));
    this.sayBtn.addEventListener('click', () => this.say());
    this.backBtn.addEventListener('click', () => this.unpick());
    silentBtn.addEventListener('click', () => this.silent());
    this.sheet = this.scene.plate(
      'speech-sheet',
      h('p', { class: 'speech-head' }, h('span', { text: 'РЕЧЬ' }), this.timer),
      this.lines,
      h('div', { class: 'speech-actions' }, this.sayBtn, this.backBtn, silentBtn),
    );
    this.slipBox = h('div', { class: 'speech-slips', attrs: { role: 'group', 'aria-label': 'Бумажки' } });
    this.slips = this.draft.slips.map((f, i) => {
      const b = h('button', { class: `speech-slip ${f.kind === 'silence' ? 'silence' : ''}`, attrs: { type: 'button' } }, h('kbd', { text: String(i + 1) }), f.text);
      b.addEventListener('click', () => this.pick(i));
      this.slipBox.append(b);
      return b;
    });
    this.scene.hud.append(this.slipBox);
    this.sheet.hidden = true;
    this.slipBox.hidden = true;
    this.render();
    // For the dev page's robot (stripped from the build).
    if (import.meta.env.DEV) Reflect.set(window, '__speech', { draft: this.draft, pick: (i: number) => this.pick(i), say: () => this.say(), silent: () => this.silent() });
  }

  async run(): Promise<{ kind: SpeechKind; lines: string[] }> {
    const s = this.scene;
    const timed = !this.ctx.settings.noTimer;
    this.oldSpeaks(2);
    await s.talk(SAY.intro);
    this.sheet.hidden = false;
    this.slipBox.hidden = false;
    this.oldSpeaks(3);
    await s.talk(SAY.how);
    // Focus stays on the page, so Enter says the speech; Tab still walks the slips and buttons.
    window.addEventListener('keydown', this.onKey);
    this.live = true;
    const t0 = s.now;
    const said = { nudge: false, wait: false, ten: false };
    const left = () => SPEECH_SECONDS - (s.now - t0);
    this.scene.onTick(() => {
      if (this.outcome) return;
      const gone = s.now - t0;
      if (timed) {
        const l = Math.max(0, Math.ceil(left()));
        this.timer.textContent = `0:${String(l).padStart(2, '0')}`;
        this.timer.classList.toggle('low', l <= COUNTDOWN);
      }
      if (!said.nudge && gone >= NUDGE_AT && !this.draft.lines.length) {
        said.nudge = true;
        this.bark(SAY.nudge, 2600);
      }
      if (timed && !said.wait && gone >= WAIT_AT) {
        said.wait = true;
        this.bark(SAY.wait, 1600);
      }
      if (timed && !said.ten && left() <= COUNTDOWN) {
        said.ten = true;
        void this.scene.talk(SAY.ten, { timeoutMs: 1400 });
      }
    });
    const inTime = await s.until(() => this.outcome !== null, timed ? SPEECH_SECONDS : Infinity);
    window.removeEventListener('keydown', this.onKey);
    for (const b of this.slips) b.disabled = true;
    const result = this.draft.result();
    if (!inTime) {
      this.oldSpeaks(2);
      await s.talk(result.lines.length ? SAY.timeSome : SAY.timeNone, { timeoutMs: 2200 });
    } else if (this.outcome === 'silent') {
      this.oldSpeaks(2);
      await s.talk(SAY.silent, { timeoutMs: 2000 });
      return { kind: 'silence', lines: [] };
    }
    return result;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    if (import.meta.env.DEV) Reflect.deleteProperty(window, '__speech');
    this.scene.destroy();
  }

  private key(e: KeyboardEvent): void {
    if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    // A focused button takes its own Enter and Space.
    const onButton = e.target instanceof HTMLButtonElement && (this.sheet.contains(e.target) || this.slipBox.contains(e.target));
    if (onButton && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) return;
    const i = Math.max(DIGITS.indexOf(e.code), NUMPAD.indexOf(e.code));
    if (i >= 0) this.pick(i);
    else if (e.code === 'Backspace') this.unpick();
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.say();
    else if (e.code === 'Digit0' || e.code === 'Numpad0') this.silent();
    else return;
    e.preventDefault();
  }

  private pick(i: number): void {
    if (!this.live || this.outcome || !this.draft.pick(i)) return;
    const f = this.draft.slips[i]!;
    // A slip of paper off the desk.
    this.sound.noise({ dur: 0.14, freq: 2800, to: 4200, filter: 'bandpass', gain: 0.12, bus: 'ui' });
    this.player.setPose('speak');
    this.poseUntil = this.scene.now + 1;
    // His remark on each kind, once; one he couldn't make while still talking waits for the next slip of it.
    const line = SAY.first[f.kind];
    if (line && !this.firsts.has(f.kind) && this.bark(line, 2200)) this.firsts.add(f.kind);
    if (this.draft.full) this.bark(SAY.full, 1600);
    this.render(true);
  }

  private unpick(): void {
    if (!this.live || this.outcome || !this.draft.unpick()) return;
    this.sound.noise({ dur: 0.1, freq: 3600, to: 2400, filter: 'bandpass', gain: 0.08, bus: 'ui' });
    this.render();
  }

  private say(): void {
    if (!this.live || this.outcome || !this.draft.lines.length) return;
    this.outcome = 'said';
  }

  private silent(): void {
    if (!this.live || this.outcome) return;
    this.outcome = 'silent';
  }

  /** Redraws the sheet and the desk; `added`: the last line has just been written in (it alone steps in). */
  private render(added = false): void {
    const items: HTMLLIElement[] = [];
    const n = this.draft.lines.length;
    for (let i = 0; i < MAX_LINES; i++) {
      const f = this.draft.lines[i];
      const cls = [f?.kind === 'silence' ? 'silence' : '', added && i === n - 1 ? 'fresh' : ''].join(' ').trim();
      items.push(f ? h('li', { class: cls, text: f.text }) : h('li', { class: 'empty', text: '—' }));
    }
    this.lines.replaceChildren(...items);
    this.slips.forEach((b, i) => {
      const taken = this.draft.taken(i);
      b.classList.toggle('taken', taken);
      b.disabled = taken || this.draft.full;
      b.setAttribute('aria-hidden', String(taken));
    });
    this.sayBtn.disabled = !this.draft.lines.length;
    this.sayBtn.classList.toggle('ready', this.draft.full);
    this.backBtn.disabled = !this.draft.lines.length;
  }

  /** The old general prompts; a prompt already showing is not interrupted by another. */
  private bark(text: string, ms: number): boolean {
    if (this.barking) return false;
    this.barking = true;
    this.oldSpeaks(ms / 1000);
    void this.scene.talk(text, { timeoutMs: ms }).then(() => (this.barking = false));
    return true;
  }

  private oldSpeaks(seconds: number): void {
    this.old.setPose('speak');
    this.oldUntil = this.scene.now + seconds;
  }
}
