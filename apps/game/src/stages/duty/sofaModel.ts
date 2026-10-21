/**
 * «Переставить мебель» without pictures: two carriers, one sofa, the general's orders. Kept free of Pixi so
 * it can be tested. Positions are whole steps from where the sofa stood («место» is 0, left is negative).
 *
 * The pair is in step when both ends stand at the same step; while the sofa is up, being out of step strains
 * it, and a strain that lasts (or reaches two steps) drops the sofa. The partner follows the orders his own
 * way: a moment late, one step at a time. «Без таймера»: he waits for the player instead, and only a strain
 * of two steps drops the sofa.
 */

export type Order = { kind: 'lift' } | { kind: 'lower' } | { kind: 'move'; to: number };

export type Action = 'left' | 'right' | 'lift' | 'lower';

export type SofaEvent =
  | { t: 'step'; who: 'player' | 'partner'; dir: -1 | 1 }
  | { t: 'lift' | 'lower'; who: 'player' | 'partner' }
  /** The player tried to walk off with the sofa still on the floor. */
  | { t: 'blocked' }
  /** The player moved with no order to move. */
  | { t: 'early' }
  | { t: 'drop' };

export interface Pace {
  /** Seconds before the partner starts on an order. */
  react: number;
  /** Seconds per step (and per lift or lower). */
  step: number;
}

/** How long a pair may be out of step while carrying before the sofa goes. */
export const GRACE = 0.9;

export class SofaModel {
  /** The player's end and the partner's end, in steps. */
  p = 0;
  q = 0;
  /** Is each end up? */
  lp = false;
  lq = false;
  order: Order | null = null;

  drops = 0;
  early = 0;
  /** Moves where the player stepped before the partner did (led) or after him (followed). */
  led = 0;
  followed = 0;
  /** Seconds out of step with the sofa up, and seconds of carrying in all. */
  strained = 0;
  carried = 0;

  private readonly pace: Pace;
  private readonly untimed: boolean;
  private wait = 0;
  private strain = 0;
  private partnerMoved = false;
  private playerMoved = false;

  constructor(pace: Pace, untimed = false) {
    this.pace = pace;
    this.untimed = untimed;
  }

  /** The general gives an order: the partner starts on it after a moment. */
  give(order: Order): void {
    this.order = order;
    this.wait = this.pace.react;
    this.partnerMoved = false;
    this.playerMoved = false;
  }

  /** Is the current order carried out by both? */
  done(): boolean {
    const o = this.order;
    if (!o) return true;
    if (o.kind === 'lift') return this.lp && this.lq;
    if (o.kind === 'lower') return !this.lp && !this.lq;
    return this.p === o.to && this.q === o.to && this.lp && this.lq;
  }

  /** A key press of the player. */
  act(a: Action): SofaEvent[] {
    const ev: SofaEvent[] = [];
    if (a === 'lift' || a === 'lower') {
      const up = a === 'lift';
      if (this.lp !== up) {
        this.lp = up;
        ev.push({ t: a, who: 'player' });
      }
      return ev;
    }
    const dir = a === 'left' ? -1 : 1;
    if (!this.lp && !this.lq) {
      ev.push({ t: 'blocked' });
      return ev;
    }
    const o = this.order;
    if (!o || o.kind !== 'move' || this.p === o.to) {
      this.early += 1;
      ev.push({ t: 'early' });
    } else if (!this.playerMoved) {
      if (this.partnerMoved) this.followed += 1;
      else this.led += 1;
    }
    this.playerMoved = true;
    this.p += dir;
    ev.push({ t: 'step', who: 'player', dir });
    ev.push(...this.check(0));
    return ev;
  }

  /** Time passes: the partner works on the order; a strain is counted, and may drop the sofa. */
  tick(dt: number): SofaEvent[] {
    const ev: SofaEvent[] = [];
    const o = this.order;
    if (o) this.carried += dt;
    if (o && !this.partnerDone(o)) {
      this.wait -= dt;
      if (this.wait <= 0 && this.partnerMayGo(o)) {
        this.wait = this.pace.step;
        ev.push(...this.partnerStep(o));
      }
    }
    ev.push(...this.check(dt));
    return ev;
  }

  /** 0..1: drops cost most, then time out of step, then moving without an order. */
  score(): number {
    const strain = this.carried > 0 ? this.strained / this.carried : 0;
    return Math.max(0, Math.min(1, 1 - 0.3 * this.drops - 0.6 * strain - 0.04 * this.early));
  }

  private partnerDone(o: Order): boolean {
    if (o.kind === 'lift') return this.lq;
    if (o.kind === 'lower') return !this.lq;
    return this.q === o.to && this.lq;
  }

  /** «Без таймера»: he doesn't go ahead of the player, so nothing is ever rushed. */
  private partnerMayGo(o: Order): boolean {
    if (!this.untimed) return true;
    if (o.kind === 'lift') return this.lp;
    if (o.kind === 'lower') return !this.lp;
    if (!this.lq) return this.lp;
    return this.p !== this.q;
  }

  private partnerStep(o: Order): SofaEvent[] {
    if (o.kind === 'lift' || (o.kind === 'move' && !this.lq)) {
      this.lq = true;
      return [{ t: 'lift', who: 'partner' }];
    }
    if (o.kind === 'lower') {
      this.lq = false;
      return [{ t: 'lower', who: 'partner' }];
    }
    const dir = o.to < this.q ? -1 : 1;
    this.q += dir;
    this.partnerMoved = true;
    return [{ t: 'step', who: 'partner', dir }, ...this.check(0)];
  }

  private check(dt: number): SofaEvent[] {
    const up = this.lp || this.lq;
    if (!up || this.p === this.q) {
      this.strain = 0;
      return [];
    }
    this.strain += dt;
    // «Без таймера» the partner waits for the player by design: his lag is not the player's fault.
    if (!this.untimed) this.strained += dt;
    const far = Math.abs(this.p - this.q) >= 2;
    if (!far && (this.untimed || this.strain <= GRACE)) return [];
    // The sofa slips out of the player's hands and lands at the partner's end.
    this.drops += 1;
    this.lp = false;
    this.lq = false;
    this.p = this.q;
    this.strain = 0;
    return [{ t: 'drop' }];
  }
}
