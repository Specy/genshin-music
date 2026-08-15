# Genshin/Sky Music

A web app for composing, recording, and practicing songs played on the in-game instruments of Genshin Impact and Sky: Children of the Light (and future games), built around on-screen button keyboards that mirror each game's instrument layout.

## Language

### Notes

**Note Id**:
The universal identity of a note in a song: the nominal MIDI number an instrument declares for a button. It is a name in a shared namespace, not necessarily the actual sounding pitch (Genshin's accidental-tuned instruments keep white-key nominal ids; unpitched SFX use assigned ids).
_Avoid_: note index, note number, midi note (ambiguous with true pitch)

**Button**:
One key slot of an instrument: the position of a Note Id in the instrument's authored (ordered) note list. Keybinds and Label Sets attach to Buttons; where a Button appears on screen is its Shape's decision. Songs never store buttons.
_Avoid_: note position, key (ambiguous with keybind and musical key), index

**Sounding Pitch**:
The actual concert pitch of the sample a button plays. An instrument concern (display, future pitch-true export), never a song-format concern.
_Avoid_: base note, real pitch

**Transposition**:
The song-level or per-instrument playback transform (C, Db, … B) applied at play time via playback rate. Stored Note Ids are always pre-transposition (what the button plays at C).
_Avoid_: pitch (alone — overloaded with Sounding Pitch)

### Instruments

**Shape**:
The named on-screen arrangement of an instrument's buttons (`genshin-3x7`, `sky-2x4`, …). Every instrument declares exactly one, explicitly — never inferred from its note count. A Shape owns the button placement (free-form, not necessarily a grid — it receives the instrument's notes and may place them by note content rather than authored order), the interaction/rendering behavior, and the default Label Sets; a game can give the same geometry a different Shape when its behavior differs. What flows out of a keyboard is a note, never a Button.
_Avoid_: layout (overloaded with Label Set), keyboard size

**Label Set**:
The per-button display texts a Shape provides for one naming mode (default key bindings, ABC, numbers, PlayStation, Switch). A property of the Shape, never of the instrument or the song.
_Avoid_: keyboard layout (ambiguous with Shape and with user-rebound keys)

**Note Preset**:
A game-scoped, named note list (per button: Note Id, display note name, glyph) that instruments reference instead of restating shared tables; an instrument may instead declare its notes inline. Authoring vocabulary only — resolved away into each instrument before the app runs.
_Avoid_: kind (the retired term)

**Song Grid**:
The game-canonical rows×columns note grid that song-wide surfaces (composer canvas, sheet visualizer) render, regardless of which instruments the song's tracks use. Every Note Id has exactly one Song-Grid position, fixed by the game itself — never by any instrument. Distinct from any single instrument's Shape.

**Unlisted Instrument**:
An instrument a game ships (fully loadable by songs and the engine) but hides from its instrument menus.

### Songs

**Track**:
One instrument's owned sequence of notes within a song. Every note belongs to exactly one track; doubling a melody on two instruments means two tracks each holding their own notes.
_Avoid_: layer (the legacy bitmask-slot meaning)

**Duration**:
How long a note sounds: an integer column span (≥1) in composed songs, milliseconds from press to release in recorded songs. Stored on every note regardless of whether its instrument can sustain. A composed note's span occupies its Note Id on its track for every covered column — same-id spans on one track never overlap.

**Sustain**:
An instrument's _capability_ to keep sounding while a note is held and to stop sounding on release. Instruments without it always ring out naturally and ignore Duration at playback.
_Avoid_: hold (reserved for the VSRG gameplay mechanic — a scored held lane press, which exists independently of audio sustain)

**Stranded Note**:
A note whose Note Id the track's current instrument doesn't offer. Skipped at playback and visually marked in the composer; never silently rewritten. Exceptions are explicit imports only: legacy files cross-convert through the frozen historic index remap, and new-format cross-game imports octave-fold out-of-range ids while producing the converted copy.

**Similar Instrument**:
The target game's curated counterpart for a source game's instrument — the one a track swaps to during cross-game conversion so the song keeps a comparable timbre. Unmapped instruments fall back to the target's default.

### Composer Canvas Gestures

**Flick**:
A notes-stage drag released while the hand is still moving fast: release velocity, measured over the gesture's trailing instant, at or above the flick threshold. Launches a Coast; a slower release settles on the nearest column as ever. Exists only while smooth scrolling is on and the song is stopped.
_Avoid_: swipe (any drag), fast drag (the drag itself is not the Flick — the release is)

**Coast**:
The decaying glide a Flick launches. Its landing column is fixed at the moment of release — travel derived from release speed, rounded to a whole column, clamped to the song — and it selects columns as it passes them exactly as the drag it continues, never sounding them.
_Avoid_: momentum/inertia scrolling (say Coast for the glide itself)

**Catch**:
A press on the notes stage while a Coast is running. The press itself is the grab: it halts the Coast where it is and owns the scroll from that instant. Released without movement it is a stop, never a click — it selects-and-sounds nothing.
_Avoid_: tap-to-stop "click" (a Catch never takes the click path)

### Composer Playback

**Transport**:
The engine that turns a song's columns into committed audio and advances the Sounding Column. Owns playback time; knows nothing about which notes sound — that stays with the composer.

**Sounding Column**:
The column whose notes the listener is hearing right now — what the selected column _means_ while the song plays. Every playback surface (keyboard flash, playhead, sustain recording, end-of-song) agrees on it by definition.
_Avoid_: current column (ambiguous with edit-time selection), playhead column

**Committed**:
Audio already handed to the audio clock ahead of being heard. Committed audio is retractable until the moment it starts sounding; once started it always rings out — deleting a note never silences its in-flight sound.
_Avoid_: scheduled (says when it was decided, not whether it can still be taken back)
