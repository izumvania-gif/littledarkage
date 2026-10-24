/**
 * The caption under the ROSTA frame: a flat cream plate laid exactly over the poster's caption band.
 * The general's speech is typed into it; names are called out in it; the register is opened in it.
 * Text lives in the DOM, not the canvas, so it stays sharp, readable and scales with «крупный шрифт».
 */
import { checkName, MAX_NAME, NAME_ERRORS, normalizeName } from '../core/names.ts';
import type { Gender } from '../core/save.ts';
import { PARAGRAPH_PAUSE, PAUSE_AFTER, TYPE_CPS } from '../content/speech.ts';
import type { AudioEngine } from '../engine/audio.ts';
import { CAPTION_TOP, REF_H, REF_W } from '../render/palette.ts';
import type { Fit } from '../render/stage.ts';
import { h, isTyping, nextPress, wait } from './dom.ts';

export interface Cue {
  /** Fires once the typed text reaches the end of this phrase. */
  at: string;
  run: () => void;
}

const ADVANCE = ['Space', 'Enter', 'NumpadEnter'];

function untilVisible(): Promise<void> {
  if (!document.hidden) return Promise.resolve();
  return new Promise((r) => document.addEventListener('visibilitychange', () => r(), { once: true }));
}

export class CaptionPlate {
  readonly el: HTMLElement;
  private readonly headEl: HTMLElement;
  private readonly body: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly live: HTMLElement;
  private readonly audio: AudioEngine;
  private readonly reducedMotion: boolean;

