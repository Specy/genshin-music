# Genshin/Sky Music

A web app for composing, recording, and practicing songs played on the in-game instruments of Genshin Impact and Sky: Children of the Light (and future games), built around on-screen button keyboards that mirror each game's instrument layout.

## Language

### Notes

**Note Number**:
The universal identity of a note in a song: an absolute MIDI number on one shared axis, stored Basepoint-included. For a Pitched Button it is the Sounding Pitch the listener hears; for an Assigned Button it is the button's Nominal Id carried onto the axis by the Basepoint.
_Avoid_: note id (the retired nominal storage identity), note index, midi note (ambiguous with MIDI-file events)

**Nominal Id**:
The nominal MIDI number an instrument declares for a button — a name in the game's grid namespace, not a promise about sound. The currency of button correspondence: instrument swaps, Song-Grid rows, MIDI-import snapping and legacy-format decoding speak Nominal Ids. Songs never store them.
_Avoid_: note id (retired), button number

**Button**:
One key slot of an instrument: the position of a note (with its Nominal Id) in the instrument's authored (ordered) note list. Keybinds and Label Sets attach to Buttons; where a Button appears on screen is its Shape's decision. Songs never store buttons.
_Avoid_: note position, key (ambiguous with keybind and musical key), index

**Pitched Button**:
A button that plays one single pitch. Pressing it stores that Sounding Pitch, so an instrument's real tuning — Vintage-Lyre's flats included — is visible in the song itself.

**Assigned Button**:
A button with no single sounding pitch: percussion, SFX, chord strums (Ukulele's whole top row, C through G7). Declared in config, never inferred; pressing it stores its Nominal Id carried by the Basepoint, so two Assigned Buttons never collapse however alike they sound.
_Avoid_: unpitched note (a chord is pitched — just not singly)

**Sounding Pitch**:
The actual pitch a Pitched Button plays, derived per button: the authored base note names the pitch class (nearest chromatic match to the Nominal Id), and the instrument's authored `register` ("C1"-style anchor of its lowest Pitched Button, ADR-0007 addendum) names the octave — Sky's Contrabass keyboard is the nominal 60–84 grid but sounds C1–C3. It is what a Pitched Button's Note Numbers record; an Assigned Button has none.
_Avoid_: base note (the authored label it derives from), real pitch

**Basepoint**:
The pitch a track's view starts at (C, Db, … B; song-level default, per-track override). Buttons enter and display notes relative to it, and changing it rewrites every Note Number in the affected tracks by the same interval — a real, undoable edit, stranded notes included. Applied to audio as a playback-rate shift at play time.
_Avoid_: transposition (the retired play-time-only meaning), pitch (alone — overloaded with Sounding Pitch)

**Addressable Span**:
The band of Note Numbers the game can address at all: from the lowest Sounding Pitch any instrument has at Basepoint C, up to the highest lifted by the highest Basepoint. A number outside it can be voiced by no instrument at any Basepoint, whatever the track is later swapped to — the one thing no edit can rescue, and the floor MIDI import refuses to cross. A song may still hold numbers beyond it; surfaces draw them and nothing sounds them.
_Avoid_: range (overloaded — see Editable Zone), instrument range (that is one instrument's, at one Basepoint), MIDI bounds (the Song Grid's own extent, a narrower thing)

### Instruments

**Shape**:
The named on-screen arrangement of an instrument's buttons (`genshin-3x7`, `sky-2x4`, …). Every instrument declares exactly one, explicitly — never inferred from its note count. A Shape owns the button placement (free-form, not necessarily a grid — it receives the instrument's notes and may place them by note content rather than authored order), the interaction/rendering behavior, and the default Label Sets; a game can give the same geometry a different Shape when its behavior differs. What flows out of a keyboard is a note, never a Button.
_Avoid_: layout (overloaded with Label Set), keyboard size

**Label Set**:
The per-button display texts a Shape provides for one naming mode (default key bindings, ABC, numbers, PlayStation, Switch). A property of the Shape, never of the instrument or the song.
_Avoid_: keyboard layout (ambiguous with Shape and with user-rebound keys)

**Note Preset**:
A game-scoped, named note list (per button: Nominal Id, base note, glyph) that instruments reference instead of restating shared tables; an instrument may instead declare its notes inline. Authoring vocabulary only — resolved away into each instrument before the app runs.
_Avoid_: kind (the retired term)

