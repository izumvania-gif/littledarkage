/** Krypotkin on the wall: profile with the big white beard and round glasses (after Kropotkin, not Lenin). */
import { Container, Graphics, Text } from 'pixi.js';
import { POSTER } from './palette.ts';

export interface PortraitColors {
  paper: number;
  field: number;
  ink: number;
}

export function krypotkinPoster(w: number, h: number, c: PortraitColors = { paper: POSTER.cream, field: POSTER.red, ink: POSTER.black }): Container {
  const root = new Container();
  const frame = new Graphics().rect(0, 0, w, h).fill(c.paper);
  const fieldH = h - 40;
  frame.rect(6, 6, w - 12, fieldH - 6).fill(c.field);
  root.addChild(frame);

  const s = Math.min((w - 12) / 90, (fieldH - 6) / 100);
  const face = new Graphics()
    // Head in profile, ear.
    .moveTo(18, 62).quadraticCurveTo(44, 62, 80, 46).quadraticCurveTo(50, 20, 28, 22).quadraticCurveTo(10, 34, 18, 62).closePath().fill(c.ink)
    .circle(26, 18, 10).fill(c.ink)
    // Beard.
    .moveTo(22, 52).quadraticCurveTo(18, 84, 32, 88).quadraticCurveTo(42, 100, 52, 90).quadraticCurveTo(62, 86, 60, 66)
    .quadraticCurveTo(62, 58, 56, 54).quadraticCurveTo(40, 60, 22, 52).closePath().fill(c.paper)
    // Glasses and whiskers.
    .circle(52, 38, 6).stroke({ width: 2.2, color: c.paper })
    .moveTo(46, 37).lineTo(32, 31).stroke({ width: 2.2, color: c.paper })
    .moveTo(72, 49).lineTo(88, 44).moveTo(72, 50).lineTo(88, 51).moveTo(71, 51).lineTo(85, 57).stroke({ width: 1.2, color: c.ink });
  face.scale.set(s);
  face.position.set(6 + (w - 12 - 90 * s) / 2, 6 + (fieldH - 6 - 100 * s) / 2 + 4);
  root.addChild(face);

  const style = { fontFamily: '"Rubik Mono One", "Arial Black", sans-serif', fontSize: Math.round(w / 11), fill: c.ink, align: 'center' as const };
  const slogan = new Text({ text: 'СИЛА — В\nСПЛОЧЁННОСТИ', style: { ...style, lineHeight: Math.round(w / 9) }, resolution: 2 });
  slogan.anchor.set(0.5, 0);
  slogan.position.set(w / 2, fieldH + 4);
  root.addChild(slogan);

  root.addChild(new Graphics().rect(0, 0, w, h).stroke({ width: 3, color: c.ink }));
  return root;
}
