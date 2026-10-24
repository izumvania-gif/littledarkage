/**
 * The settings panel (concept «Доступность», §10 «Клавиши»): how the player listens, volumes, sound captions,
 * large text, no flashes, no timer, the blind-mode hints, and the keys. Opened from the first screen, the pause
 * in the barracks and the brawl's pause. It changes the settings object in place and calls settingsChanged(),
 * so whoever holds it sees the change; main.ts applies large text, volumes and output at once.
 *
 * While it is open nothing reaches the game: a capture listener keeps every key, and the key remap is paused,
 * so «Назначить» hears the physical key itself.
 */
import { captionsOn, settingsChanged, type Output, type Settings } from '../core/settings.ts';
import { assign, GAME_KEYS, keyName, keysFor, pauseRemap, PLACE_NAMES, type Place } from '../engine/keys.ts';
import { h } from './dom.ts';
import './settings.css';

const OUTPUTS: { value: Output; label: string }[] = [
  { value: 'headphones', label: 'Наушники' },
  { value: 'speakers', label: 'Колонки' },
  { value: 'mono', label: 'Моно или одно ухо' },
];

const CAPTIONS: { value: 'auto' | 'on' | 'off'; label: string }[] = [
  { value: 'auto', label: 'Без наушников' },
  { value: 'on', label: 'Всегда' },
  { value: 'off', label: 'Никогда' },
];

const PLACES: readonly Place[] = ['everywhere', 'barracks', 'coordinator', 'striker', 'duties', 'mutiny', 'letters'];

/** Modifier keys alone can't be a game key. */
const MODIFIERS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock', 'ContextMenu', 'Fn']);

let open = false;

