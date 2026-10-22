/**
 * The windows of «Летопись бунта», drawn the ROSTA way with the barracks' side-view puppets: flat cream, black
 * and red, one picture per caption (the captions themselves are DOM, under the windows).
 */
import { Container, Graphics } from 'pixi.js';
import { look } from '../../content/looks.ts';
import { POSTER } from '../../render/palette.ts';
import { Puppet, type Pose, type PuppetColors } from '../../render/puppet.ts';
import type { Frame } from './chronicle.ts';
import { weaponShape } from './draw.ts';

const INK: PuppetColors = { body: POSTER.black, seam: POSTER.cream, eye: POSTER.cream };
const HERO: PuppetColors = { body: POSTER.red, seam: POSTER.black, eye: POSTER.cream, light: POSTER.cream };

function puppet(face: string, x: number, y: number, s: number, pose: Pose, colors = INK, left = false): Container {
  const p = new Puppet(colors, { general: face === 'general', look: look(face) });
  p.setPose(pose);
  p.root.position.set(x, y);
  p.root.scale.set(left ? -s : s, s);
  return p.root;
}

/** Sun rays from a point, every other wedge red: the ROSTA background for a feat. */
function rays(w: number, h: number, cx: number, cy: number, n = 14): Graphics {
  const g = new Graphics();
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const r = w + h;
    g.poly([cx, cy, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]).fill(POSTER.red);
  }
  const mask = new Graphics().rect(0, 0, w, h).fill(0xffffff);
  g.mask = mask;
  g.addChild(mask);
  return g;
}

