#!/usr/bin/env node
// «Короткий тёмный век» for agents. One command, three ways in (as in Eferon):
//   serve   an HTTP server on 127.0.0.1:7367 holding one game (GET /observe, POST /act, POST /new, GET /shot)
//   observe / act <id> [arg] / new / shot <file>   one call to that server, printing the text
//   mcp     a Model Context Protocol server on stdio (tools: observe, act, new_game)
// Options: --url <game url> (default: the local build in apps/game/dist), --profile <dir> (where the save lives),
// --port <n>, --seed <n> (the page's random: draws, battles, the brawl), --headed, --json (the whole observation).
import { LdaGame } from './game.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  const has = v !== undefined && !v.startsWith('--');
  argv.splice(i, has ? 2 : 1);
  return has ? v : true;
};
const url = flag('url');
const profile = flag('profile');
const port = Number(flag('port') ?? process.env.LDA_AGENT_PORT ?? 7367);
const seed = Number(flag('seed') ?? 1);
const headed = !!flag('headed');
const json = !!flag('json');
const [cmd = 'help', ...rest] = argv;
const show = (o) => (json ? JSON.stringify(o, null, 2) : `${o.result ? `> ${o.result}\n\n` : ''}${o.text}`);
const start = () => new LdaGame({ url, profile, headed, seed }).start();

async function serve() {
  const game = await start();
  const { createServer } = await import('node:http');
  let queue = Promise.resolve();
  const one = (fn) => (queue = queue.then(fn, fn)); // one action at a time
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let body = '';
    for await (const chunk of req) body += chunk;
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = { id: body.trim() };
    }
    const q = (k) => data[k] ?? u.searchParams.get(k) ?? undefined;
    const asJson = u.searchParams.has('json') || req.headers.accept?.includes('application/json');
    try {
      const out = await one(async () => {
        switch (u.pathname) {
          case '/observe':
            return game.observe();
          case '/act':
            return game.act(q('id') ?? q('action'), q('arg'));
          case '/new':
            return game.newGame();
          case '/shot':
            return { text: await game.screenshot(q('path') ?? 'lda.png') };
          default:
            return { text: 'Агент-сервер «Короткого тёмного века». GET /observe · POST /act {"id","arg"} · POST /new · GET /shot?path=' };
        }
      });
      res.writeHead(200, { 'content-type': asJson ? 'application/json' : 'text/plain; charset=utf-8' });
      res.end(asJson ? JSON.stringify(out) : `${out.result ? `> ${out.result}\n\n` : ''}${out.text}\n`);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e?.message ?? e));
    }
  });
  server.listen(port, '127.0.0.1', () => process.stderr.write(`Агент-сервер на http://127.0.0.1:${port} (игра: ${game.base})\n`));
  const stop = async () => {
    server.close();
    await game.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function call(path, data) {
  const u = new URL(path, `http://127.0.0.1:${port}`);
  u.searchParams.set('json', '');
  const res = await fetch(u, {
    method: data ? 'POST' : 'GET',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  }).catch(() => {
    throw new Error(`No agent server on port ${port}. Start one with: node agent/lda.mjs serve`);
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const INSTRUCTIONS =
  'Вы играете в «Короткий тёмный век» (по-русски): крысиные солдаты в темноте туннелей, пары «ударник — координатор», казарма между тревогами. ' +
  'Вызывайте observe, затем act с id из списка «Действия» (и аргументом, если действие его просит). Время в игре идёт только когда вы действуете. ' +
  'continue — дальше по строке, say:<n> — ответ, go:<место> — подойти в казарме, ui:/type: — кнопки и поля на экране. ' +
  'В бою координатором: order:<команда>, done, accept/decline; ударником: cmd:<действие>, done (команды от лица ударника: его лево, его право). ' +
  'В нарядах и бунте есть auto/fight — автопилот, если не хотите делать руками.';

/** A minimal MCP server over stdio (JSON-RPC 2.0, one message per line). */
async function mcp() {
  let game = null;
  const ready = async () => (game ??= await start());
  const tools = [
    { name: 'observe', description: 'Look: what the player perceives now (the scene, the line on the caption plate and its choices, the battle as seen in the lamp or smelled in the dark, open windows) and the list of actions. In Russian.', inputSchema: { type: 'object', properties: {} } },
    {
      name: 'act',
      description: 'Do one action from the list returned by observe; returns what happened and the new observation. Time in the game only moves when you act.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Action id, e.g. "continue", "say:2", "go:mailbox", "ui:встать-в-строй", "order:step", "cmd:sniff", "done", "fight".' },
          arg: { type: 'string', description: 'Argument for actions that take one (text to type, seconds to wait, a striker to command).' },
        },
        required: ['id'],
      },
    },
    { name: 'new_game', description: 'Forget everything (the run and the register\'s memory) and start from the first screen.', inputSchema: { type: 'object', properties: {} } },
  ];
  const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
  const fail = (id, message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message } })}\n`);
  const text = (o) => ({ content: [{ type: 'text', text: show(o) }] });
  let queue = Promise.resolve();
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      queue = queue.then(() => handle(msg)).catch(() => undefined);
    }
  });
  async function handle({ id, method, params }) {
    try {
      if (method === 'initialize') reply(id, { protocolVersion: params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'littledarkage', version: '1.0.0' }, instructions: INSTRUCTIONS });
      else if (method === 'tools/list') reply(id, { tools });
      else if (method === 'tools/call') {
        const g = await ready();
        const a = params?.arguments ?? {};
        const out = params.name === 'observe' ? await g.observe() : params.name === 'act' ? await g.act(a.id, a.arg) : params.name === 'new_game' ? await g.newGame() : null;
        if (!out) fail(id, `Unknown tool ${params.name}`);
        else reply(id, text(out));
      } else if (method === 'ping') reply(id, {});
      else if (id !== undefined) fail(id, `Unknown method ${method}`);
    } catch (e) {
      if (id !== undefined) fail(id, String(e?.message ?? e));
    }
  }
  process.stdin.on('end', async () => {
    await queue;
    await game?.close();
    process.exit(0);
  });
}

const help = `«Короткий тёмный век» для агентов

  node agent/lda.mjs serve [--url URL] [--profile DIR] [--port 7367] [--seed N] [--headed]
      Start a headless game and an HTTP server for it.
  node agent/lda.mjs observe            What the player perceives, and the actions available.
  node agent/lda.mjs act <id> [arg]     Do one action; prints what happened and the new view.
  node agent/lda.mjs new                New game (forgets the save and the register).
  node agent/lda.mjs shot <file.png>    Screenshot of what a human would see.
  node agent/lda.mjs mcp                MCP server on stdio (tools: observe, act, new_game).
  Add --json to print the whole observation as JSON.`;

try {
  if (cmd === 'serve') await serve();
  else if (cmd === 'mcp') await mcp();
  else if (cmd === 'observe') console.log(show(await call('/observe')));
  else if (cmd === 'act') console.log(show(await call('/act', { id: rest[0], arg: rest.slice(1).join(' ') || undefined })));
  else if (cmd === 'new') console.log(show(await call('/new', {})));
  else if (cmd === 'shot') console.log((await call(`/shot?path=${encodeURIComponent(rest[0] ?? 'lda.png')}`)).text);
  else console.log(help);
} catch (e) {
  console.error(e.message ?? e);
  process.exit(1);
}
