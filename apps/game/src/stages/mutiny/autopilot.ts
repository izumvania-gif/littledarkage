/**
 * A plain autopilot for the brawl, for dev pages and bots only (the stage loads it in development, never in the
 * build): turns the tape recorder on, goes along the grid for the nearest of the general's men and swings, steps
 * out of the nagan's aim line to whichever side has room, then walks through the open door and up to the general.
 * Set `window.__mutinyAuto = true` in a dev build to let it fight for the player.
 */
import { alive, find, findPath, GENERAL, IDLE_INPUT, player, reach, type Brawl, type Input } from './brawl.ts';

export function autopilot(b: Brawl): Input | null {
  const p = player(b);
  if (!alive(p) || b.phase !== 'fight') return null;
  const foe = b.units
    .filter((u) => u.side === 'loyal' && alive(u))
    .sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y))[0];
  const tape = b.room === 0 && !b.tape ? { x: 71, y: 112 } : null;
  const t = tape ?? foe ?? (b.room < 2 ? { x: 1272, y: 270 } : find(b, GENERAL)!);
  const d = Math.hypot(t.x - p.x, t.y - p.y);
  const path = findPath(b.room, p.x, p.y, t.x, t.y);
  let tx = path[0] ?? t.x;
  let ty = path[1] ?? t.y;
  if (path.length >= 4 && Math.hypot(tx - p.x, ty - p.y) < 8) {
    tx = path[2]!;
    ty = path[3]!;
  }
  const n = Math.hypot(tx - p.x, ty - p.y) || 1;
  const input: Input = { ...IDLE_INPUT, mx: (tx - p.x) / n, my: (ty - p.y) / n, ax: t.x, ay: t.y, attack: !tape && d < 58 && Math.random() < 0.5, use: !!tape && d < 30 };
  if (b.aim) {
    const up = b.aim.dir - Math.PI / 2;
    const down = b.aim.dir + Math.PI / 2;
    const a = reach(b, p.x, p.y, up, 200, 'move') > reach(b, p.x, p.y, down, 200, 'move') ? up : down;
    input.mx = Math.cos(a);
    input.my = Math.sin(a);
  }
  return input;
}