**Song Grid**:
The game-canonical rows×columns note grid that song-wide surfaces (composer canvas, sheet visualizer) render, regardless of which instruments the song's tracks use. Every Nominal Id has exactly one Song-Grid position, fixed by the game itself — never by any instrument; the grid doubles as the game's scale, the axis MIDI import snaps onto. Distinct from any single instrument's Shape.

**Unlisted Instrument**:
An instrument a game ships (fully loadable by songs and the engine) but hides from its instrument menus.

### Songs

**Track**:
One instrument's owned sequence of notes within a song. Every note belongs to exactly one track; doubling a melody on two instruments means two tracks each holding their own notes.
_Avoid_: layer (the legacy bitmask-slot meaning)

**Duration**:
How long a note sounds: an integer column span (≥1) in composed songs, milliseconds from press to release in recorded songs. Stored on every note regardless of whether its instrument can sustain. A composed note's span occupies its Note Number on its track for every covered column — same-number spans on one track never overlap.

**Sustain**:
An instrument's _capability_ to keep sounding while a note is held and to stop sounding on release. Instruments without it always ring out naturally and ignore Duration at playback.
_Avoid_: hold (reserved for the VSRG gameplay mechanic — a scored held lane press, which exists independently of audio sustain)

**Stranded Note**:
A note whose Note Number the track's instrument cannot voice at the current Basepoint — including off-scale numbers that fall between the grid's rows. Skipped at playback, marked in the composer (nearest row, accidental hint), never silently rewritten; Basepoint changes move it with its track — never changing whether it strands, since the view moves with the notes — while instrument swaps pass it through and may un-strand it. Cross-game imports pass notes through as-is too (the swap to Similar Instruments may strand them, warned at import, never folded); only legacy files still remap, decoding through the frozen historic tables. MIDI import is the one path that REMOVES them rather than passing them through: a note the chosen instrument cannot voice is excluded unless the import is asked to keep it (the importer calls these out-of-range notes), and a note outside the Addressable Span is excluded either way.

**Similar Instrument**:
The target game's curated counterpart for a source game's instrument — the one a track swaps to during cross-game conversion so the song keeps a comparable timbre. Unmapped instruments fall back to the target's default.

**Suggested Instrument**:
The game instrument a MIDI track is offered when imported, derived from the General MIDI identity the track declares and never from the notes it contains — so it cannot move under the user's hand when the import's transposition does. Four tiers, each falling through to the next: the track's GM patch name, its GM family, the nearest family in a fixed General-MIDI adjacency order that this game has any instrument for, and finally the game's default instrument. A proposal only: the importer pre-selects it and the choice is the user's. Distinct from a Similar Instrument, which answers between two of our own games rather than from General MIDI.
_Avoid_: matched instrument (a MIDI file names a General MIDI program, not one of ours), detected instrument, auto-instrument

**Solo**:
A per-track flag that narrows playback to the solo set: while any track is Solo, only Solo tracks sound. Solo flags stack, are saved with the song, and never rewrite other tracks' Mute — audibility is derived fresh from the flags wherever the song plays. A track's own Mute still silences it inside the solo set.
_Avoid_: exclusive solo (soloing one track never un-solos another)

### Composer Views

**Pro View**:
The composer canvas mode that renders the absolute Note Number axis directly: one row per semitone, every track's notes visible at their true numbers, notes editable by tapping the canvas itself. A per-user choice, never a property of the song — any song opens identically in either view. Surfaced to users as "PRO composer"; Pro View stays the canonical term in code and docs.
_Avoid_: piano roll (no key column; columns, not free time), expanded/pure view

**Compressed View**:
The composer canvas' default mode: the Song Grid's rows only, every note folded onto its grid row (off-scale numbers nearest-row with an accidental hint). The only view that existed before the Pro View. Surfaced to users as "Normal composer"; Compressed View stays the canonical term in code and docs.
_Avoid_: normal/classic view (as internal terms — "Normal composer" is only the label)

**Editable Zone**:
The band of Note Numbers the current track can voice at its effective Basepoint, from lowest to highest addable number. A property of (instrument, Basepoint) — it moves with Basepoint changes and instrument swaps, never with the song's content. Rows inside it that map to no button belong to the zone but accept no notes.
_Avoid_: range (overloaded: MIDI bounds, octave ranges), reach, instrument span

**View Lock**:
The Pro View's vertical framing toggle. Locked (the default) pins the frame to the current track's Editable Zone, centered, with no vertical scrolling; unlocked frees panning over the whole axis, and zooming — which is taking the frame into your own hands — unlocks by itself. Re-locking returns the frame to the zone, zoom reset included. Horizontal scrolling is never its business.
_Avoid_: scroll lock (horizontal scrolling is unaffected)

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