  constructor(root: HTMLElement, audio: AudioEngine, reducedMotion: boolean) {
    this.audio = audio;
    this.reducedMotion = reducedMotion;
    this.headEl = h('p', { class: 'cap-head' });
    this.body = h('div', { class: 'cap-body' });
    this.hint = h('p', { class: 'cap-hint' }, h('span', { class: 'key', text: 'Пробел' }), ' — дальше');
    this.hint.hidden = true;
    this.live = h('p', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
    this.el = h('section', { class: 'caption', attrs: { 'aria-label': 'Подпись к кадру' } }, this.headEl, this.body, this.hint, this.live);
    root.append(this.el);
  }

  /** Lays the plate over the caption band of the 1280×720 frame. */
  position(fit: Fit): void {
    const s = this.el.style;
    s.setProperty('--u', `${fit.scale}px`);
    s.left = `${fit.x}px`;
    s.width = `${REF_W * fit.scale}px`;
    s.bottom = `${window.innerHeight - (fit.y + REF_H * fit.scale)}px`;
    s.minHeight = `${(REF_H - CAPTION_TOP) * fit.scale}px`;
  }

  header(num: string, title: string): void {
    this.headEl.replaceChildren(h('span', { class: 'num', text: num }), ' ', title);
  }

  /** Types a paragraph on the general's typewriter. Space, Enter or a click finishes the line at once. */
  async type(text: string, cues: Cue[] = [], speaker = 'Генерал'): Promise<void> {
    const p = h('p', { class: 'typed' });
    this.body.replaceChildren(h('p', { class: 'speaker', text: speaker }), p);
    this.live.textContent = `${speaker}: ${text}`;
    this.hint.hidden = false;
    let skip = false;
    const fired = new Set<Cue>();
    const fire = (upTo: number) => {
      for (const c of cues) {
        if (fired.has(c)) continue;
        const end = text.indexOf(c.at) + c.at.length;
        if (text.indexOf(c.at) >= 0 && end <= upTo) {
          fired.add(c);
          c.run();
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.repeat && !isTyping(e.target) && ADVANCE.includes(e.code)) {
        e.preventDefault();
        skip = true;
      }
    };
    const onClick = () => (skip = true);
    window.addEventListener('keydown', onKey);
    this.el.addEventListener('click', onClick);
    try {
      for (let i = 0; i < text.length; i++) {
        if (skip || this.reducedMotion) break;
        await untilVisible();
        const ch = text.charAt(i);
        p.textContent = text.slice(0, i + 1);
        fire(i + 1);
        if (ch.trim()) this.audio.typeKey();
        await wait(1000 / TYPE_CPS + (PAUSE_AFTER[ch] ?? 0));
      }
      p.textContent = text;
      fire(text.length);
      p.classList.add('done');
      this.audio.bell();
      skip = false;
      // The pause between paragraphs, which a fresh press also skips.
      const deadline = performance.now() + PARAGRAPH_PAUSE;
      while (!skip && performance.now() < deadline) await wait(40);
    } finally {
      window.removeEventListener('keydown', onKey);
      this.el.removeEventListener('click', onClick);
      this.hint.hidden = true;
    }
  }

  /**
   * One line of the script. The general types on his machine; everyone else's words appear at once in their
   * own hand; narration has no name. Resolves when the player moves on (Space, Enter or a click).
   */
  async line(l: { speaker: string | null; style: 'type' | 'hand' | 'serif' | 'mono' | 'narration'; text: string }): Promise<void> {
    if (l.style === 'type') {
      await this.type(l.text, [], l.speaker ?? 'Генерал');
      return;
    }
    const text = h('p', { class: `said said-${l.style}`, text: l.text });
    this.body.replaceChildren(...(l.speaker ? [h('p', { class: 'speaker', text: l.speaker })] : []), text);
    this.live.textContent = l.speaker ? `${l.speaker}: ${l.text}` : l.text;
    this.hint.hidden = false;
    // A beat before a press counts, so a held key doesn't skip lines unread.
    await wait(this.reducedMotion ? 120 : 220);
    await nextPress(ADVANCE, this.el);
    this.hint.hidden = true;
  }

  /** A line shown without waiting for the player (a command during a duty): it stays until the next one. */
  show(l: { speaker: string | null; style: 'type' | 'hand' | 'serif' | 'mono' | 'narration'; text: string }): void {
    const text = h('p', { class: `said said-${l.style === 'type' ? 'mono' : l.style}`, text: l.text });
    this.body.replaceChildren(...(l.speaker ? [h('p', { class: 'speaker', text: l.speaker })] : []), text);
    this.live.textContent = l.speaker ? `${l.speaker}: ${l.text}` : l.text;
    if (l.style === 'type') this.audio.bell();
  }

  /** The player's choice: numbered buttons; 1–9 pick, arrows move, Enter takes the focused one. */
  choose(options: readonly string[]): Promise<number> {
    return new Promise((resolve) => {
      const buttons = options.map((text, i) => h('button', { class: 'choice', attrs: { type: 'button', 'data-n': String(i + 1) } }, h('span', { class: 'choice-n', text: `${i + 1}` }), ' ', text));
      const list = h('div', { class: 'choices', attrs: { role: 'group', 'aria-label': 'Ваш ответ' } }, ...buttons);
      this.body.replaceChildren(list);
      this.live.textContent = `Ваш ответ: ${options.map((o, i) => `${i + 1}. ${o}`).join('; ')}`;
      const done = (i: number) => {
        window.removeEventListener('keydown', onKey);
        resolve(i);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.repeat || isTyping(e.target)) return;
        const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
        if (digit) {
          const i = Number(digit[2]) - 1;
          if (i < buttons.length) {
            e.preventDefault();
            done(i);
          }
          return;
        }
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
          e.preventDefault();
          buttons[(at + 1) % buttons.length]?.focus();
        } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
          e.preventDefault();
          buttons[(at - 1 + buttons.length) % buttons.length]?.focus();
        }
      };
      buttons.forEach((b, i) => b.addEventListener('click', () => done(i)));
      window.addEventListener('keydown', onKey);
      buttons[0]?.focus();
    });
  }

  /** Clears the body (between scenes). */
  clear(): void {
    this.body.replaceChildren();
    this.live.textContent = '';
  }

  /** A recruit shouting his name from the line. */
  async callout(name: string): Promise<void> {
    this.body.replaceChildren(h('p', { class: 'callout', text: `${name}!` }));
    this.live.textContent = `${name}!`;
    await wait(this.reducedMotion ? 500 : 750);
  }

  /** The player's turn in the roll call. Former soldiers' names are taken; `gender` is checked at first. */
  askName(taken: readonly string[], gender: Gender = 'm'): Promise<{ name: string; gender: Gender }> {
    return new Promise((resolve) => {
      const input = h('input', { attrs: { id: 'recruit-name', type: 'text', maxlength: String(MAX_NAME + 4), autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'name-error' } });
      const genders = (['m', 'f'] as const).map((g) => {
        const radio = h('input', { attrs: { type: 'radio', name: 'gender', value: g, id: `gender-${g}` } });
        radio.checked = g === gender;
        return h('label', { class: 'seg-option', attrs: { for: `gender-${g}` } }, radio, h('span', { text: g === 'm' ? 'рядовой' : 'рядовая' }));
      });
      const error = h('p', { class: 'error', attrs: { id: 'name-error', role: 'alert' } });
      const form = h(
        'form',
        { class: 'naming', attrs: { novalidate: '' } },
        h('label', { class: 'naming-label', text: 'Ваша очередь. Назовите своё имя.', attrs: { for: 'recruit-name' } }),
        h('div', { class: 'naming-row' }, input, h('fieldset', { class: 'seg seg-ink' }, h('legend', { class: 'sr-only', text: 'Звание' }), ...genders), h('button', { class: 'primary', text: 'Назвать', attrs: { type: 'submit' } })),
        error,
      );
      this.body.replaceChildren(form);
      this.live.textContent = 'Ваша очередь. Назовите своё имя.';
      input.focus();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const check = checkName(input.value, taken);
        if (!check.ok) {
          error.textContent = NAME_ERRORS[check.reason];
          this.audio.typeKey();
          input.focus();
          return;
        }
        const gender = (form.querySelector<HTMLInputElement>('input[name="gender"]:checked')?.value ?? 'm') as Gender;
        resolve({ name: check.name, gender });
      });
    });
  }

  /**
   * How to write the player's name on a triangle («Кому: Петровой»): the guessed dative, to confirm or correct once
   * (concept §10 «Склонение имени»). Resolves with the form to use.
   */
  askDative(suggested: string): Promise<string> {
    return new Promise((resolve) => {
      const input = h('input', { attrs: { id: 'name-dative', type: 'text', maxlength: String(MAX_NAME + 8), autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'dative-error' } });
      input.value = suggested;
      const error = h('p', { class: 'error', attrs: { id: 'dative-error', role: 'alert' } });
      const form = h(
        'form',
        { class: 'naming', attrs: { novalidate: '' } },
        h('label', { class: 'naming-label', text: 'Как подписать треугольник с вашими письмами?', attrs: { for: 'name-dative' } }),
        h('div', { class: 'naming-row' }, h('span', { class: 'naming-prefix', text: 'Кому:' }), input, h('button', { class: 'primary', text: 'Так', attrs: { type: 'submit' } })),
        error,
      );
      this.body.replaceChildren(form);
      this.live.textContent = `Как подписать треугольник? Кому: ${suggested}`;
      input.focus();
      input.select();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const value = normalizeName(input.value);
        if (!value || value.length > MAX_NAME + 8 || !/^[\p{L}][\p{L}' -]*$/u.test(value)) {
          error.textContent = NAME_ERRORS[value ? 'chars' : 'empty'];
          this.audio.typeKey();
          input.focus();
          return;
        }
        resolve(value);
      });
    });
  }

  /** The register: earlier soldiers crossed out, then today's entry typed in. */
  async register(crossed: readonly string[], entry: string, typed: boolean): Promise<void> {
    const list = h('ul', { class: 'register-list' }, ...crossed.map((n) => h('li', {}, h('s', { text: n }))));
    const line = h('p', { class: 'typed' });
    this.body.replaceChildren(h('p', { class: 'speaker', text: 'Книга учёта' }), ...(crossed.length ? [list] : []), line);
    this.live.textContent = `Книга учёта. ${entry}`;
    if (!typed || this.reducedMotion) {
      line.textContent = entry;
    } else {
      for (let i = 0; i < entry.length; i++) {
        line.textContent = entry.slice(0, i + 1);
        if (entry.charAt(i).trim()) this.audio.typeKey();
        await wait(1000 / TYPE_CPS);
      }
      this.audio.bell();
    }
    line.classList.add('done');
    await wait(typed ? 900 : 0);
  }

  /**
   * The end of milestone 0. «Начать с построения» crosses this soldier out; it asks once more before doing it.
   * Resolves when the player confirmed the restart.
   */
  end(text: string, warning: string, extra?: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      const restart = h('button', { class: 'secondary', text: 'Начать с построения', attrs: { type: 'button' } });
      const note = h('p', { class: 'end-note', attrs: { 'aria-live': 'polite' } });
      restart.addEventListener('click', () => {
        if (restart.dataset.armed) {
          resolve();
          return;
        }
        restart.dataset.armed = '1';
        restart.textContent = 'Да, вычеркнуть и начать заново';
        note.textContent = warning;
      });
      this.body.append(h('div', { class: 'end-row' }, h('p', { class: 'end-text', text }), restart), note);
      if (extra) this.body.append(extra);
      restart.focus();
    });
  }
}
