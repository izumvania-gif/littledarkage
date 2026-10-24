/**
 * The finale (concept «Финал и второе прохождение»): darkness; the player's replies home surface one by one, none
 * of them sent; the three children's letters that came to nobody; the general's desk with the book of records,
 * the triangles to the player's names and the white envelope; steps and «К стене. В шеренгу»; the cold light on
 * the wall and the same speech word for word; «Назовите свои имена»; the title. There is no «Новая игра»: the name
 * given at this roll call starts the next playthrough.
 *
 * «Шеренга» — the general in the spotlight, the faces of the fallen in the line under new names, the player among
 * them with the same name field as at the start. «Новый генерал» — the player's own rat in the spotlight in the
 * general's cap; the speech types itself and can be neither stopped nor hurried. «Пустая стена» — the general
 * speaks to an empty wall; nobody answers, there is no name field.
 */
import './finale.css';
import { Container, Graphics, type Ticker } from 'pixi.js';
import { dative } from '../../core/names.ts';
import { SPEECH, TYPE_CPS } from '../../content/speech.ts';
import { MATTE, REF_H, REF_W } from '../../render/palette.ts';
import { CaptionPlate, type Cue } from '../../ui/caption.ts';
import { h, nextPress, wait } from '../../ui/dom.ts';
import { showLetter } from '../../ui/letter.ts';
import { buildDesk, type DeskScene } from './desk.ts';
import { beats, CHILDREN_LETTERS, envelopeAddress, inSpot, lineOrder, noticeText, refusedNames, replyHeading, speechLocked, triangleNames, WORDS, type Slot } from './plan.ts';
import type { FinaleContext, FinaleResult } from './types.ts';
import { buildWall, type WallScene } from './wall.ts';

export type { Ending, FinaleContext, FinaleResult, RegisterEntry } from './types.ts';

/** Cut-out animation steps at 12 frames a second. */
const FRAME_MS = 1000 / 12;
const ADVANCE = ['Space', 'Enter', 'NumpadEnter'];

