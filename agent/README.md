# Агентный режим / Agent mode

«Короткий тёмный век» можно играть программой: ИИ-агентом или автоматическим прогоном. Как в Eferon, игра сама
рассказывает словами, что видит и слышит игрок, и принимает действия по списку.

*The game can be played by a program — an AI agent or an automatic playthrough. As in Eferon, the page itself
says in words what the player perceives and takes actions from a list.*

## Как это устроено / How it works

- `?agent` в адресе игры включает режим агента (`apps/game/src/agent/`). Время в игре идёт только когда агент
  действует: `performance.now`, `requestAnimationFrame` и таймеры заменены виртуальными часами, `Math.random`
  посеян из `?seed=`, поэтому прогон повторяется точь-в-точь. Звук выключен, таймеров нет («без таймера»),
  движения и вспышки смягчены, подписи включены, текст печатается сразу, картинка рисуется, только когда агент
  смотрит.
- `window.ldaAgent.observe()` — что воспринимает игрок: сцена, строка на плашке и ответы, окна на экране (письмо,
  книга учёта, ящик писем, финал), бой словами (поле во вспышке лампы для координатора, запах и голоса в
  темноте для ударника), наряд, драка; что случилось с прошлого взгляда; список действий.
- `window.ldaAgent.act(id, arg)` — сделать одно действие и дать игре идти, пока она снова не ждёт игрока.
  `settle()` — просто дать игре дойти до ожидания.

*`?agent` turns the mode on: a virtual clock (time moves only on actions), a seeded `Math.random`, no sound, no
timers, no flashes, captions on. `observe()` returns the scene in words plus the action list; `act(id, arg)`
does one action and runs the game until it waits again.*

## Действия / Actions

| id | что делает / what it does |
| --- | --- |
| `continue` | дальше по строке (Пробел) / next line |
| `say:<n>` | ответ номер n на плашке / reply n |
| `go:<место>` | подойти к месту в казарме (`go:mailbox`, `go:sofa`…) / walk to a place in the barracks |
| `ui:<кнопка>`, `type:<поле> <текст>`, `choose:<список> <вариант>` | любая кнопка и поле на экране: имя на перекличке, «Так» под «Кому:», письмо (развернуть, прочитать про себя/вслух, спрятать, написать ответ), ящик писем, финал / any button or field on screen |
| `order:<команда> [кому]`, `erase`, `done`, `accept`/`decline`, `auto` | бой координатором: команды от лица ударника (`step`, `step2`, `back`, `left`, `right`, `turnL`, `turnR`, `about`, `jump`, `stay`), принять удар; `auto` — как скомандовал бы другой координатор по той же вспышке / coordinator |
| `cmd:<действие>`, `erase`, `done`, `auto` | бой ударником (`cmd:sniff`, `cmd:jump`, `cmd:cover`…); `auto` — как сказал голос (или по запаху, когда голоса нет) / striker |
| `lift`, `lower`, `left`, `right`, `shade`, `straighten`, `take:<деталь>`, `auto`, `done` | наряды: диван, листья, ручка; `auto` — сделать наряд целиком / duties |
| слипы `ui:…`, `ui:сказать`, `ui:промолчать` | сборка речи / the speech |
| `fight`, `stop`, `restart`, `slow`, `skip`, `surrender`, `strike`, `spare` | бунт: `fight` — автопилот дерётся, «Встать в строй», «Ну? Бей.» — ударить или опустить руки / the mutiny |
| `key <code>` | нажать клавишу, как игрок (`KeyboardEvent.code`) / press a key |
| `wait [секунды]` | подождать / wait |

## Запуск / Running

Сначала собрать игру / build first: `npm ci && npm run build`. Playwright: `cd agent && npm install`
(в облачном контейнере берётся из `/opt/node-tools`, браузер — `/opt/pw-browsers/chromium`; иначе
`LDA_PLAYWRIGHT`, `LDA_CHROMIUM`).

```sh
node agent/lda.mjs serve            # игра в безголовом браузере + HTTP на 127.0.0.1:7367
node agent/lda.mjs observe          # что видно и какие действия есть
node agent/lda.mjs act continue
node agent/lda.mjs act type:ваша-очередь-назовите-свое-имя Иванова
node agent/lda.mjs act order:step
node agent/lda.mjs new              # забыть всё и начать с первого экрана
node agent/lda.mjs shot screen.png  # снимок экрана
node agent/lda.mjs mcp              # MCP-сервер на stdio: observe, act, new_game
```

HTTP: `GET /observe`, `POST /act {"id","arg"}`, `POST /new`, `GET /shot?path=` (`?json` — всё наблюдение JSON).
Игра раздаётся из `apps/game/dist` на 127.0.0.1:7368 (сохранение живёт в localStorage этого адреса и в
`agent/.profile`), или `--url` — развёрнутая игра. `--seed N` — другое зерно случайности. Страница рисуется в
половинном разрешении (`LDA_SCALE=1` — в полном): программный GPU безголового браузера печёт плакатные слои
вчетверо быстрее, а раскладка та же, что на экране 1280×720.

MCP для Claude Code / *MCP in Claude Code*: `claude mcp add lda -- node /path/to/littledarkage/agent/lda.mjs mcp`.

## Автопрогоны / Automatic playthroughs

```sh
node agent/selftest.mjs                     # все варианты
node agent/selftest.mjs --variant mutiny -v # один, с каждым шагом
node agent/selftest.mjs --shots agent/shots # снимки при провале
```

Каждый вариант проходит всю игру с первого экрана — пролог, три цикла, финал — только через observe/act, с
фиксированным зерном, и проверяет концовку, записанную в книгу учёта. Провал — ошибка на странице, экран без
действий, топтание на месте или действие, которое не возвращается.

- `plain` — без бунта, с ответом домой: «Шеренга».
- `mutiny` — «Мы не пойдём», драка, удар: «Новый генерал».
- `fallen` — принимает удары в первом бою, падает и возвращается под новым именем; бунт и «опустить руки»:
  «Пустая стена».

GitHub Actions: `.github/workflows/autorun.yml` (отдельно от CI: на push в main и вручную), снимки при провале — в
артефакте `autorun-screenshots`.

*Each variant plays from the first screen to the finale through observe/act only, with a fixed seed, and checks
the ending the register keeps; it fails on page errors, screens with nothing to do, stalls or hung actions.*
