/**
 * What a stage tells an agent in agent mode (`?agent`, agent/bridge.ts). Most of the game is read from the
 * screen — the caption plate, buttons, letters, cards — so only stages drawn in the canvas or played in real
 * time register here: they describe what a player would see or hear in words, offer their own actions, and say
 * when they are still moving on their own. Outside agent mode `registerAgent` does nothing.
 */

export interface AgentAction {
  id: string;
  label: string;
  /** What the argument is, for actions that take one. */
  arg?: string;
}

export interface StageAgent {
  /** What the screen is, in a few words («Бой: координатор»). */
  name: string;
  describe(): string[];
  actions(): AgentAction[];
  /** Does the action; what happened, or null when the id isn't this stage's. */
  perform(id: string, arg?: string): string | null | Promise<string | null>;
  /** Still moving on its own (an animation, the creatures' turn, an autopilot at work): time keeps running. */
  busy?(): boolean;
  /** The player is expected to act, even with no button on screen (keys in a duty). */
  waiting?(): boolean;
  /** Called on every frame the bridge lets pass (autopilots press their keys here). */
  poll?(): void;
  /** Controls this stage already covers with its own actions: a selector; they are not listed as ui:… again. */
  covers?: string;
}

/** Agent mode: `?agent` in the URL (false in tests, which have no window). */
export const AGENT = typeof location !== 'undefined' && new URLSearchParams(location.search).has('agent');

const stack: StageAgent[] = [];

/** A stage says it is on screen; call the returned function when it goes. */
export function registerAgent(a: StageAgent): () => void {
  if (!AGENT) return () => undefined;
  stack.push(a);
  return () => {
    const i = stack.indexOf(a);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function stageAgents(): readonly StageAgent[] {
  return stack;
}

/** Presses a key as a player would (keydown, then keyup), for stages played with the keyboard. */
export function pressKey(code: string, opts: { hold?: boolean } = {}): void {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code;
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
  if (!opts.hold) document.body.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true }));
}

export function releaseKey(code: string): void {
  document.body.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
}
