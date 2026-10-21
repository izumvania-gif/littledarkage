// «Короткий тёмный век»: the script. Scenes (src/content/scenes.ts) enter knots directly.
// State lives in TypeScript and is read and changed through these functions; ink keeps none of its own,
// so any scene can be played again from its start.
// Tags: #speaker:<id> (no speaker = narration), #do:<action> (staging, see src/game/actions.ts).
// Every knot ends in -> DONE. Choices are [bracketed]: the player's words are shown only when written out
// as a line with #speaker:player.

EXTERNAL name()
EXTERNAL fem()
EXTERNAL trust(id)
EXTERNAL trust_add(id, by)
EXTERNAL flag(f)
EXTERNAL flag_set(f)
EXTERNAL hp()

INCLUDE prologue.ink
INCLUDE cycle1.ink

-> DONE
