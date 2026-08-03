# Composed songs are per-track, with durations as integer column spans

The legacy composed format shared one note entry across instruments via a layer bitmask (`ColumnNote {index, mask}`). That model breaks under note-id identity (instruments with different id spaces can't share an entry: Bell's button 2 is id 67, the 15-key's is 64) and under sustain (a shared entry forces one duration on every doubled instrument). We decided each **track owns its notes**: `{id, span}` events placed on the shared column/tempo-changer timeline — the same shape VSRG tracks and MIDI files already have. Durations are **integer column spans (≥1)** in composed songs and **milliseconds press→release** in recorded songs.

## Considered Options

- **Keep the bitmask over id-keyed notes** — rejected: every edit operation would need split/merge logic the moment ids or durations diverge across layered instruments; the mask would get subtler, not simpler.
- **Milliseconds in the composer** (like VSRG's `holdDuration`) — rejected: held notes would silently detach from the grid on BPM/tempo-changer edits.
- **Fractional beats** — rejected: a third timebase nothing else uses.

## Consequences

- Durations follow tempo changers and BPM edits for free; span 1 is today's behavior and is omitted in serialization.
- Duration is stored on every note regardless of instrument capability; non-sustaining instruments ignore it at playback (natural ring-out — existing instruments' sound is unchanged), so re-instrumenting a track never loses authored durations.
- Same-id spans on one track never overlap (a held note occupies its button for covered columns).
- Doubled melodies serialize once per track instead of once with a mask — dense multi-track songs get somewhat larger files; sparse per-track tuples (empty columns cost nothing per track) offset this.
- `NoteLayer` survives only inside legacy deserializers.