export async function runFinale(ctx: FinaleContext): Promise<FinaleResult> {
  const finale = new Finale(ctx);
  try {
    return await finale.play();
  } finally {
    finale.destroy();
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

class Finale {
  private readonly ctx: FinaleContext;
  private readonly root = new Container();
  private readonly plate: CaptionPlate;
  private readonly offLayout: () => void;
  private readonly onTick: (t: Ticker) => void;
  /** DOM the finale put up besides the plate, removed at the end. */
  private readonly dom: HTMLElement[] = [];
  private wall: WallScene | null = null;
  private desk: DeskScene | null = null;
  private slots: Slot[] = [];

  constructor(ctx: FinaleContext) {
    this.ctx = ctx;
    this.root.addChild(new Graphics().rect(0, 0, REF_W, REF_H).fill(MATTE));
    ctx.stage.root.addChild(this.root);
    this.plate = new CaptionPlate(ctx.ui, ctx.audio, ctx.reduced);
    this.plate.el.hidden = true;
    this.offLayout = ctx.stage.onLayout((fit) => {
      this.plate.position(fit);
      this.desk?.layout(fit);
    });
    let acc = 0;
    let frame = 0;
    this.onTick = (t) => {
      acc += t.deltaMS;
      while (acc >= FRAME_MS) {
        acc -= FRAME_MS;
        frame++;
        if (!ctx.reduced) this.wall?.step(frame);
      }
    };
    ctx.stage.app.ticker.add(this.onTick);
  }

  async play(): Promise<FinaleResult> {
    let newName: FinaleResult['newName'] = null;
    for (const beat of beats(this.ctx.ending, this.ctx.replies.length)) {
      if (beat === 'replies') await this.replies();
      else if (beat === 'children') await this.children();
      else if (beat === 'desk') await this.atDesk();
      else if (beat === 'toWall') await this.toWall();
      else if (beat === 'light') await this.light();
      else if (beat === 'speech') await this.speech();
      else if (beat === 'askNames') await this.locked(() => this.plate.type(WORDS.askNames, [], 'Генерал'));
      else if (beat === 'rollCall') newName = await this.rollCall();
      else if (beat === 'silence') await this.silence();
      else await this.title();
    }
    return { newName };
  }

  destroy(): void {
    this.ctx.stage.app.ticker.remove(this.onTick);
    this.offLayout();
    for (const el of this.dom) el.remove();
    this.plate.el.remove();
    this.desk?.destroy();
    this.wall?.destroy();
    this.root.destroy({ children: true });
  }

  // ---------- the dark ----------

  /** The replies home, surfacing one by one out of the dark; each waits to be read. */
  private async replies(): Promise<void> {
    const { ctx } = this;
    const hint = h('p', { class: 'fn-hint' }, h('span', { class: 'key', text: 'Пробел' }), ' — дальше');
    hint.hidden = true;
    const box = h('section', { class: `fn-dark${ctx.reduced ? ' fn-reduced' : ''}`, attrs: { 'aria-label': 'Ответы домой', 'aria-live': 'polite' } }, hint);
    ctx.ui.append(box);
    this.dom.push(box);
    await wait(ctx.reduced ? 600 : 1600);
    for (const r of ctx.replies) {
      if (!r.text.trim()) continue;
      const card = h(
        'article',
        { class: 'fn-reply' },
        h('p', { class: 'fn-reply-head', text: replyHeading(r.n) }),
        h('p', { class: 'fn-reply-text', text: r.text.trim() }),
        h('p', { class: 'fn-reply-stamp', text: WORDS.replyStamp }),
      );
      box.prepend(card);
      await nextFrame();
      card.classList.add('fn-in');
      // Long enough to see it surface before a press can take it away.
      await wait(ctx.reduced ? 300 : 1700);
      hint.hidden = false;
      await nextPress(ADVANCE, box);
      hint.hidden = true;
      card.classList.add('fn-out');
      await wait(ctx.reduced ? 0 : 550);
      card.remove();
      await wait(ctx.reduced ? 150 : 800);
    }
    box.remove();
  }

  /** The children's letters (2, 6, 17), open on the table in the dark, written to nobody. */
  private async children(): Promise<void> {
    for (const n of CHILDREN_LETTERS) {
      await showLetter(this.ctx.ui, n, { reduced: this.ctx.reduced });
      await wait(this.ctx.reduced ? 150 : 700);
    }
  }

  // ---------- the general's desk ----------

  private async atDesk(): Promise<void> {
    const { ctx, plate } = this;
    const names = triangleNames(ctx.formerNames, ctx.player.name);
    // The triangles are addressed in the dative: the confirmed form for the current name, a guess for the old ones.
    const to = names.map((n) => (n === ctx.player.name && ctx.dative ? ctx.dative : dative(n, ctx.player.fem)));
    const desk = buildDesk(ctx.ui, { register: ctx.register, triangles: to, envelope: envelopeAddress(ctx.player.name, ctx.player.fem) });
    this.desk = desk;
    this.root.addChild(desk.view);
    desk.layout(ctx.stage.fit);
    desk.setLight(0);
    await wait(ctx.reduced ? 200 : 900);
    ctx.audio.click();
    await this.fade((k) => desk.setLight(k), 0, 1, 1100);

    plate.clear();
    plate.el.hidden = false;
    await this.narrate(WORDS.deskBook);
    await this.narrate(WORDS.deskTriangles(names.length));
    plate.show({ speaker: null, style: 'narration', text: WORDS.deskEnvelopes(ctx.ending) });
    await desk.address(envelopeAddress(ctx.player.name, ctx.player.fem), () => ctx.audio.typeKey(), ctx.reduced);
    await wait(ctx.reduced ? 200 : 600);
    await this.narrate(WORDS.deskYours);
    await plate.type(noticeText(ctx.player.name, ctx.player.fem), [], WORDS.notice);
    const struck = desk.strike(ctx.reduced);
    await this.narrate(WORDS.deskStrike);
    await struck;
    await wait(ctx.reduced ? 200 : 600);

    // The lamp goes out.
    ctx.audio.click();
    plate.clear();
    plate.el.hidden = true;
    await this.fade((k) => desk.setLight(k), 1, 0, 500);
    desk.destroy();
    this.desk = null;
  }

  // ---------- the wall ----------

  /** Steps in the dark, then a voice. */
  private async toWall(): Promise<void> {
    const { ctx, plate } = this;
    await wait(ctx.reduced ? 300 : 1200);
    plate.el.hidden = false;
    plate.show({ speaker: null, style: 'narration', text: WORDS.steps });
    for (let i = 0; i < 5; i++) {
      ctx.audio.stomp(1);
      await wait(520);
    }
    await plate.line({ speaker: null, style: 'mono', text: WORDS.toWall });
  }

  /** The cold light comes on: a projector's stutter, or a plain fade without flashes. */
  private async light(): Promise<void> {
    const { ctx, plate } = this;
    this.slots = lineOrder(ctx.ending, ctx.recruits);
    const wall = buildWall(inSpot(ctx.ending), this.slots);
    this.wall = wall;
    this.root.addChild(wall.view);
    wall.setLight(0);
    plate.clear();
    plate.header('1.', 'ПОСТРОЕНИЕ');
    await wait(ctx.reduced ? 200 : 700);
    ctx.audio.click();
    if (ctx.reduced) wall.setLight(1);
    else if (ctx.settings.reduceFlashes) await this.fade((k) => wall.setLight(k), 0, 1, 1400);
    else {
      // Two stutters, well under three a second, then on.
      for (const [k, ms] of [[0.8, 90], [0, 220], [0.5, 70], [0.05, 380]] as const) {
        wall.setLight(k);
        await wait(ms);
      }
      ctx.audio.click();
      await this.fade((k) => wall.setLight(k), 0.3, 1, 350);
    }
    await wait(ctx.reduced ? 200 : 900);
    await this.narrate(WORDS.wall[ctx.ending]);
  }

  /** The speech, word for word and with the same pauses as at the first lineup. */
  private async speech(): Promise<void> {
    const { ctx, plate } = this;
    const wall = this.wall;
    if (!wall) return;
    await this.locked(async () => {
      wall.setPose(wall.speaker, 'speak');
      for (const [i, paragraph] of SPEECH.entries()) {
        const cues: Cue[] =
          i === 0
            ? [
                {
                  at: 'Смирно!',
                  run: () => {
                    for (const p of wall.line) wall.setPose(p, 'attention');
                    wall.setPose(wall.speaker, 'attention');
                    if (wall.line.length) ctx.audio.stomp(wall.line.length);
                  },
                },
                {
                  at: 'Вольно.',
                  run: () => {
                    for (const p of wall.line) wall.setPose(p, 'rest');
                    wall.setPose(wall.speaker, 'speak');
                  },
                },
              ]
            : [];
        await plate.type(paragraph, cues);
        // Without motion the lines come whole; when nobody may hurry the speech it still keeps its own pace.
        if (ctx.reduced && speechLocked(ctx.ending)) await wait((paragraph.length * 1000) / TYPE_CPS);
      }
      wall.setPose(wall.speaker, 'rest');
    });
  }

  /** Each in the line calls out a new name; in «Шеренга» the player gives one too. */
  private async rollCall(): Promise<FinaleResult['newName']> {
    const { ctx, plate } = this;
    const wall = this.wall;
    if (!wall) return null;
    let given: FinaleResult['newName'] = null;
    for (const [i, slot] of this.slots.entries()) {
      const p = wall.line[i];
      if (!p) continue;
      wall.setPose(p, 'speak');
      wall.nudge(i, -10);
      if (slot.kind === 'player') {
        given = await plate.askName(refusedNames(ctx), ctx.player.fem ? 'f' : 'm');
        await plate.callout(given.name);
      } else {
        await plate.callout(slot.name);
      }
      wall.nudge(i, 10);
      wall.setPose(p, 'rest');
    }
    await wait(ctx.reduced ? 300 : 900);
    return given;
  }

  /** Nobody answers. No name field. */
  private async silence(): Promise<void> {
    this.plate.clear();
    if (this.wall) this.wall.setPose(this.wall.speaker, 'attention');
    await wait(4800);
  }

  private async title(): Promise<void> {
    const { ctx, plate } = this;
    plate.el.hidden = true;
    ctx.audio.click();
    const wall = this.wall;
    if (wall) await this.fade((k) => wall.setLight(k), 1, 0, 800);
    await wait(ctx.reduced ? 300 : 1400);
    const hint = h('p', { class: 'fn-hint' }, h('span', { class: 'key', text: 'Пробел' }));
    hint.hidden = true;
    const card = h('section', { class: `fn-title${ctx.reduced ? ' fn-reduced' : ''}`, attrs: { 'aria-live': 'polite' } }, h('h1', { text: WORDS.title }), hint);
    ctx.ui.append(card);
    this.dom.push(card);
    await nextFrame();
    card.classList.add('fn-in');
    await wait(ctx.reduced ? 2000 : 6500);
    hint.hidden = false;
    await nextPress(ADVANCE, card);
  }

  // ---------- helpers ----------

  private narrate(text: string): Promise<void> {
    return this.plate.line({ speaker: null, style: 'narration', text });
  }

  /**
   * Runs `fn` with Space, Enter and clicks on the plate held back when the speech must not be hurried
   * («Новый генерал»): the capture listeners stop them before the plate hears them.
   */
  private async locked(fn: () => Promise<void>): Promise<void> {
    if (!speechLocked(this.ctx.ending)) {
      await fn();
      return;
    }
    const plateEl = this.plate.el;
    const onKey = (e: KeyboardEvent) => {
      if (ADVANCE.includes(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Node && plateEl.contains(e.target)) e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    this.ctx.ui.addEventListener('click', onClick, true);
    // «Пробел — дальше» would be a lie here.
    plateEl.classList.add('fn-locked');
    try {
      await fn();
    } finally {
      window.removeEventListener('keydown', onKey, true);
      this.ctx.ui.removeEventListener('click', onClick, true);
      plateEl.classList.remove('fn-locked');
    }
  }

  /** A fade on the wall clock (Pixi caps slow frames' delta, which would stretch it); instant without motion. */
  private fade(set: (k: number) => void, from: number, to: number, ms: number): Promise<void> {
    if (this.ctx.reduced || ms <= 0) {
      set(to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const stepFade = () => {
        const k = Math.min(1, (performance.now() - start) / ms);
        set(from + (to - from) * k);
        if (k < 1) requestAnimationFrame(stepFade);
        else resolve();
      };
      requestAnimationFrame(stepFade);
    });
  }
}
