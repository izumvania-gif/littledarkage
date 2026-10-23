// One self-contained page for moderating the box of undelivered letters, in the game's colours. The token is
// typed in and kept in sessionStorage only; every request sends it as a Bearer header.
export const ADMIN_PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Недошедшие письма · модерация</title>
<style>
  :root { --paper: #e8dcc4; --ink: #1d1a17; --red: #b3261e; --line: #8a7b66; --dim: #4a4238; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 1.5rem; background: #141210; color: var(--ink); font: 16px/1.5 "PT Mono", ui-monospace, Menlo, Consolas, monospace; }
  main { max-width: 52rem; margin: 0 auto; background: var(--paper); padding: 1.25rem 1.5rem 2rem; }
  h1 { margin: 0 0 1rem; font-size: 1.05rem; letter-spacing: .18em; text-transform: uppercase; color: var(--red); }
  .bar { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-bottom: 1rem; }
  input, button { font: inherit; color: var(--ink); background: #f6efe0; border: 2px solid var(--ink); padding: .3rem .7rem; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 3px solid var(--red); outline-offset: 2px; }
  [role="tab"][aria-selected="true"] { background: var(--ink); color: var(--paper); }
  .approve { border-color: var(--ink); }
  .reject { border-color: var(--red); color: var(--red); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { margin: 0 0 1rem; padding: .8rem 1rem; background: #f6efe0; border-left: 4px solid var(--line); }
  .to { margin: 0 0 .4rem; color: var(--dim); }
  .text { margin: 0 0 .7rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  .meta { color: var(--dim); font-size: .85rem; margin-left: .5rem; }
  #status { min-height: 1.5em; color: var(--dim); }
</style></head><body><main>
<h1>Ящик недошедших писем</h1>
<div class="bar">
  <label for="token">Токен</label><input id="token" type="password" size="28" autocomplete="off">
  <span role="tablist" aria-label="Какие письма">
    <button role="tab" data-status="pending" aria-selected="true">На проверке</button>
    <button role="tab" data-status="approved" aria-selected="false">Одобрены</button>
    <button role="tab" data-status="rejected" aria-selected="false">Отклонены</button>
  </span>
  <button id="load">Загрузить</button>
</div>
<p id="status" role="status"></p>
<ul id="list"></ul>
<script>
const $ = (id) => document.getElementById(id);
let status = 'pending';
$('token').value = sessionStorage.getItem('lda.admin') || '';
const headers = () => ({ authorization: 'Bearer ' + $('token').value, 'content-type': 'application/json' });
const ACTIONS = { pending: ['approved', 'rejected'], approved: ['rejected'], rejected: ['approved'] };
const LABELS = { approved: 'Одобрить', rejected: 'Отклонить' };
async function load() {
  sessionStorage.setItem('lda.admin', $('token').value);
  const res = await fetch('/api/admin/letters?status=' + status, { headers: headers() });
  const list = $('list');
  list.textContent = '';
  if (!res.ok) { $('status').textContent = res.status === 401 ? 'Неверный токен.' : 'Ошибка ' + res.status; return; }
  const { letters } = await res.json();
  $('status').textContent = letters.length ? 'Писем: ' + letters.length : 'Пусто.';
  for (const l of letters) {
    const li = document.createElement('li');
    const to = document.createElement('p');
    to.className = 'to';
    to.textContent = 'Кому: ' + l.to;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = '№ ' + l.id + ' · ' + new Date(l.createdAt).toLocaleString('ru');
    to.append(meta);
    const text = document.createElement('p');
    text.className = 'text';
    text.textContent = l.text;
    li.append(to, text);
    for (const s of ACTIONS[status]) {
      const b = document.createElement('button');
      b.className = s === 'approved' ? 'approve' : 'reject';
      b.textContent = LABELS[s];
      b.onclick = async () => {
        const r = await fetch('/api/admin/letters/' + l.id, { method: 'POST', headers: headers(), body: JSON.stringify({ status: s }) });
        if (r.ok) li.remove();
        else $('status').textContent = 'Ошибка ' + r.status;
      };
      li.append(b, document.createTextNode(' '));
    }
    list.append(li);
  }
}
for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.onclick = () => {
    status = tab.dataset.status;
    for (const t of document.querySelectorAll('[role="tab"]')) t.setAttribute('aria-selected', String(t === tab));
    load();
  };
}
$('load').onclick = load;
$('token').addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
</script></main></body></html>`;
