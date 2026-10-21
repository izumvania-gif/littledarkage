/**
 * Synthesizes a track's dry mix off the page, so rendering music never freezes the game; the page then runs only
 * the short master graph (render.ts). Messages: { id, sr } in, { id, left, right } out (buffers transferred).
 */
import { TRACKS, type TrackId } from '../../content/tracks.ts';
import { synthesize } from './render.ts';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: TrackId; sr: number }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { id, sr } = e.data;
  const { left, right } = synthesize(TRACKS[id], sr);
  scope.postMessage({ id, sr, left, right }, [left.buffer, right.buffer]);
};
