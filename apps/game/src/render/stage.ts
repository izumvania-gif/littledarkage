/** The Pixi application: one canvas filling the window, the 1280×720 frame scaled to fit and centred. */
import { Application, Container } from 'pixi.js';
import { MATTE, REF_H, REF_W } from './palette.ts';

export interface Fit {
  /** Screen pixels per reference pixel. */
  scale: number;
  x: number;
  y: number;
}

export interface Stage {
  app: Application;
  root: Container;
  fit: Fit;
  /** Calls cb now and on every resize; returns the unsubscribe (battle stages come and go). */
  onLayout(cb: (fit: Fit) => void): () => void;
}

export async function createStage(host: HTMLElement): Promise<Stage> {
  const app = new Application();
  await app.init({
    background: MATTE,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 1.5),
    autoDensity: true,
  });
  host.appendChild(app.canvas);
  const root = new Container();
  app.stage.addChild(root);
  const fit: Fit = { scale: 1, x: 0, y: 0 };
  const listeners: ((f: Fit) => void)[] = [];
  const layout = () => {
    const w = app.screen.width;
    const h = app.screen.height;
    fit.scale = Math.min(w / REF_W, h / REF_H);
    fit.x = Math.round((w - REF_W * fit.scale) / 2);
    fit.y = Math.round((h - REF_H * fit.scale) / 2);
    root.scale.set(fit.scale);
    root.position.set(fit.x, fit.y);
    for (const cb of listeners) cb(fit);
  };
  app.renderer.on('resize', layout);
  layout();
  return {
    app,
    root,
    fit,
    onLayout(cb) {
      listeners.push(cb);
      cb(fit);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };
}