**Duration Hold**:
The press that opened the duration popover — on a keyboard key, a Pro View cell, a physical note key, or a held MIDI note — for as long as it stays down. While it lasts, sustain length is edited by whole-column increments from the span it opened at: one column per visible column-width of pointer travel, and one column per column the selection moves underneath it, from any source (canvas scroll, wheel, the < > buttons, shortcuts). Column changes never dismiss the popover while it lasts, and neither does a press outside it — a second finger scrolling the canvas IS such a press, and it is part of the gesture. A layer change still dismisses, and so does playback starting: the transport moves the selection on its own, and a hold it drove would grow the span one column per tick. The Hold ends with the release — the popover outlives it.
_Avoid_: drag-to-resize (suggests grabbing the tail and snapping it to a position — a Duration Hold only ever increments), snap-to-column

### Composer Editing

**Undo Step**:
One user-meaningful unit of reversal in the composer's history. Everything the song file records — notes, spans, tempo changers, breakpoints, columns, Basepoints, bpm, reverb, the track roster and every per-track field, the song's name — changes inside some Step; cursor state (selected column, active layer, view framing, tools selection) never makes one, the selected column being persisted notwithstanding. A gesture is one Step however many edits it performs — a Duration Hold's whole life is a single Step. Undoing or redoing a Step also returns the selection to the column the edit was made at, without sounding it.
_Avoid_: history entry (implementation-flavored), snapshot (the retired whole-song-copy mechanism)

**Savepoint**:
The position in the composer's undo history that equals the saved file. Whether the song has unsaved changes is derived from it: the song is dirty exactly when it does not sit at the Savepoint — so undoing back to it makes the song clean, and nothing prompts about changes that were undone. A Savepoint can become unreachable (evicted past the history's cap, stranded in a redo branch a new edit cleared, or taken mid-gesture — an autosave landing inside a Duration Hold writes a file no Step boundary describes), which correctly leaves the song dirty until the next save.
_Avoid_: changes counter (the retired increment-only dirtiness), save flag

### Player

**Section**:
The contiguous stretch of Sheet Frames a player run performs — play, practice and approaching all share its frame-snapped bounds. It is independent of Loop, which only auto-restarts the Section when a run finishes.
_Avoid_: loop range (Loop is the repeat toggle, not the bounds), range (overloaded — see Editable Zone), selection

**Chunk**:
One playable instant of a song in the player: the near-simultaneous notes merged into a single group. The unit practice advances by and the unit the sheet draws by.
_Avoid_: column (composer-side), chord (a Chunk may hold one note)

**Sheet Frame**:
One Chunk drawn as a tile of the player's visual sheet. The frame-granular handle for the Section: a frame can start it, end it, or be sought to.
_Avoid_: frame (alone, ambiguous with animation frames), sheet tile

**Sheet Card**:
The card holding the Sheet Frames above the player keyboard — the current page inline, the whole song when fullscreen. Section bounds render on it as brackets; frames outside the Section stay visible, dimmed.
_Avoid_: visual sheet (the setting's name for the feature, not the surface)

### Composer Playback

**Transport**:
The engine that turns a song's columns into committed audio and advances the Sounding Column. Owns playback time; knows nothing about which notes sound — that stays with the composer.

**Sounding Column**:
The column whose notes the listener is hearing right now — what the selected column _means_ while the song plays. Every playback surface (keyboard flash, playhead, sustain recording, end-of-song) agrees on it by definition.
_Avoid_: current column (ambiguous with edit-time selection), playhead column

**Committed**:
Audio already handed to the audio clock ahead of being heard. Committed audio is retractable until the moment it starts sounding; once started it always rings out — deleting a note never silences its in-flight sound.
_Avoid_: scheduled (says when it was decided, not whether it can still be taken back)

**Audition**:
Pressing or selecting a track sounds that track's notes in the selected column, as taps — regardless of Mute and Solo, and silent while the song is playing.
_Avoid_: preview (the column's own, which is every track at once and obeys Mute/Solo)

### Shell

**Home**:
The app's front door: the screen listing every page (the big Composer and Player cards, the smaller page links, first-visit welcome). It lives at the site root and is where the home button leads; it works in any orientation. It was an overlay popup before it became a page — "Home popup" names that dormant variant.
_Avoid_: main page (the player was historically the "Main" page; Home is not the player), home menu (it no longer opens over a page)
