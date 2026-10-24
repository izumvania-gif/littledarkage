/**
 * The blind-mode hint's arithmetic (concept «Доступность»: «чёткие сектора запаха вместо дымки»): which of eight
 * directions by three distances each smell falls into. Plain, only the direction is known, so the whole wedge
 * fills, weaker; after «нюхай», only the one cell, at full strength. Kept apart from the drawing so it is tested.
 */

/** The rings' edges in reference pixels from the head: about one, two and three cells (105 px a cell). */
export const RINGS = [40, 1.5 * 105, 2.5 * 105, 3.2 * 105] as const;
export const WEDGES = 8;
export const WEDGE = (Math.PI * 2) / WEDGES;
/** Screen angle of «ahead» (up; y grows downward). */
export const AHEAD = -Math.PI / 2;

export interface SectorWhiff {
  /** Screen angle of the smell from the head. */
  phi: number;
  /** Distance in reference pixels. */
  r: number;
  amp: number;
  strong: boolean;
}

export interface Cells {
  /** fill[ring][wedge], 0..1; wedge 0 is ahead, counting clockwise on screen. */
  fill: number[][];
  strong: boolean[][];
}

export function wedgeOf(phi: number): number {
  return (((Math.round((phi - AHEAD) / WEDGE) % WEDGES) + WEDGES) % WEDGES) as number;
}

export function ringOf(r: number): number {
  const out = RINGS.findIndex((edge, i) => i > 0 && r < edge);
  return out === -1 ? RINGS.length - 2 : Math.max(0, out - 1);
}

export function sectorCells(whiffs: readonly SectorWhiff[], sniffed: boolean): Cells {
  const rings = RINGS.length - 1;
  const fill = Array.from({ length: rings }, () => new Array<number>(WEDGES).fill(0));
  const strong = Array.from({ length: rings }, () => new Array<boolean>(WEDGES).fill(false));
  for (const w of whiffs) {
    const wedge = wedgeOf(w.phi);
    const ring = ringOf(w.r);
    for (let i = 0; i < rings; i++) {
      if (sniffed && i !== ring) continue;
      fill[i]![wedge] = Math.min(1, fill[i]![wedge]! + w.amp * (sniffed ? 1 : 0.55));
      if (sniffed && w.strong) strong[i]![wedge] = true;
    }
  }
  return { fill, strong };
}
