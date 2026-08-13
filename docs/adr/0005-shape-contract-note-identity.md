# Shapes receive the instrument's notes (ordered, order = authored key placement) and own their on-screen placement; every keyboard boundary speaks notes, not slot indices

Keyboard arrangements should be implementable from note data alone — a future Shape may place notes in a circle, a pitch spiral, anything — but today the Shape contract hands surfaces a bare slot index (`button: Snippet<[number]>`), and everything downstream speaks `.index`: surface handlers, per-note UI state, and the audio engine's `pressNote(button)`. We decided: (1) a Shape receives the instrument's notes as an **ordered array whose order is meaningful data** — the authored in-game key placement from `meta.json` — but is explicitly free to ignore it and derive placement from note content; (2) every Shape **exposes its note→position assignment** as data/pure function, so keybind resolution, keyboard highlighting, and practice hints always agree with what the Shape drew; (3) pointer interaction stays **surface-owned** through the snippet, whose payload becomes the note descriptor; (4) the `Instrument` engine's public API is keyed by **Note Id** (`pressNote(id)`/`releaseNote(id)`), demoting button indices to private storage — playback scheduling, which already stores ids in songs, drops its id→button→id round-trip. Scope: player, zen, composer, and MIDI-setup keyboards; VSRG's lane system is out. Ships after the ADR-0004 canvas fix; neither changes stored song data.

## Considered Options

- **Truly unordered note set** — rejected: "which note gets the 'A' key" doesn't disappear, it moves from authored data into per-Shape derivation code. Today "sort by id" would reproduce every shipped instrument, but the first in-game instrument whose keys are NOT pitch-ordered would force either renumbering Note Ids (corrupting song identity and MIDI import, which map real pitches onto ids) or reintroducing placement data — an ordered list, reinvented.
- **Strictly binding order (slot k = note k for every Shape)** — rejected: a content-driven Shape (pitch spiral) would have to pretend order doesn't exist; making order _available data_ rather than _binding_ costs nothing for grids.
- **Shape-owned pointer events (`onNotePress`)** — rejected: surfaces are behaviorally heterogeneous (play + practice rings, composer toggling, MIDI audition), so the Shape would have to own multitouch/slide semantics for all of them while surfaces still need the snippet for per-note UI anyway.

## Consequences

- `meta.json` note order becomes the single authored statement of in-game key placement; keybind rebinds (attached to default labels, i.e. to Buttons) stay deterministic under any Shape.
- A Shape changing its derivation rule is a real compatibility event for user keybinds — content-driven Shapes must treat their assignment as stable API.
- `ObservableNote.index` and friends survive only as private storage; surfaces address per-note state through the note object.
- A content-aware grid Shape could later subsume `genshin-2x7` (render 14 notes on the standard 3×7's correct rows automatically); not planned now, but the contract permits it.
