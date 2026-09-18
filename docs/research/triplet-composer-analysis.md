# Triplet support in the composer

Date: 2026-08-22

## Recommendation

Add triplet support, but do **not** ship it as only another entry in `tempoChangers`.
The composer model and playback clock already support arbitrary positive column lengths, so the
feature fits the architecture. The importers, text-sheet conversion, persisted tempo IDs, and some
UI ordering assumptions do not. A config-only change would make files appear to work in the editor
while corrupting timing on MIDI round-trip and losing the rhythm in text-sheet output.

The first product decision is which rhythm “triplet” means. A normal composer column lasts
`60000 / bpm` (`src/routes/blog/posts/how-to-use-composer/+page.svelte:136-139`), and MIDI export
maps four composer columns to one MIDI quarter note by exporting `bpm / 4`
(`src/lib/core/Songs/RecordedSong.ts:544-550`). Therefore:

- `changer: 2 / 3` is the usual grid triplet: three shortened columns occupy the time of two
  ordinary columns.
- `changer: 1 / 3` puts three columns inside one ordinary column. That is a valid finer subdivision,
  but it is not the usual 3-in-the-time-of-2 triplet implied by the request.

For a focused first release, add **one `2/3` column duration** and describe it explicitly as
“three columns in the time of two.” Do not attempt arbitrary tuplets or nested tuplets yet.

## What already works

### Timing model

Composed notes use an integer `span` measured in columns, while each column stores a numeric tempo
changer ID (`src/lib/core/Songs/SongClasses.ts:63-72`,
`src/lib/core/Songs/SongClasses.ts:104-118`). This is a good representation for triplets: three
successive `2/3` columns form the group, and sustained notes continue to span an integer number of
real columns. It does not require fractional note spans. This agrees with the existing duration
decision that rejects milliseconds/fractional beats as the note-duration timebase in favor of
integer column spans (`docs/adr/0002-per-track-notes-column-span-durations.md:1-16`).

The duration calculations are multiplier-based rather than power-of-two-based:

- Composer playback computes each column as `(60000 / bpm) * changer`
  (`src/lib/components/pages/Composer/Composer.svelte:890-899`).
- Sustains sum the actual durations of the columns they cover
  (`src/lib/components/pages/Composer/Composer.svelte:913-920`,
  `src/lib/components/pages/Composer/Composer.svelte:1922-1941`).
- Composed-to-recorded conversion accumulates exact per-column durations and rounds only emitted
  endpoints (`src/lib/core/Songs/ComposedSong.svelte.ts:481-508`).
- The transport accepts a callback that returns each column's duration and schedules by a running
  time sum (`src/lib/audio/ComposerTransport.ts:72-128`,
  `src/lib/audio/ComposerTransport.ts:409-479`). Its tests already exercise heterogeneous arbitrary
  durations such as 100, 200, and 300 ms (`test/composerTransport.test.ts:25-60`).

Playback and sustain behavior therefore need tests, not a redesign. The current live-composer path
rounds each individual column to milliseconds while recorded/MIDI conversion accumulates exact
values; this existing difference is worth covering with a long triplet-run drift test.

### Editor controls

The tempo palette renders the configured list generically
(`src/lib/components/pages/Composer/ComposerTempoChangers.svelte:16-49`), the setter accepts any
configured `TempoChanger` (`src/lib/core/Songs/ComposedSong.svelte.ts:907-931`), and keyboard
shortcuts are assigned from list position (`src/lib/components/pages/Composer/Composer.svelte:351-357`).
A fifth item can therefore render and use Digit5 without new interaction machinery.

The renderer's tempo caches are also built from the configured list
(`src/lib/components/pages/Composer/ComposerCache.ts:166-190`). However, later lookups index those
arrays by the stored tempo ID (`src/lib/components/pages/Composer/ComposerRenderer.ts:5276-5299`).
That makes stable, contiguous IDs an invariant even though the registry currently does not validate
tempo changers (`src/lib/games/registry.ts:190-262`).

## What blocks a config-only change

### 1. MIDI import rounds non-dyadic ratios to the wrong duration

The present game configs contain only `1`, `1/2`, `1/4`, and `1/8`
(`src/lib/games/genshin/game.json:85-111`, `src/lib/games/sky/game.json:113-139`). MIDI import takes
the smallest configured changer as one unit and calculates every other length with
`Math.round(changer / finest)` (`src/lib/core/Songs/midiImport.ts:226-242`). Its comment says
non-integral ratios are dropped, but the implementation rounds them instead. The gap filler then
assumes those rounded integer units are exact (`src/lib/core/Songs/midiImport.ts:244-255`) and
quantizes all events to that grid (`src/lib/core/Songs/midiImport.ts:279-282`,
`src/lib/core/Songs/midiImport.ts:330-385`).

With the current `1/8` finest unit:

- `2/3` becomes `round(16/3) = 5` eighth-units, although its real length is `16/3` units.
- `1/3` becomes `round(8/3) = 3` eighth-units, although its real length is `8/3` units.

Either value therefore shifts note starts when an exported song is imported again. MIDI export itself
is not the problem: it writes notes at absolute second times (`src/lib/core/Songs/RecordedSong.ts:538-588`).
The importer must be changed to use a rational common grid and an exact/closest representable gap
decomposition. A common denominator alone is insufficient: for `1, 1/2, 1/3, 1/4, 1/8`, a 1/24
grid gives lengths 24, 12, 8, 6, and 3, but arbitrary foreign-MIDI gaps of one or two units are not
representable. The algorithm must explicitly choose the closest reachable duration rather than
silently treating a rounded denomination as exact.

