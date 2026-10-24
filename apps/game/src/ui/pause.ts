/**
 * The pause in the story (the lineup, the barracks, the caption plate): Esc or P when no window of its own is
 * open — «Продолжить», «Настройки», «Начать с построения». Battles and the brawl keep their own pause. While the
 * pause is open no key reaches the game. «Начать с построения» asks twice: the soldier goes into the register
 * crossed out, and the name can't be taken again.
 */
import type { Settings } from '../core/settings.ts';
import { h, isTyping } from './dom.ts';
import { openSettings } from './settings.ts';
import './settings.css';

export interface PauseOptions {
  ui: HTMLElement;
  /** The settings the game holds now (changed in place by the panel). */
  settings: () => Settings;
  /** Whether a pause makes sense now: the story is on screen and nothing else owns Esc. */
  free: () => boolean;
  /** «Начать с построения», confirmed; null hides the button (no run yet). */
  restart: (() => void) | null;
}

/** Installs the pause; returns the uninstall. Call before the stages, so it sees each press before they do. */
export function installPause(o: PauseOptions): () => void {
  let shown: (() => void) | null = null;

  const show = () => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.dataset.modal = 'pause';
    const go = h('button', { class: 'go', attrs: { type: 'button' } }, 'Продолжить');
    const settings = h('button', { attrs: { type: 'button' } }, 'Настройки');
    const restart = o.restart ? h('button', { attrs: { type: 'button' } }, 'Начать с построения') : null;
    const note = h('p', { class: 'pz-note', attrs: { 'aria-live': 'polite' } });
    const plate = h(
      'section',
      { class: 'pz', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pz-title' } },
      h('div', { class: 'pz-plate' }, h('h2', { text: 'Пауза', attrs: { id: 'pz-title' } }), h('div', { class: 'pz-buttons' }, go, settings, restart), note),
    );
    o.ui.append(plate);
    go.focus();

    let busy = false;
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      e.stopPropagation();
      if (e.type !== 'keydown') return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
        e.preventDefault();
        close();
      } else if (e.code === 'Tab') {
        const list = [...plate.querySelectorAll<HTMLElement>('button')];
        const i = list.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        list[(i + (e.shiftKey ? list.length - 1 : 1) + list.length) % list.length]?.focus();
      }
    };
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      plate.remove();
      delete document.body.dataset.modal;
      shown = null;
      before?.focus({ preventScroll: true });
    };
    shown = close;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);

    go.addEventListener('click', close);
    settings.addEventListener('click', () => {
      // The panel takes the keys while it is open; the pause waits under it.
      busy = true;
      plate.hidden = true;
      void openSettings(o.ui, o.settings()).then(() => {
        busy = false;
        plate.hidden = false;
        document.body.dataset.modal = 'pause';
        settings.focus();
      });
    });
    restart?.addEventListener('click', () => {
      if (!restart.dataset.armed) {
        restart.dataset.armed = '1';
        restart.classList.add('armed');
        restart.textContent = 'Да, вычеркнуть и начать заново';
        note.textContent = 'Солдат уйдёт в книгу учёта зачёркнутым, и взять это имя снова будет нельзя.';
        return;
      }
      close();
      o.restart?.();
    });
  };

  const onKey = (e: KeyboardEvent) => {
    if (shown || e.repeat || e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
    if (e.code !== 'Escape' && e.code !== 'KeyP') return;
    if (document.body.dataset.modal || !o.free()) return;
    e.preventDefault();
    show();
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    shown?.();
  };
}
