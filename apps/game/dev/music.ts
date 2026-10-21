/** Dev stand for the music (not part of the build): play, stop and duck the tracks; render and measure them. */
import { TRACKS, type TrackId } from '../src/content/tracks.ts';
import { AudioEngine } from '../src/engine/audio.ts';
import { Music } from '../src/engine/music.ts';
import { renderTrack, type Rendered } from '../src/engine/music/render.ts';

const audio = new AudioEngine();
const music = new Music(audio);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
const ids = Object.keys(TRACKS) as TrackId[];
const wear = () => Number($<HTMLInputElement>('wear').value);

$('unlock').addEventListener('click', () => {
  audio.unlock('headphones');
  status.textContent = 'Звук включён.';
});
$<HTMLInputElement>('wear').addEventListener('input', () => ($('wearv').textContent = String(wear())));
$<HTMLInputElement>('duck').addEventListener('change', (e) => music.duck((e.target as HTMLInputElement).checked));

for (const id of ids) {
  const row = document.createElement('div');
  row.className = 'row';
  const play = button(`▶ ${TRACKS[id].title}`, async () => {
    status.textContent = `Рендер «${TRACKS[id].title}»…`;
    const t = performance.now();
    await music.play(id, { wear: wear(), loop: $<HTMLInputElement>('loop').checked });
    status.textContent = `Играет «${TRACKS[id].title}» (готово за ${((performance.now() - t) / 1000).toFixed(1)} с).`;
  });
  row.append(play, button('стоп (затухание)', () => void music.stop()), button('стоп (кнопка)', () => void music.stop({ click: true })));
  $('tracks').append(row);
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

const rendered = new Map<TrackId, Rendered>();
const fmt = (db: number) => db.toFixed(1);

async function renderAll(w = wear()) {
  const rows = [];
  for (const id of ids) {
    const r = await renderTrack(TRACKS[id], { wear: w });
    rendered.set(id, r);
    rows.push({ id, renderSeconds: r.renderSeconds, duration: r.buffer.duration, peakDb: r.peakDb, rmsDb: r.rmsDb, sections: r.sections.map((s) => ({ name: s.name, t: s.t, rmsDb: s.rmsDb })) });
  }
  return rows;
}

$('measure').addEventListener('click', async () => {
  status.textContent = 'Рендер всех треков…';
  const rows = await renderAll();
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>трек</th><th>рендер, с</th><th>длина, с</th><th>пик, дБFS</th><th>RMS, дБFS</th><th>части</th></tr>';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.id}</td><td>${r.renderSeconds.toFixed(2)}</td><td>${r.duration.toFixed(1)}</td><td>${fmt(r.peakDb)}</td><td>${fmt(r.rmsDb)}</td><td>${r.sections.map((s) => `${s.name} ${fmt(s.rmsDb)}`).join('<br>')}</td>`;
    table.append(tr);
  }
  $('out').replaceChildren(table);
  status.textContent = 'Готово.';
});

/** 16-bit PCM WAV of a rendered track, base64, for listening outside the browser. */
function wav(id: TrackId): string {
  const r = rendered.get(id);
  if (!r) throw new Error(`render ${id} first`);
  const b = r.buffer;
  const n = b.length;
  const data = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  data.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 2, true);
  data.setUint32(24, b.sampleRate, true);
  data.setUint32(28, b.sampleRate * 4, true);
  data.setUint16(32, 4, true);
  data.setUint16(34, 16, true);
  str(36, 'data');
  data.setUint32(40, n * 4, true);
  const l = b.getChannelData(0);
  const rr = b.getChannelData(1);
  for (let i = 0; i < n; i++) {
    data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i]!)) * 32767, true);
    data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, rr[i]!)) * 32767, true);
  }
  const bytes = new Uint8Array(data.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

(window as unknown as { musicDev: unknown }).musicDev = { renderAll, wav, music, audio };
