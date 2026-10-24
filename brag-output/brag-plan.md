# /brag — «Короткий тёмный век»

**What it is.** A browser game where rat soldiers fight in pitch-dark tunnels in pairs: one is blindfolded and walks, the other sees the field only in the flashes of a red lamp and may only speak — three commands a turn, then silence.

**Who it's for.** Russian-speaking players of narrative games with one hard mechanic at their heart (Papers, Please; Pathologic; This War of Mine), and the people who played the live role-play it comes from.

**What sets it apart.** The fight is blind trust, not reflexes. Everything is drawn in code as a ROSTA poster pasted over a cut-out paper barracks, and the poster tears as the game goes on. The band in the barracks is synthesized too.

**The claim.** The general's own line from the opening speech: «Запомните его голос: лица в туннеле вы не увидите.» It is the whole game in one sentence.

**Spoiler rule.** Nothing past the first cycle: no names coming back, no letters 14–15, no confession, no mutiny, no finale, no new general. Only the opening lineup, the alarm's two seats (the coordinator from battle 1; the striker from battle 2, the player's first turn as striker, with every frame naming Пышкин — a cycle-2 name — left out), the barracks under the disco lights, the player's first letter unfolding, and the poster tearing (the same room, no story beyond it).

**Tone.** `cinematic`, held back: trailer-scale poster type and hard cuts on the downbeat, but the game's own quiet — the typewriter, one lamp click, then the band.

**Visual identity.** The game's real renders, captured from the dev server at 1920×1080. The game's own palette (cream #eadfc6, ink #1c1a18, poster red #c62f24, matte #0f0e0d) and fonts: Rubik Mono One for the ROSTA captions, PT Mono for the general's typewriter, PT Serif for names. The hook uses the game's real caption plate (style.css) over black.

**Music.** The game's own synthesized band, «Номер группы» (the first concert, A minor, 104 bpm): the tail of the tuning-up and the count-in under the hook, the full-band intro on the reveal, the chorus from the rule card on, and the final A-minor hit on the title. Beat 0.577 s, bar 2.308 s; the reveal lands on beat 9, so every cut sits on a beat counted from frame 0. Sound effects are the game's own synthesis (engine/audio.ts) rendered offline: typewriter keys, the line-end bell, the lamp click, the lineup's stomp.

**Hook (0–5.2 s).** Black. The caption plate types the general's two lines; a lamp clicks; on the downbeat the line stamps its heels and the poster lights up.

**Share caption.** See `share-copy.txt`.

**Poster.** The outro frame at 20.9 s (the poster half torn over the dim «truth» barracks, the title on the plate), saved as `brag.jpg` and baked into frame 0.

## Storyboard (23 s, 1920×1080, 30 fps)

| # | Time (beats) | Scene | On screen | Sound |
|---|---|---|---|---|
| 1 | 0.00–5.19 (0–9) | Hook | Black frame; the real caption plate: «Генерал» / typed «Посмотрите на того, кто стоит справа от вас.» then «Запомните его голос: лица в туннеле вы не увидите.» | The band tuning up, typewriter keys, the bell, the count-in; a lamp click on beat 8.5 |
| 2 | 5.19–9.81 (9–17) | Reveal | The lineup under the pristine ROSTA poster, slow push-in; title band **КОРОТКИЙ ТЁМНЫЙ ВЕК** · «Игра о крысиных солдатах в темноте туннелей» | Stomp of the line + full-band intro (crash) |
| 3 | 9.81–12.12 (17–21) | One sees | The coordinator's field in the dark, the lamp's real flash frame laid over it on every beat and fading (the field only; the pad stays in planning). **Один видит — во вспышках лампы.** | Lamp click on each beat under the intro riff |
| 4 | 12.12–14.42 (21–25) | One walks | The striker's darkness, the partner's lines on plates: Норкин's «чуток — это шаг», then his orders in his hand. **Другой идёт вслепую. На голос.** | Riff continues, low |
| 5 | 14.42–16.73 (25–29) | The rule | The coordinator's real command pad filling with orders over the field. **Три команды за ход. Потом — молчать.** | Chorus comes in |
| 6 | 16.73–19.04 (29–33) | The barracks | The barracks under the disco (the only full-colour moment), cutting on half-beats as the lights change: **Между тревогами — казарма.** Then a letter from home unfolding fold by fold on the eighth notes: **Письма из дома.** | Chorus |
| 7 | 19.04–23.00 (33–) | Outro | The barracks with the poster tearing frame by frame; title **КОРОТКИЙ ТЁМНЫЙ ВЕК** · «Браузерная игра по живой ролевой · играть в наушниках» | Final A-minor hit on beat 37, ring-out |
