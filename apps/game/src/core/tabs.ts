/**
 * One playing tab (concept §10 «Сохранения»: «вторая вкладка только читает»). Two tabs writing the same save
 * would undo each other's turns, so a tab asks on a BroadcastChannel whether another one is playing; if so it
 * waits until the player takes the game over, and the old tab stops writing.
 */

export interface TabChannel {
  postMessage(msg: TabMessage): void;
  onmessage: ((e: { data: TabMessage }) => void) | null;
  close(): void;
}

export type TabMessage = { t: 'hello' | 'busy' | 'take'; id: string };

/** How long a new tab listens for a playing one before it plays itself. */
export const HELLO_MS = 350;

export interface TabGuard {
  /** Another tab answered: this one should only look until `take()`. */
  busy: boolean;
  /** Take the game over from the other tab (it stops writing). */
  take(): void;
}

/**
 * Asks whether another tab is playing. `onLost` runs if a newer tab later takes the game from this one.
 * Without BroadcastChannel (old browsers, some private modes) every tab plays, as before.
 */
export async function claimTab(onLost: () => void, open: () => TabChannel | null = defaultChannel): Promise<TabGuard> {
  const ch = open();
  const id = Math.random().toString(36).slice(2);
  if (!ch) return { busy: false, take: () => undefined };
  let playing = false;
  let answered = false;
  ch.onmessage = (e) => {
    const m = e.data;
    if (!m || m.id === id) return;
    if (m.t === 'hello' && playing) ch.postMessage({ t: 'busy', id });
    else if (m.t === 'busy') answered = true;
    else if (m.t === 'take' && playing) {
      playing = false;
      onLost();
    }
  };
  ch.postMessage({ t: 'hello', id });
  await new Promise((r) => setTimeout(r, HELLO_MS));
  playing = !answered;
  return {
    busy: answered,
    take: () => {
      playing = true;
      ch.postMessage({ t: 'take', id });
    },
  };
}

function defaultChannel(): TabChannel | null {
  try {
    return typeof BroadcastChannel === 'function' ? (new BroadcastChannel('lda.tabs') as unknown as TabChannel) : null;
  } catch {
    return null;
  }
}
