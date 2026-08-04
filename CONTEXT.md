# Genshin/Sky Music

A web app for composing, recording, and practicing songs played on the in-game instruments of Genshin Impact and Sky: Children of the Light (and future games), built around on-screen button keyboards that mirror each game's instrument layout.

## Language

### Notes

**Note Id**:
The universal identity of a note in a song: the nominal MIDI number an instrument declares for a button. It is a name in a shared namespace, not necessarily the actual sounding pitch (Genshin's accidental-tuned instruments keep white-key nominal ids; unpitched SFX use assigned ids).
_Avoid_: note index, note number, midi note (ambiguous with true pitch)

**Button**:
One physical position in an instrument's on-screen keyboard. Derived per instrument: the position of a Note Id in that instrument's ordered note list. Songs never store buttons.
_Avoid_: note position, key (ambiguous with keybind and musical key), index

**Sounding Pitch**:
The actual concert pitch of the sample a button plays. An instrument concern (display, future pitch-true export), never a song-format concern.
_Avoid_: base note, real pitch

**Transposition**:
The song-level or per-instrument playback transform (C, Db, … B) applied at play time via playback rate. Stored Note Ids are always pre-transposition (what the button plays at C).
_Avoid_: pitch (alone — overloaded with Sounding Pitch)

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