There is a second import path with the same limitation. `RecordedSong.toComposedSong()` hardcodes
whole, half, quarter, and eighth column lengths (`src/lib/core/Songs/RecordedSong.ts:352-443`,
especially `:400-432`). It should share the new duration decomposer, or triplets imported from
recorded/audio sources will still disappear.

Existing MIDI round-trip coverage specifically pins the dyadic subdivisions
(`test/midiRoundTrip.test.ts:193-249`). It needs cases for a pure triplet run, mixed ordinary and
triplet columns, a sustain crossing their boundary, multiple BPMs, and a long run that detects drift.

### 2. Tempo changer IDs are persistent identities, not sortable durations

Both `NoteColumn` and the serialized composed-song format store the tempo changer's numeric ID, not
its multiplier (`src/lib/core/Songs/SongClasses.ts:104-118`,
`src/lib/core/Songs/ComposedSong.svelte.ts:65-88`,
`src/lib/core/Songs/ComposedSong.svelte.ts:709-742`). Deserialization uses that ID to index the
current config and replaces an unknown ID with tempo 0 (`src/lib/core/Songs/ComposedSong.svelte.ts:292-343`).

Consequences:

- Do not insert `2/3` between existing duration entries or renumber IDs. Append a new stable ID 4
  in both games; cross-game conversion clones columns with their IDs
  (`src/lib/core/Services/SongService.ts:126-156`).
- Decouple display order from ID order if the palette should read `1, 2/3, 1/2, 1/4, 1/8` (or another
  musical order). Sorting the backing config would corrupt existing songs. Preserving the existing
  Digit1-Digit4 meanings and assigning triplet to Digit5 is the least disruptive first release.
- Add registry checks that IDs are unique, contiguous, equal to their array indices, and that all
  multipliers are finite and positive. Both games should expose the same stable ID mapping.

Appending ID 4 without a format bump also creates backwards data loss: an older v5 app will accept
the file but silently decode ID 4 as a normal-length column. The version guard rejects only versions
newer than the reader knows (`src/lib/core/Songs/Song.svelte.ts:131-150`), and tests document that
newer files should be rejected rather than partially decoded (`test/formatVersionGuard.test.ts:28-53`).
The composed format should therefore bump from v5 to v6 even if its JSON shape is unchanged. Current
code identifies v4/v5 as the modern format (`src/lib/core/Songs/ComposedSong.svelte.ts:271-282`), so
v6 must be added to that dispatch while v4/v5 continue to migrate.

### 3. Text-sheet conversion assumes ID order and knows only IDs 0-3

`VisualSong` compares tempo changer IDs numerically to decide chunk nesting
(`src/lib/core/Songs/VisualSong.ts:88-128`). That accidentally works only because the current IDs
increase as durations shrink. Appending a `2/3` or `1/3` as ID 4 breaks that ordering assumption.
It also hardcodes bracket/text markers only for IDs 0 through 3, and unknown IDs fall back to empty
markers (`src/lib/core/Songs/VisualSong.ts:213-224`, `src/lib/core/Songs/VisualSong.ts:258-284`). A
triplet rhythm would therefore be lost in text output.

Before release, compare configured multiplier values rather than numeric IDs and choose an explicit,
unambiguous triplet text notation. Add transition tests around ordinary, half, triplet, quarter, and
eighth columns; current tests cover only IDs 0, 1, and 3 (`test/visualSong.test.ts:67-87`).

### 4. The fifth button needs layout and grouping review

The palette is a vertical fixed-width stack (`src/lib/css/App.css:2711-2727`,
`src/lib/css/App.css:2828-2847`) and its Pro layout occupies a dedicated grid row
(`src/lib/css/App.css:3268-3297`, `src/lib/css/App.css:3464-3499`). Short landscape/mobile rules are
already sensitive to tool height, with tests pinning tempo-row placement
(`test/composerCanvasCss.test.ts:601-650`). A fifth button should be browser-checked in desktop,
compressed, Pro, mobile, and short-landscape modes.

Visual beat accents are column-count-based: every fourth column receives the larger style and larger
groups use `4 * beatMarks` (`src/lib/components/pages/Composer/ComposerRenderer.ts:5189-5193`,
`src/lib/components/pages/Composer/ComposerRenderer.ts:5277-5283`). The tutorial likewise describes
beat marks as groups of four columns (`src/routes/blog/posts/how-to-use-composer/+page.svelte:145-146`).
Triplets do not newly break this—existing tempo changers already make grid accents diverge from
elapsed musical time—but a three-column triplet will not get duration-aware accents. Treat a
time-aware ruler as a separate UX improvement, and document how to apply the changer to groups of
three in the meantime.

## Suggested implementation boundary

Ship the feature only when this package is complete:

1. Define and name the intended ratio—recommended `2/3`—then append stable ID 4 to both game
   configs. Keep existing shortcuts stable and expose a separate display order only if needed.
2. Add tempo-config registry invariants and bump composed-song format to v6 so older clients reject
   unsupported songs instead of silently changing their rhythm.
3. Replace both dyadic import decomposers with one rational, representability-aware implementation.
4. Refactor `VisualSong` to use multiplier semantics and add a triplet text encoding.
5. Verify the fifth control in all composer layouts and update the composer tutorial's tempo section
   (`src/routes/blog/posts/how-to-use-composer/+page.svelte:56-62`).
6. Add playback, sustain, rendering, persistence, cross-game, MIDI round-trip, text export, and
   long-run drift tests. Update the current config-surface golden intentionally
   (`test/configSurface.test.ts:12-51`) without rewriting the frozen pre-migration equivalence
   fixture (`test/configSurface.test.ts:233-250`).

If importer, format, and text-sheet work is not in scope, defer the feature. Calling it
“editor-only” would still let users export or open a song through supported paths that silently
change the rhythm, which is a worse contract than not offering triplets yet.
