/**
 * Agent mode runs on its own clock (as in Eferon): nothing moves until the agent acts. performance.now,
 * requestAnimationFrame and the timers are replaced by a virtual clock that `advance` moves forward, so the game
 * is turn-based for an agent and exactly reproducible, however slowly the machine renders. Math.random is
 * seeded too (`?seed=`), so the draws, the battles and the brawl replay the same. Installed by main.ts before
 * the game is built. Real time still runs underneath for the browser's own work: fetches, the music worker.
 */

export interface VirtualTime {
  /** Move the clock forward by `ms`, running due timers and one animation frame at the end. */
  advance(ms: number): void;
  now(): number;
  /**
   * Let the browser breathe (promises, network, workers) without moving the virtual clock; with `ms`, for that
   * long in real time (loading a chunk, a font, the GPU).
   */
  yieldReal(ms?: number): Promise<void>;
}

/** mulberry32: the same generator as core/rng.ts, kept here so this file has no imports. */
function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function installVirtualTime(seed: number): VirtualTime {
  let now = 1000;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timers: { id: number; due: number; every?: number; fn: () => void }[] = [];
  const w = window as unknown as Record<string, unknown>;
  // The real setTimeout, for yielding to the browser between virtual frames.
  const realTimeout = window.setTimeout.bind(window);
  const channel = new MessageChannel();
  const waiting: (() => void)[] = [];
  channel.port1.onmessage = () => waiting.shift()?.();
  Math.random = seeded(seed);
  performance.now = () => now;
  Date.now = () => 1_790_000_000_000 + now;
  w.requestAnimationFrame = (cb: FrameRequestCallback) => {
    frames.set(++nextId, cb);
    return nextId;
  };
  w.cancelAnimationFrame = (id: number) => void frames.delete(id);
  w.setTimeout = (fn: TimerHandler, ms = 0, ...args: unknown[]) => {
    timers.push({ id: ++nextId, due: now + (Number(ms) || 0), fn: () => (typeof fn === 'function' ? fn(...args) : undefined) });
    return nextId;
  };
  w.setInterval = (fn: TimerHandler, ms = 0, ...args: unknown[]) => {
    const every = Math.max(1, Number(ms) || 1);
    timers.push({ id: ++nextId, due: now + every, every, fn: () => (typeof fn === 'function' ? fn(...args) : undefined) });
    return nextId;
  };
  w.clearTimeout = w.clearInterval = (id: number) => {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  };
  let yields = 0;
  return {
    now: () => now,
    yieldReal: (ms?: number) =>
      new Promise<void>((resolve) => {
        // A message is the fastest way round the event loop; now and then a real timeout lets workers and
        // network callbacks (which wait behind messages) in too.
        if (ms || ++yields % 8 === 0) realTimeout(resolve, ms ?? 0);
        else {
          waiting.push(resolve);
          channel.port2.postMessage(0);
        }
      }),
    advance(ms: number) {
      const end = now + ms;
      for (let guard = 0; guard < 20000; guard++) {
        timers.sort((a, b) => a.due - b.due);
        const t = timers[0];
        if (!t || t.due > end) break;
        now = Math.max(now, t.due);
        if (t.every) t.due += t.every;
        else timers.shift();
        try {
          t.fn();
        } catch (e) {
          console.error(e);
        }
      }
      now = end;
      const due = [...frames.values()];
      frames.clear();
      for (const cb of due) {
        try {
          cb(now);
        } catch (e) {
          console.error(e);
        }
      }
    },
  };
}
