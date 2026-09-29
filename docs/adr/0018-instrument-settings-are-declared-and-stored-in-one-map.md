# Instrument Settings are declared by instruments and stored per track in one map

Variants (ADR-0017) are the first member of a planned family: a catalog of setting kinds the app implements and instruments opt into, and perhaps later settings particular to one instrument. Meanwhile every track already carries a fixed set of properties in every song format — `volume`, `reverbOverride`, `pitch` (the Basepoint override), `muted`, `solo`, `alias`, `icon`, `visible` — and one serializer (`InstrumentData`) writes them for composed and recorded songs, VSRG tracks and the metadata embedded in exported MIDI.

We decided (2026-09-29): **an Instrument Setting is only what an instrument declares in its config** (an id, a Setting Kind, a default), and **a track stores its values in one `settings` map keyed by setting id**, inside `InstrumentData`, so every song type carries it through one serializer change. A value is checked against the instrument's declaration when loaded; a missing, unknown or invalid one plays the declared default. The fixed track properties stay exactly as stored today. The UI may show both groups in one panel; the model keeps them apart.

**Saving records every declared setting's value, defaults included.** A song whose author never touched a setting still stores the default it was saved with, so changing an instrument's declared default later re-voices no saved song. Only a file written before a setting existed has no value and follows the current default — which is how every existing Aurora song picks up the new default Variant — and it is pinned the next time it is saved. Leaving defaults out was rejected: smaller files, but a changed default would silently change every song that never chose, and once saved there is no telling "chose the default" from "did not care". Moving old songs to a new default on purpose is therefore a deliberate migration, never a config edit.

**What this build cannot read, it plays and saves as the default.** An unknown setting id or option value is dropped on load: the track plays the default, and the next save writes the default. A song saved by a newer build therefore loses that choice when an older build re-saves it, for example a Variant option added later or a Setting Kind this build lacks. Preserving unrecognised values through a re-save was considered and declined (2026-09-29). That would mean keeping them in memory while the track keeps its instrument, and writing them back. The simpler rule stands.

**A setting belongs to the instrument that declared it: swapping a track's instrument resets its settings to the new instrument's defaults.** Aurora singing Oo, swapped to Piano and back, sings the default again; undo, which records the swap as one step, is what returns Oo. Every other swap follows the same rule — cross-game conversion to a Similar Instrument, MIDI import's Suggested Instrument. Keeping values dormant across swaps was rejected: files would carry invisible leftovers of past instruments, and two instruments declaring the same setting id would hand a value from one to the other with nothing on screen to explain it.

**Every Setting Kind is first-party code in this repo.** An instrument opts into a kind by id, the way it names its Shape (ADR-0003); a kind only one instrument uses is still an app kind, which is all the "custom settings" tier amounts to. No code is ever loaded at runtime: third-party instrument plugins were rejected because they would need a sandbox, a plugin API kept stable forever, and a reversal of ADR-0003's rejection of even data-only runtime instruments — and code running in the app's origin could read every song the user has stored.

Considered and rejected:

- **Unifying volume and reverb into the settings map.** One model and one UI, bought with a permanent dual-read migration across every song format and every saved song, where a bug changes existing mixes. A schema earns nothing for a field every track has with the same shape whatever its instrument; it pays only where instruments differ.
- **A dedicated field per setting** (`variant` beside `volume`, as `solo` was added). Explicit and minimal, but every new kind would be another serializer change across all consumers, and settings particular to one instrument would force a map anyway — two storage conventions in the end.

## Consequences

- Adding an opt-in setting kind needs no format change, only the kind's behavior and its declaration.
- Loading must validate against the declaration: stored values are loosely typed, and a song can outlive the declaration that wrote it.
- The map is not a plugin API. Its keys are ids of first-party kinds, and nothing outside the repo can add one.
