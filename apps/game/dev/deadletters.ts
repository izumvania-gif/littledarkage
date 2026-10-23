/**
 * Dev page for the box of undelivered letters (not part of the build), with fake letters from other barracks
 * and a fake post office. http://localhost:5173/dev/deadletters.html
 * ?offline=1 — no letters from others; ?mine=0 — no replies; ?answer=ok|wait|invalid|offline — what sending says;
 * ?reduced — no motion; ?large — large text.
 */
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-mono/400.css';
import '@fontsource/rubik-mono-one/400.css';
import '@fontsource/bad-script/400.css';
import '../src/style.css';
import type { BoxLetter } from '../src/net/api.ts';
import { replyAddressee } from '../src/content/deadLetters.ts';
import { openDeadLetters, type MyReply } from '../src/ui/deadLetters.ts';
import { h } from '../src/ui/dom.ts';

const q = new URLSearchParams(location.search);
const ui = document.getElementById('ui')!;
if (q.has('large')) document.documentElement.classList.add('large-text');

const others: BoxLetter[] | null = q.get('offline') === '1'
  ? null
  : [
      { id: 11, to: 'Сестре', text: 'Сестрёнка, у нас тут всё по-старому: диван носим, письма читаем вслух. Не волнуйся. Генерал хорошо говорит.' },
      { id: 12, to: 'Маме', text: 'Мама, я жив. Нас кормят. Я научился ходить с закрытыми глазами, представляешь? Приеду — покажу.' },
      { id: 15, to: 'Незнакомой женщине', text: '<b>Здравствуйте.</b> Это не разметка, а просто текст: игра не должна его исполнять.\n\nВторой абзац.' },
    ];

const mine: MyReply[] = q.get('mine') === '0'
  ? []
  : [
      { n: 9, to: replyAddressee(9), text: 'Звание у меня — рядовая. Пока все рядовые. Тут темно и шумно, но кормят. Напиши, как там наши, кто где.', sent: false },
      { n: 7, to: replyAddressee(7), text: 'Я писала! Честно писала, наверное, почта. У нас концерт был, группа играла ту же песню, только медленнее.', sent: q.has('sent') },
    ];

const answer = (q.get('answer') ?? 'ok') as 'ok' | 'wait' | 'invalid' | 'offline';
const log = h('pre', { attrs: { id: 'log', style: 'position:absolute;bottom:8px;left:8px;margin:0;color:#eadfc6;font:13px monospace;z-index:0' } });
ui.append(log);

const open = async () => {
  const r = await openDeadLetters(ui, {
    reduced: q.has('reduced'),
    others,
    mine,
    send: async (reply) => {
      await new Promise((res) => setTimeout(res, 400));
      log.textContent += `send ${reply.n} → ${answer}\n`;
      return answer === 'offline' ? null : answer;
    },
  });
  log.textContent += `closed: ${JSON.stringify(r)}\n`;
  for (const m of mine) if (r.sent.includes(m.n)) m.sent = true;
  const again = h('button', { class: 'secondary', text: 'Открыть ящик ещё раз', attrs: { type: 'button', id: 'again', style: 'position:absolute;top:16px;left:16px;color:#eadfc6;border-color:#eadfc6' } });
  again.addEventListener('click', () => {
    again.remove();
    void open();
  });
  ui.append(again);
  again.focus();
};
void open();
