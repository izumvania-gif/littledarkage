// One running game in a headless browser, in agent mode (`?agent`): observe() and act() are the page's own
// `window.ldaAgent`, which runs on a virtual clock, so nothing happens between calls (as in Eferon).
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(HERE, '../apps/game/dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };

/**
 * Playwright from agent/node_modules (`npm install` here), or from a folder that has it: LDA_PLAYWRIGHT, NODE_PATH
 * (ES modules ignore it, so it is looked up by hand) or the container's /opt/node-tools.
 */
async function playwright() {
  try {
    return await import('playwright');
  } catch {
    const req = createRequire(import.meta.url);
    for (const dir of [process.env.LDA_PLAYWRIGHT, ...(process.env.NODE_PATH ?? '').split(':'), '/opt/node-tools/node_modules'].filter(Boolean)) {
      try {
        return req(req.resolve('playwright', { paths: [dir] }));
      } catch {
        // the next folder
      }
    }
    throw new Error('Playwright not found: run "npm install" in agent/, or set LDA_PLAYWRIGHT to a folder with node_modules/playwright.');
  }
}

/**
 * Serve the built game (apps/game/dist) locally; the /api calls fail soft (the game plays offline).
 * On a fixed port by default: the save lives in the page's localStorage, which belongs to the origin, so a port
 * that changed between runs would start every run with an empty save.
 */
function serveDist(port = 7368) {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}. Run "npm run build" in the repo root first, or pass --url.`);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"offline"}');
      return;
    }
    let file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    const listen = (p) => server.listen(p, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` }));
    server.once('error', (e) => {
      if (e.code !== 'EADDRINUSE' || port === 0) return fail(e);
      process.stderr.write(`[lda] port ${port} is busy; serving on a free port instead — this run's save will not be found by the next one.\n`);
      listen(0);
    });
    listen(port);
  });
}

/** The page went away under an evaluate (the finale reloads it for the next roll call). */
const reloaded = (e) => /Execution context was destroyed|navigation|Target closed|context.*destroyed/i.test(String(e?.message ?? e));

export class LdaGame {
  /**
   * @param {{ url?: string, profile?: string, headed?: boolean, executablePath?: string, gamePort?: number, seed?: number, debug?: boolean }} opts
   *   url: a deployed game instead of the local build; profile: where the save lives between runs;
   *   gamePort: where the local build is served (default 7368; the save belongs to that origin);
   *   seed: the page's Math.random (draws, battles, the brawl), so a run replays the same.
   */
  constructor(opts = {}) {
    this.opts = opts;
    /** Errors thrown in the page since the last look (the selftest fails on them). */
    this.errors = [];
  }

  async start() {
    const { url, profile = resolve(HERE, '.profile'), headed = false } = this.opts;
    if (!url) this.local = await serveDist(this.opts.gamePort);
    this.base = url ?? this.local.url;
    mkdirSync(profile, { recursive: true });
    const { chromium } = await playwright();
    this.context = await chromium.launchPersistentContext(profile, {
      headless: !headed,
      viewport: { width: 1280, height: 720 },
      // Half the pixels on each side: the software GPU bakes the poster layers four times faster, the page lays
      // out exactly as on a 1280×720 screen.
      deviceScaleFactor: Number(process.env.LDA_SCALE ?? 0.5),
      executablePath: this.opts.executablePath ?? process.env.LDA_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    this.watch(this.page);
    await this.load();
    return this;
  }

  watch(page) {
    page.on('pageerror', (e) => {
      this.errors.push(e.message);
      process.stderr.write(`[game] ${e.message}\n`);
    });
    // «Leave the battle?» on a reload in a battle or the brawl, and any other dialog: yes.
    page.on('dialog', (d) => void d.accept().catch(() => undefined));
  }

  url() {
    const target = new URL(this.base);
    target.searchParams.set('agent', '');
    target.searchParams.set('seed', String(this.opts.seed ?? 1));
    if (this.opts.debug) target.searchParams.set('debug', '');
    return target.toString();
  }

  async load() {
    await this.page.goto(this.url());
    await this.ready();
  }

  /** Waits for the bridge, then lets the opening run (the tab check listens 350 ms of game time) until it waits. */
  async ready() {
    for (let i = 0; i < 300; i++) {
      const up = await this.page.evaluate(() => !!window.ldaAgent).catch(() => false);
      if (up) {
        await this.page.evaluate(() => window.ldaAgent.settle());
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('The game did not start in agent mode.');
  }

  /** What the player perceives now, with the list of actions. */
  async observe() {
    try {
      return await this.page.evaluate(() => window.ldaAgent.observe());
    } catch (e) {
      if (!reloaded(e)) throw e;
      await this.page.waitForLoadState('domcontentloaded');
      await this.ready();
      return this.page.evaluate(() => window.ldaAgent.observe());
    }
  }

  /** Do one action (an id from the list; `arg` when it takes one) and look again. */
  async act(id, arg) {
    try {
      return await this.page.evaluate(([id, arg]) => window.ldaAgent.act(id, arg), [id, arg ?? undefined]);
    } catch (e) {
      if (!reloaded(e)) throw e;
      // The finale ends with a reload: the next roll call.
      await this.page.waitForLoadState('domcontentloaded');
      await this.ready();
      return { ...(await this.page.evaluate(() => window.ldaAgent.observe())), result: 'Страница перезагрузилась: новая перекличка.' };
    }
  }

  /** Forget everything (the run and the register's memory) and start from the first screen. */
  async newGame() {
    await this.page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('lda.')) localStorage.removeItem(k);
    });
    await this.load();
    return this.observe();
  }

  /**
   * What a human would see. Straight from the compositor: Playwright's own screenshot waits on animation frames,
   * which the virtual clock holds back.
   */
  async screenshot(path) {
    await this.page.evaluate(() => window.ldaAgent?.draw()).catch(() => undefined);
    this.cdp ??= await this.context.newCDPSession(this.page);
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  async close() {
    await this.context?.close().catch(() => undefined);
    this.local?.server.close();
  }
}