/** Opens the panel over `root`; resolves when it is closed (Esc, «Закрыть»). Does nothing if it is already open. */
export function openSettings(root: HTMLElement, settings: Settings): Promise<void> {
  if (open) return Promise.resolve();
  open = true;
  return new Promise((resolve) => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevModal = document.body.dataset.modal;
    document.body.dataset.modal = 'settings';
    pauseRemap(true);
    const changed = () => settingsChanged(settings);

    // ---------- sound ----------
    const seg = <V extends string>(name: string, legend: string, items: { value: V; label: string }[], current: V, pick: (v: V) => void) => {
      const fs = h('fieldset', { class: 'seg seg-ink st-seg' }, h('legend', { text: legend }));
      for (const it of items) {
        const input = h('input', { attrs: { type: 'radio', name, value: it.value, id: `st-${name}-${it.value}` } });
        input.checked = it.value === current;
        input.addEventListener('change', () => input.checked && pick(it.value));
        fs.append(h('label', { class: 'seg-option', attrs: { for: `st-${name}-${it.value}` } }, input, h('span', { text: it.label })));
      }
      return fs;
    };
    const slider = (id: keyof Settings['volume'], label: string) => {
      const value = h('output', { class: 'st-val', attrs: { for: `st-vol-${id}` } });
      const input = h('input', { attrs: { type: 'range', min: '0', max: '100', step: '5', id: `st-vol-${id}` } });
      const show = () => (value.textContent = `${input.value}%`);
      input.value = String(Math.round(settings.volume[id] * 100));
      show();
      input.addEventListener('input', () => {
        settings.volume[id] = Number(input.value) / 100;
        show();
        changed();
      });
      return h('div', { class: 'st-slider' }, h('label', { text: label, attrs: { for: `st-vol-${id}` } }), input, value);
    };
    const captionsNow = (): 'auto' | 'on' | 'off' => (settings.captions === null ? 'auto' : settings.captions ? 'on' : 'off');
    const captionsNote = h('p', { class: 'st-note' });
    const noteCaptions = () => (captionsNote.textContent = captionsOn(settings) ? 'Сейчас подписи включены.' : 'Сейчас подписи выключены.');
    noteCaptions();
    const sound = h(
      'section',
      { class: 'st-sec', attrs: { 'aria-labelledby': 'st-sound' } },
      h('h3', { text: 'Звук', attrs: { id: 'st-sound' } }),
      seg('output', 'Чем вы слушаете', OUTPUTS, settings.output, (v) => {
        settings.output = v;
        noteCaptions();
        changed();
      }),
      slider('master', 'Общая громкость'),
      slider('music', 'Музыка'),
      slider('effects', 'Звуки'),
      seg('captions', 'Подписи звуков (сторона и расстояние)', CAPTIONS, captionsNow(), (v) => {
        settings.captions = v === 'auto' ? null : v === 'on';
        noteCaptions();
        changed();
      }),
      captionsNote,
    );

    // ---------- picture and time ----------
    const check = (key: 'largeText' | 'reduceFlashes' | 'noTimer' | 'blindHints', label: string, note: string) => {
      const input = h('input', { attrs: { type: 'checkbox', id: `st-${key}` } });
      input.checked = settings[key];
      input.addEventListener('change', () => {
        settings[key] = input.checked;
        changed();
      });
      return h('div', { class: 'st-check' }, input, h('label', { attrs: { for: `st-${key}` } }, h('b', { text: label }), h('span', { text: note })));
    };
    const picture = h(
      'section',
      { class: 'st-sec', attrs: { 'aria-labelledby': 'st-pic' } },
      h('h3', { text: 'Картинка и время', attrs: { id: 'st-pic' } }),
      check('largeText', 'Крупный шрифт', 'Все надписи и письма крупнее.'),
      check('reduceFlashes', 'Без вспышек', 'Лампа, дискотека и удары — без мигания и тряски, вспышки боя сменяются мягко.'),
      check('noTimer', 'Без таймера', 'Решения в бою и нарядах ждут вас сколько нужно.'),
      check('blindHints', 'Подсказки слепого режима', 'У строк напарника пометка «это твой», запах — чёткими секторами вместо дымки.'),
    );

    // ---------- keys ----------
    const rows = h('div', { class: 'st-keys', attrs: { role: 'list' } });
    const keyNote = h('p', { class: 'st-keynote', attrs: { role: 'status', 'aria-live': 'polite' } });
    let capturing: { game: string; button: HTMLButtonElement } | null = null;
    let offer: { game: string; physical: string } | null = null;

    const drawKeys = () => {
      rows.replaceChildren();
      for (const k of GAME_KEYS) {
        const ways = keysFor(settings.keys, k.code);
        const moved = !(ways.length === 1 && ways[0] === k.code);
        const does = PLACES.filter((p) => k.does[p]).map((p) => `${PLACE_NAMES[p]}: ${k.does[p]}`).join(' · ');
        const btn = h('button', { class: 'st-assign', text: 'Назначить', attrs: { type: 'button', 'data-game': k.code, 'aria-label': `Назначить клавишу для «${keyName(k.code)}»` } });
        btn.addEventListener('click', () => {
          capturing = { game: k.code, button: btn };
          offer = null;
          btn.textContent = 'Нажмите клавишу…';
          keyNote.textContent = `Нажмите клавишу для «${keyName(k.code)}». Esc — отмена.`;
        });
        rows.append(
          h(
            'div',
            { class: `st-key${moved ? ' moved' : ''}`, attrs: { role: 'listitem' } },
            h('span', { class: 'st-kbd' }, ...ways.flatMap((p, i) => [i ? ' / ' : '', h('kbd', { text: keyName(p) })])),
            h('span', { class: 'st-does' }, moved ? h('em', { text: `вместо «${keyName(k.code)}». ` }) : null, does),
            btn,
          ),
        );
      }
    };
    /** After a redraw, back to the row the player was on. */
    const refocus = (game: string) => rows.querySelector<HTMLElement>(`[data-game="${game}"]`)?.focus({ preventScroll: true });
    const showOffer = (game: string, physical: string, by: string) => {
      offer = { game, physical };
      const what = GAME_KEYS.find((k) => k.code === by);
      const desc = what ? PLACES.filter((p) => what.does[p]).slice(0, 2).map((p) => `${PLACE_NAMES[p]}: ${what.does[p]}`).join(', ') : '';
      const swap = h('button', { class: 'st-small', text: 'Поменять местами', attrs: { type: 'button' } });
      const no = h('button', { class: 'st-small', text: 'Отмена', attrs: { type: 'button' } });
      swap.addEventListener('click', () => {
        const r = assign(settings.keys, game, physical, true);
        if (r.ok) settings.keys = r.map;
        offer = null;
        keyNote.textContent = `«${keyName(game)}» теперь на ${keyName(physical)}, «${keyName(by)}» — на прежнем месте «${keyName(game)}».`;
        changed();
        drawKeys();
        refocus(game);
      });
      no.addEventListener('click', () => {
        offer = null;
        keyNote.textContent = 'Ничего не изменено.';
        refocus(game);
      });
      const was = by === physical ? '' : ` (на ней сейчас «${keyName(by)}»)`;
      keyNote.replaceChildren(`Клавиша ${keyName(physical)} уже занята${was}: ${desc}. `, swap, ' ', no);
      swap.focus();
    };
    const take = (code: string) => {
      const c = capturing;
      capturing = null;
      if (!c) return;
      const r = assign(settings.keys, c.game, code);
      if (r.ok) {
        settings.keys = r.map;
        keyNote.textContent = `«${keyName(c.game)}» теперь на клавише ${keyName(code)}.`;
        changed();
        drawKeys();
        refocus(c.game);
      } else if (r.reason === 'taken') {
        drawKeys();
        showOffer(c.game, code, r.by);
      } else {
        keyNote.textContent = 'Esc не переназначается: она закрывает окна и ставит паузу.';
        drawKeys();
        refocus(c.game);
      }
    };
    const reset = h('button', { class: 'st-small', text: 'Сбросить все клавиши', attrs: { type: 'button' } });
    reset.addEventListener('click', () => {
      settings.keys = {};
      keyNote.textContent = 'Все клавиши на своих местах.';
      changed();
      drawKeys();
    });
    drawKeys();
    const keys = h(
      'details',
      { class: 'st-sec st-details' },
      h('summary', {}, h('h3', { text: 'Клавиши', attrs: { id: 'st-keys' } })),
      h('p', { class: 'st-note', text: 'Игра слушает физические клавиши, раскладка не важна. Любую можно перенести на другую; старая клавиша работает, пока её не займёт другая. Esc не переносится.' }),
      keyNote,
      rows,
      reset,
    );

    // ---------- the plate ----------
    const close = h('button', { class: 'st-close', attrs: { type: 'button' } }, 'Закрыть ', h('kbd', { text: 'Esc' }));
    const panel = h(
      'section',
      { class: 'st', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'st-title' } },
      h('div', { class: 'st-plate' }, h('header', { class: 'st-head' }, h('h2', { text: 'Настройки', attrs: { id: 'st-title' } }), close), sound, picture, keys),
    );
    root.append(panel);
    (panel.querySelector<HTMLElement>('input:checked') ?? close).focus();

    const focusables = () => [...panel.querySelectorAll<HTMLElement>('button, input, summary, [tabindex="0"]')].filter((el) => !el.hidden && el.offsetParent !== null && !(el as HTMLInputElement).disabled);
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.type !== 'keydown') return;
      if (capturing) {
        if (MODIFIERS.has(e.code) || e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        if (e.code === 'Escape') {
          const game = capturing.game;
          capturing = null;
          keyNote.textContent = 'Ничего не изменено.';
          drawKeys();
          refocus(game);
        } else take(e.code);
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (offer) {
          offer = null;
          keyNote.textContent = 'Ничего не изменено.';
          return;
        }
        finish();
        return;
      }
      if (e.code === 'Tab') {
        const list = focusables();
        if (!list.length) return;
        const i = list.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === -1 || i === list.length - 1 ? 0 : i + 1;
        e.preventDefault();
        list[next]!.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    const finish = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      panel.remove();
      pauseRemap(false);
      if (prevModal) document.body.dataset.modal = prevModal;
      else delete document.body.dataset.modal;
      open = false;
      before?.focus({ preventScroll: true });
      resolve();
    };
    close.addEventListener('click', finish);
  });
}
