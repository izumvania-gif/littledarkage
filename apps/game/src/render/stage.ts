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

/**
 * The graphics card may drop the WebGL context (a driver reset, too many tabs). The pictures are drawn in code
 * and the save is safe, so the honest answer is to say so and start the page again once the context is back:
 * the scene replays from its start, a battle from its last turn.
 */
function watchContext(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    const layer = document.getElementById('ui') ?? document.body;
    if (layer.querySelector('.context-lost')) return;
    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = 'Перезагрузить';
    button.addEventListener('click', () => location.reload());
    const plate = document.createElement('section');
    plate.className = 'intro context-lost';
    plate.setAttribute('role', 'alertdialog');
    const col = document.createElement('div');
    col.className = 'intro-col';
    const title = document.createElement('h1');
    title.textContent = 'Картинка пропала';
    const text = document.createElement('p');
    text.className = 'lead';
    text.textContent = 'Видеокарта сбросила изображение. Игра сохранена: после перезагрузки сцена начнётся сначала, бой — с последнего хода.';
    col.append(title, text, button);
    plate.append(col);
    layer.append(plate);
    button.focus();
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
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
  watchContext(app.canvas);
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
