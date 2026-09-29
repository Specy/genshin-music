# Alternative recordings are Variants of one instrument, chosen per track and saved with the song

Sky's Voice of AURORA plays one of 1–5 recorded **Takes** per button, picked at random on every press (measured 2026-09-26 from an in-game capture: 46 Takes over 15 buttons, never the same Take twice in a row). The app will not reproduce the dice roll. It offers three fixed sets of Takes instead, one per sung vowel. The question was how those sets enter the model, and it has to be answered before anything ships, because whatever a song file stores it stores forever.

We decided (2026-09-29): **the sets are Variants of the one Aurora instrument, and a track's Variant is song data**, stored beside the track's instrument name the way its `volume` and `reverbOverride` are. A song sounds as its author left it: the player adopts each track's Variant for the song's duration exactly as it already adopts the song's pitch, reverb and instruments ("a loaded song always brings its own"), and puts the user's own back at stop. A free-play keyboard with no song (the player with nothing loaded, the zen keyboard) keeps its own Variant in the user's settings, next to the instrument chosen there.

Considered and rejected:

- **Three instruments** ("Aurora" plus two siblings). No new machinery and a well-worn checklist, but it mints two instrument names every saved song must honour forever. It also copies the shared Takes: meta.json cannot reference another instrument folder's files, and B5 and C6 are shared by all three sets while seven more buttons are shared by two. Shipping this first and migrating to Variants later was rejected for the same permanence: the names would outlive the migration.
- **A "Random" option that rolls a Take on each press, as the game does.** Faithful, and measured, but every playback and every exported audio file of the same song would differ; making it reproducible needs a seed stored per song, a feature of its own for a novelty. Deferred rather than refused: it would be one more first-party Setting Kind (ADR-0018), and the first version ships Variant as the only kind.
- **A listener preference** (the Variant as a per-instrument skin applied to every song the user plays). It breaks the player's rule that a song brings its own instruments, makes one song sound different per listener and per exported audio file, and cannot express two Aurora tracks singing different vowels in one song. It remains possible later as a separate listener-side feature layered over this one; the reverse layering would not work.

## Consequences

- A track with no Variant plays its instrument's default Variant. Every existing song keeps working, and an older app reading a file that has the field ignores it — the same no-version-bump path `solo` took.
- One instrument folder holds each Take once; the Variants reference files in it.
- A Variant's id is written into every saved song, so it is permanent the way an instrument name is; its label is display text, an English fallback in `meta.json` that any locale may override (the `displayName` pattern of ADR-0003). Aurora's are `ah` (default, label "Ah"), `eh` ("Eh", the vowel of *bed*) and `oo` ("Oo", the vowel of *food*) — named by sound as General MIDI names its "Choir Aahs" and "Voice Oohs", and never spelled "Ee" or "U", which English readers would pronounce as other vowels.
- Instrument identity is unchanged: menus, Similar Instrument mapping, Suggested Instrument families, keybinds and i18n still see one Aurora.
