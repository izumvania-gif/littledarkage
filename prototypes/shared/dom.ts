/** Tiny DOM helper: h('p', { class: 'x', text: '…' }, child, …). */
type Props = {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Resolves on the next press of one of the given keys (by physical key, so the layout doesn't matter) or a click on el. */
export function nextPress(codes: readonly string[], el?: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('keydown', onKey);
      el?.removeEventListener('click', onClick);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTyping(e.target)) return;
      if (codes.includes(e.code)) {
        e.preventDefault();
        done();
      }
    };
    const onClick = () => done();
    window.addEventListener('keydown', onKey);
    el?.addEventListener('click', onClick);
  });
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