/** One window: a cream panel with a black border and its picture. */
export function frameCut(f: Frame, w: number, h: number): Container {
  const c = new Container();
  c.addChild(new Graphics().rect(0, 0, w, h).fill(POSTER.cream));
  const floor = h - 26;
  const art = new Container();
  c.addChild(art);
  switch (f.id) {
    case 'deaf': {
      // The people speak; the general stands with his back to them.
      art.addChild(new Graphics().poly([0, h, 0, h * 0.35, w * 0.62, floor]).fill(POSTER.red));
      art.addChild(puppet('norkin', w * 0.14, floor, 0.95, 'speak'), puppet('korochkina', w * 0.3, floor, 0.9, 'point'), puppet('podvalny', w * 0.46, floor, 0.95, 'speak'));
      art.addChild(puppet('general', w * 0.8, floor, 1.15, 'attention'));
      break;
    }
    case 'weapon': {
      art.addChild(rays(w, h, w / 2, floor));
      // A raised black arm with what it took.
      const arm = new Graphics().poly([w * 0.3, h, w * 0.46, h, w * 0.62, h * 0.32, w * 0.5, h * 0.28]).fill(POSTER.black);
      arm.circle(w * 0.56, h * 0.3, 18).fill(POSTER.black);
      art.addChild(arm);
      if (f.weapon === 'sofa') art.addChild(sofaSide(w * 0.5, h * 0.42, 0.9));
      else if (f.weapon !== 'none' && f.weapon !== 'fists') {
        const wg = weaponShape(new Graphics(), f.weapon, POSTER.black, POSTER.cream, 1);
        wg.scale.set(5.5);
        wg.position.set(w * 0.56, h * 0.3);
        wg.rotation = -1.2;
        art.addChild(wg);
      }
      break;
    }
    case 'tape': {
      const g = new Graphics();
      for (let i = 0; i < 4; i++) g.arc(w * 0.42, h * 0.5, 50 + i * 22, -0.7, 0.7).stroke({ width: 9, color: POSTER.red });
      g.rect(w * 0.12, h * 0.36, w * 0.36, h * 0.3).fill(POSTER.black);
      g.circle(w * 0.21, h * 0.5, 18).circle(w * 0.39, h * 0.5, 18).fill(POSTER.cream);
      g.circle(w * 0.21, h * 0.5, 5).circle(w * 0.39, h * 0.5, 5).fill(POSTER.black);
      art.addChild(g, puppet('general', w * 0.86, floor, 0.75, 'attention'));
      break;
    }
    case 'sofa': {
      art.addChild(new Graphics().rect(0, floor, w, h - floor).fill(POSTER.black));
      for (let i = 0; i < 3; i++) art.addChild(new Graphics().rect(w * 0.7 + i * 10, floor - 70 + i * 22, 30, 5).fill(POSTER.red));
      art.addChild(sofaSide(w * 0.52, floor, 0.75), puppet('player', w * 0.16, floor, 0.85, 'carry', HERO), puppet('norkin', w * 0.28, floor, 0.85, 'carry'));
      break;
    }
    case 'order': {
      art.addChild(new Graphics().poly([w * 0.3, h * 0.34, w, h * 0.12, w, h * 0.62]).fill(POSTER.red));
      art.addChild(new Graphics().moveTo(w * 0.55, h * 0.18).lineTo(w * 0.95, h * 0.56).moveTo(w * 0.95, h * 0.18).lineTo(w * 0.55, h * 0.56).stroke({ width: 12, color: POSTER.cream }));
      art.addChild(puppet('general', w * 0.22, floor, 1.1, 'point'));
      break;
    }
    case 'nagan': {
      art.addChild(new Graphics().circle(w / 2, h * 0.45, w * 0.36).fill(POSTER.red));
      const hand = new Graphics().poly([0, h * 0.62, w * 0.42, h * 0.48, w * 0.46, h * 0.58, 0, h * 0.78]).fill(POSTER.black);
      const gun = weaponShape(new Graphics(), 'nagan', POSTER.black, POSTER.cream, 0.8);
      gun.scale.set(7);
      gun.position.set(w * 0.44, h * 0.5);
      art.addChild(hand, gun);
      break;
    }
    case 'philosopher': {
      // His book and his glasses on the floor, in red.
      const g = new Graphics().ellipse(w / 2, floor - 30, w * 0.4, 34).fill(POSTER.red);
      g.poly([w * 0.24, floor - 54, w * 0.5, floor - 40, w * 0.5, floor - 10, w * 0.24, floor - 24]).fill(POSTER.cream).stroke({ width: 4, color: POSTER.black });
      g.poly([w * 0.5, floor - 40, w * 0.76, floor - 54, w * 0.76, floor - 24, w * 0.5, floor - 10]).fill(POSTER.cream).stroke({ width: 4, color: POSTER.black });
      g.circle(w * 0.36, floor - 92, 14).circle(w * 0.6, floor - 92, 14).stroke({ width: 5, color: POSTER.black }).moveTo(w * 0.36 + 14, floor - 92).lineTo(w * 0.6 - 14, floor - 92).stroke({ width: 4, color: POSTER.black });
      art.addChild(g);
      break;
    }
    case 'waverers': {
      const g = new Graphics().rect(w * 0.08, floor - 46, w * 0.84, 12).fill(POSTER.black).rect(w * 0.08, floor - 120, 10, 120).rect(w * 0.92 - 10, floor - 120, 10, 120).fill(POSTER.black);
      art.addChild(g, puppet('zernov', w * 0.3, floor - 46, 0.85, 'sit'), puppet('kroshkin', w * 0.58, floor - 46, 0.85, 'sit'));
      break;
    }
    case 'heroes': {
      art.addChild(new Graphics().rect(w * 0.7, h * 0.12, 6, floor - h * 0.12).fill(POSTER.black).poly([w * 0.7 + 6, h * 0.12, w * 0.98, h * 0.2, w * 0.7 + 6, h * 0.3]).fill(POSTER.red));
      // A fallen rebel on his back, the white band on his arm.
      const fallen = puppet('norkin', 0, 0, 0.85, 'rest');
      fallen.rotation = Math.PI / 2;
      fallen.position.set(w * 0.12, floor - 12);
      art.addChild(fallen, new Graphics().circle(w * 0.42, floor - 16, 6).fill(POSTER.cream).stroke({ width: 2, color: POSTER.black }));
      break;
    }
    case 'end': {
      if (f.outcome === 'killed') {
        // His cap on the floor, in a red pool.
        const g = new Graphics().ellipse(w / 2, floor - 16, w * 0.42, 30).fill(POSTER.red);
        g.ellipse(w / 2, floor - 40, 46, 14).fill(POSTER.black).rect(w / 2 - 34, floor - 40, 68, 18).fill(POSTER.black).rect(w / 2 - 34, floor - 30, 68, 6).fill(POSTER.cream);
        g.poly([w / 2 + 30, floor - 22, w / 2 + 64, floor - 14, w / 2 + 30, floor - 16]).fill(POSTER.black);
        art.addChild(g);
      } else {
        art.addChild(new Graphics().rect(w * 0.9, 0, 8, floor).fill(POSTER.black).rect(0, floor, w, 8).fill(POSTER.black));
        art.addChild(puppet('general', w * 0.72, floor, 1, 'sit'), puppet('player', w * 0.28, floor, 1.05, 'rest', HERO));
      }
      break;
    }
  }
  c.addChild(new Graphics().rect(0, 0, w, h).stroke({ width: 6, color: POSTER.black }));
  return c;
}

/** The duty's sofa from the side, its feet at (x, y). */
function sofaSide(x: number, y: number, s: number): Graphics {
  const g = new Graphics();
  const k = 2.2 * s;
  g.rect(8 * k, -44 * k, 130 * k, 24 * k).fill(POSTER.red).rect(8 * k, -22 * k, 130 * k, 20 * k).fill(POSTER.red);
  g.rect(0, -34 * k, 14 * k, 34 * k).fill(POSTER.red).rect(132 * k, -34 * k, 14 * k, 34 * k).fill(POSTER.red);
  g.rect(8 * k, -44 * k, 130 * k, 42 * k).stroke({ width: 4, color: POSTER.black });
  g.moveTo(8 * k, -22 * k).lineTo(138 * k, -22 * k).stroke({ width: 3, color: POSTER.black });
  g.position.set(x - 73 * k, y);
  return g;
}
