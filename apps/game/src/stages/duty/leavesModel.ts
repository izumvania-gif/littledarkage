/**
 * «Закрасить листочки и уложить в ряд» without pictures: how much of the sheet the pencil covered, how much
 * went over the edge, and how straight the sheet lies in the row. Kept free of Pixi so it can be tested.
 */

export type Pt = readonly [number, number];

/** Is (x, y) inside the polygon (even–odd rule)? */
export function inside(poly: readonly Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * The sheet as a grid of cells: those inside it are to be shaded, those within `margin` outside it are
 * the table, where pencil marks count against the player.
 */
export class Shading {
  readonly cell: number;
  private readonly x0: number;
  private readonly y0: number;
  private readonly cols: number;
  private readonly rows: number;
  /** 1 inside the sheet, 2 the table around it, 0 too far to care. */
  private readonly kind: Uint8Array;
  private readonly marked: Uint8Array;
  private readonly total: number;
  private covered = 0;
  private overran = 0;

  constructor(poly: readonly Pt[], cell = 10, margin = 40) {
    this.cell = cell;
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    this.x0 = Math.min(...xs) - margin;
    this.y0 = Math.min(...ys) - margin;
    this.cols = Math.ceil((Math.max(...xs) + margin - this.x0) / cell);
    this.rows = Math.ceil((Math.max(...ys) + margin - this.y0) / cell);
    this.kind = new Uint8Array(this.cols * this.rows);
    this.marked = new Uint8Array(this.cols * this.rows);
    let total = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.x0 + (c + 0.5) * cell;
        const y = this.y0 + (r + 0.5) * cell;
        const isIn = inside(poly, x, y);
        this.kind[r * this.cols + c] = isIn ? 1 : 2;
        if (isIn) total++;
      }
    }
    this.total = total;
  }

  /** A pencil stroke from a to b with a lead of `radius`. Returns what it newly covered and overran. */
  stroke(a: Pt, b: Pt, radius: number): { covered: number; overran: number } {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / (this.cell / 2)));
    let covered = 0;
    let overran = 0;
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n;
      const y = a[1] + ((b[1] - a[1]) * i) / n;
      const c0 = Math.floor((x - radius - this.x0) / this.cell);
      const c1 = Math.floor((x + radius - this.x0) / this.cell);
      const r0 = Math.floor((y - radius - this.y0) / this.cell);
      const r1 = Math.floor((y + radius - this.y0) / this.cell);
      for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
        for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
          const cx = this.x0 + (c + 0.5) * this.cell;
          const cy = this.y0 + (r + 0.5) * this.cell;
          if (Math.hypot(cx - x, cy - y) > radius + this.cell * 0.35) continue;
          const k = r * this.cols + c;
          if (this.marked[k]) continue;
          this.marked[k] = 1;
          if (this.kind[k] === 1) covered++;
          else overran++;
        }
      }
    }
    this.covered += covered;
    this.overran += overran;
    return { covered, overran };
  }

  /** Share of the sheet shaded, 0..1. */
  coverage(): number {
    return this.total ? this.covered / this.total : 0;
  }

  /** Pencil on the table, as a share of the sheet's size. */
  overrun(): number {
    return this.total ? this.overran / this.total : 0;
  }
}

/** How straight a sheet lies in the row: off the line by dy pixels, turned by angle radians. */
export function straightness(dy: number, angle: number): number {
  return Math.max(0, 1 - Math.abs(dy) / 40 - Math.abs(angle) / 0.25);
}

/** The general's measure: an even, full sheet that stays on the paper and lies straight. */
export function leavesScore(coverage: number, overrun: number, straight: number): number {
  const s = 0.55 * Math.min(1, coverage / 0.9) + 0.3 * straight - 1.5 * overrun;
  return Math.max(0, Math.min(1, s + 0.15 * Math.min(coverage, straight)));
}
