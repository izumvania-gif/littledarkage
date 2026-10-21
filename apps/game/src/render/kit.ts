/** Textures generated in code (no image files): print speckle, paper grain, soft glows, gradients. */
import { Texture } from 'pixi.js';
import { seededRng } from '../core/rng.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) throw new Error('2D canvas unavailable');
  return [c, x];
}

/** Rough print: light and dark specks over the whole poster. */
export function speckleTexture(w: number, h: number, seed: number): Texture {
  const [c, x] = canvas(w, h);
  const r = seededRng(seed);
  for (let i = 0; i < (w * h) / 300; i++) {
    const light = r() < 0.55;
    x.fillStyle = light ? 'rgba(234,223,198,0.35)' : 'rgba(28,26,24,0.10)';
    const s = 1 + r() * 2;
    x.fillRect(r() * w, r() * h, s, s);
  }
  return Texture.from(c);
}

/** Paper/film grain, tiled. */
export function grainTexture(size: number, seed: number): Texture {
  const [c, x] = canvas(size, size);
  const img = x.createImageData(size, size);
  const r = seededRng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = r() * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 30 + r() * 50;
  }
  x.putImageData(img, 0, 0);
  return Texture.from(c);
}

/** A soft white disc fading to nothing; tint it to colour lamp light or fog. */
export function glowTexture(size: number): Texture {
  const [c, x] = canvas(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export function verticalGradient(w: number, h: number, top: string, bottom: string): Texture {
  const [c, x] = canvas(w, h);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  return Texture.from(c);
}

/** Dark edges, clear middle. */
export function vignetteTexture(w: number, h: number, strength: number): Texture {
  const [c, x] = canvas(w, h);
  const g = x.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  return Texture.from(c);
}
