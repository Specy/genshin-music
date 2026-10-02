# VSRG Beatmap Generation — Design

Status: IMPLEMENTED 2026-08-30 (uncommitted on Dev). `npm run check` clean over 2159 files;
`npm test` green in both games, the two new suites contributing 127 tests. Built as written with
three corrections found during implementation, each marked **AS BUILT** below: Hard's band ends at
7.9 rather than 8 (§7 and §2), the press-rate ceiling is retuned on every convergence step rather
than in Doubling mode only (§6.10), and `GenerationRequest` carries the registered `audioSong` and
the composer's `snapPoint` (§5). CONTEXT.md terms landed
(**Lane**, **Hit Object**, **Backing**, **Performed Track**, **Doubling**, **Chart Level**,
**Rating**, **Strain**, **Judgment Difficulty**); ADR-0016 records the coverage contract and the
choices that hang off it. Read the ADR first — this spec builds the machine, the ADR says why the
machine has that shape.

## 1. Goal

A generator in the vsrg composer that turns a composed or recorded song into a **new** vsrg song
whose chart the player _performs_ rather than decorates: it picks the part of the song you take
responsibility for, mutes it, and lays a chart that covers it — aiming at a Chart Level, measuring
what it produced, and retuning until the two agree.

The motivating gap is that authoring a vsrg chart today is placing every Hit Object by hand, one
snap point at a time, with the pairing of "mute this instrument" and "chart what it was playing"
held entirely in the author's head. Nothing in the model connects the two, so a half-covered muted
track is a song with holes in it that nothing notices.

What "smart" has to mean here, concretely: the chart reads as the song (lanes follow the melody's
contour), plays like a rhythm game (idiomatic figures, no jacks, balanced hands), and is honest
about its own difficulty (a measured Rating, not a label).

## 2. Decisions (locked during grilling)

- **Hit Objects perform a muted part.** Not doubling-by-default, not pure rhythm. A miss leaves an
  audible hole; that is what makes "playable" load-bearing.
- **Muting is earned by coverage.** A source track is muted iff every one of its notes is carried
  by some Hit Object — sustain included where the instrument's config declares `sustain`. Partial
  coverage means no mute: the track stays in the Backing and the chart Doubles it.
- **The Chart Level chooses the part.** The generator ranks candidates by prominence and proposes
  the most prominent one it can _fully cover_ at that level; changing the level re-computes and
  visibly re-ticks the proposal. Doubling the lead is the fallback when nothing fits.
- **The proposal is a proposal** — pre-ticked, one-line reason, overridable. (Same rule as ADR-0012's
  Suggested Instrument.)
- **Prominence is a weighted score**: is the instrument pitched at all (config), its height relative
  to the other tracks, its distinct-pitch count, its presence across the song. Percussion never wins;
  a bass ostinato does not beat a melody by note count alone.
- **Analysis reads the whole song**, not only the tracks that will be muted — beat, accents and
  density come from everything that sounds.
- **Contour drives lanes, playability overrides.** Pitch rises → step right, falls → step left;
  chords spread low-to-high. A constraint pass then breaks jacks, balances hands, caps chord width.
  (Rejected: absolute pitch bands — a narrow melody uses two lanes all song and every repeated note
  is an unavoidable jack. Rejected: pattern-vocabulary fitting — two different melodies over one
  rhythm would chart identically.)
- **Exact source times, ~30ms clustering.** No grid snapping. (Rejected: snapping — the grid is
  uniform `60000 / bpm / snapPoint` with `snapPoint ∈ {1,2,4,8,16}`, so it has no triplet
  subdivision, mangles tempo-changer columns, and drifts every performed note up to half a cell
  against the Backing.)
- **Holds iff the instrument sustains and the note is long enough** — `instrumentSupportsSustain`,
  the predicate MIDI import already gates on. Dropping a sustain breaks coverage on a sustaining
  instrument and costs nothing on a one-shot one.
- **Rating is derived, 1–10, for any chart**: decaying per-Lane Strain, peak-weighted, with chord
  width / hold overlap / hand imbalance as multipliers. Never stored. `difficulty` (Judgment
  Difficulty) is untouched by generation.
- **Chart Level is a target band**, converged on by re-generating: Easy 1–3, Normal 3.5–6,
  Hard 6–7.9. **8–10 is unreachable by generation.** (Rejected: level-as-preset — "Easy" would then
  describe the settings, not the result.)
- **Lane count is the user's**, defaulting to the composer's current `keys`. (Rejected:
  generator-chosen — key count is a player preference with keybinds bound to it.)
- **Generation creates a new vsrg song** and never touches the open chart. The vsrg composer has no
  undo at all. Entry point: the composer's Songs menu, beside the background-song picker. One chart
  per run.
- **Re-roll replaces the song this dialog just made** — generator-owned and unedited by definition,
  so no litter and nothing lost.
- **Seeded determinism.** Same source + level + lane count + seed → byte-identical chart. Randomness
  breaks ties only; it never picks patterns.

## 3. Current state being replaced

Nothing is replaced — this is additive. What it builds on:

- `VsrgSong` (`$core/Songs/VsrgSong.svelte.ts`): `keys` (4|6), `duration`, `audioSongId`, `tracks`
  (instrument + `hitObjects` + color), `trackModifiers` (per _background_ instrument:
  `hidden`/`muted`/`alias`), `breakpoints`, `difficulty`, `snapPoint`, `bpm`, `pitch`.
  `initTracksForConstruction(tracks)` is the installer for a song nobody is watching yet — the
  generator's exit point.
- `VsrgHitObject`: `index` (Lane), `timestamp` (ms), `notes` (Note Numbers, a set), `holdDuration`.
- The composer's `setAudioSong` (`vsrg-composer/+page.svelte:522`) already flattens a `ComposedSong`
  via `toRecordedSong(0)` and a `RecordedSong` as-is. **It does not copy the source's bpm or pitch**
  — `vsrg.bpm` comes from composer settings. The generator must.
- `createNewSong` (`:558`) is the shape to follow for creating and registering a song:
  `new VsrgSong(name)` → `set({bpm, keys, pitch, snapPoint})` → `songsStore.addSong` → `set({id})`.
- `instrumentSupportsSustain(name)` (`$core/Songs/midiImport.ts:286`) — the hold predicate.
- `INSTRUMENTS_DATA` (`$core/legacyConfig.ts:98`) — per-instrument `family`, `midiName`, and the
  note list whose entries carry `pitched: false` for Assigned Buttons.
- Player facts the generator is bound by: presses resolve through
  `renderableHitObjects.find(r => r.hitObject.index === key.index)`
  (`VsrgPlayerRenderer.ts:322`) — **one press consumes exactly one Hit Object**; playback starts at
  `-countDown - scrollSpeed` (`:280`), so a Hit Object at `t = 0` is reachable and no start offset
  is needed; the Backing ticks `audioSong.tickPlayback(timestamp + offset)` and skips muted
  modifiers (`vsrg-player/+page.svelte:150`).

## 4. Module layout

Core tier, beside the other song-transforming modules (`midiImport.ts`, `sustainQuantize.ts`,
`sectionChunks.ts`):

- **`$core/Songs/vsrgRating.ts`** — the Strain model and `rateChart`. Pure, no song construction,
  no UI. Usable on any `VsrgSong`, which is what lets the composer show a live Rating later.
- **`$core/Songs/vsrgGenerate.ts`** — analysis, prominence, clustering, lane assignment, constraint
  pass, emission, and the convergence loop. Depends on `vsrgRating`.
- **`$cmp/pages/VsrgComposer/VsrgGenerateDialog.svelte`** — the dialog. Owns no algorithm.

Both core modules are plain `.ts` (no `.svelte.ts`): they take data and return data, and nothing in
them is reactive. The generator returns a fully-built `VsrgSong` and the _page_ registers it.

## 5. Types

```ts
export type ChartLevel = 'easy' | 'normal' | 'hard';

/** One press: a cluster of source notes the chart sounds together. */
type PressEvent = {
  time: number; // ms, the cluster's earliest note
  notes: number[]; // Note Numbers, ascending
  hold: number; // ms, 0 = tap
  sourceTrack: number; // which background track these notes came from
  top: number; // highest Note Number — the contour's representative pitch
  covers: number; // how many source notes this press accounts for
};

export type TrackCandidate = {
  trackIndex: number;
  score: number;
  reason: ProminenceReason; // {topVoice, varied, present, dense} flags — the dialog renders text
  affordableAt: Record<ChartLevel, boolean>;
};

export type GenerationRequest = {
  source: RecordedSong; // composed songs arrive via toRecordedSong(0)
  audioSong: Song; // AS BUILT. The registered source song, id and all: setAudioSong
  // keys off `song.id`, and toRecordedSong copies no id — so passing
  // the flattened song leaves trackModifiers empty, every mute
  // silently no-ops, and the result still claims a Performed Track.
  // emit() throws on that mismatch rather than shipping the drift.
  snapPoint?: SnapPoint; // AS BUILT. The composer's current grid, carried onto the new song.
  sourceInstruments: InstrumentData[];
  sourceBpm: number;
  sourcePitch: Pitch;
  keys: VsrgSongKeys;
  level: ChartLevel;
  seed: number;
  selection: number[] | null; // null = take the proposal
};

export type GenerationResult = {
  song: VsrgSong; // id-less; the caller registers it
  rating: number;
  performed: number[]; // source track indices muted (fully covered)
  doubled: number[]; // source track indices charted but not muted
  attempts: number;
  converged: boolean; // false = ran out of attempts, best effort returned
};
```

## 6. The pipeline

### 6.1 Analyse (once per source, independent of level and seed)

Split `source.notes` by `trackIndex`. Per track compute: note count, mean/min/max Note Number,
distinct-pitch count, presence (fraction of the song's duration between its first and last note),
and a density curve (presses per second in a 1s sliding window). Across the whole song — every
track, muted or not — derive the beat grid from `sourceBpm` and an accent weight per onset
(on-beat > on-half > off-grid), used later by reduction to decide what to keep.

### 6.2 Rank by prominence

```
score = w_pitched · isPitched          // config: the instrument has Pitched Buttons at all
      + w_height  · normalizedMeanPitch // relative to the other tracks, not absolute
      + w_varied  · normalizedDistinctPitches
      + w_present · presence
```

`isPitched` is a gate as much as a term: an instrument whose buttons are all Assigned (percussion,
SFX) scores zero and never wins. `reason` records which two terms dominated, and the dialog renders
them ("highest voice, most varied").

### 6.3 Affordability

For each candidate at the requested level, cluster it (§6.4) and ask whether the resulting press
stream fits the level's budget without dropping anything: peak press rate under the level ceiling,
no cluster wider than the level's chord cap, and no two presses closer than the level's minimum gap.
A candidate that fits is **performable** at that level.

### 6.4 Cluster

Within one source track, notes whose times differ by ≤ `SIMULTANEITY_MS` (30) merge into one
`PressEvent`. `notes` is the union, ascending; `top` is the maximum; `hold` is the longest duration
among them **if** `instrumentSupportsSustain(track instrument)` and that duration ≥ `HOLD_MIN_MS`,
else 0. `covers` is the count of source notes folded in — the coverage ledger's unit.

### 6.5 Select

Take the highest-scoring performable candidate → **Performed**. If the user's selection overrides
the proposal, honour it and re-evaluate performability for what they picked. If nothing is
performable at this level, take the highest-scoring candidate as a **Doubling** — and note that a
Doubling carries no coverage obligation, so reduction (§6.6) is unconstrained there.

### 6.6 Reduce (Doubling mode only)

Drop press events until the budget is met, cheapest-first by accent weight: off-grid filler before
off-beat, off-beat before on-beat, never the first or last press of a phrase. A Performed Track
never enters this stage — dropping one of its notes would forfeit the mute, which is the whole
point of choosing an affordable candidate in §6.3.

### 6.7 Assign lanes (contour walk)

One merged, time-ordered pass over every charted track's press events, so the lane-collision
invariant is enforced by construction rather than checked afterwards.

```
cursor = middle lane
for each press in time order:
    d = press.top - previous.top
    if d == 0:  step ±1, direction chosen by which side has more free space
                (tie → seeded RNG; this is the only place randomness enters lane choice)
    else:       direction = sign(d)
                step = clamp(round(|d| / STEP_SEMITONES), 1, keys - 1)
    target = reflect(cursor + direction · step, 0, keys - 1)   // reflect, not clamp
    width  = min(press.notes.length, chordCap(level))
    lanes  = width consecutive free lanes centred on target
    assign press.notes ascending → lanes ascending (low pitch left)
    cursor = target
```

Reflection rather than clamping is deliberate: a clamped long ascent piles every press onto the top
lane, which is a jack made by the mapping itself.

### 6.8 Constraint pass

In one forward sweep, with a rolling window:

- **Jack break** — a press landing in a Lane used within `minGap(level)` moves to the nearest free
  Lane, preferring the other hand.
- **Hand balance** — among equally good Lanes, take the hand with fewer presses in the trailing
  window.
- **Hold protection** — no Hit Object may be placed in a Lane while a hold occupies it. (Also what
  stops `setHeldHitObjectTail`'s swallow semantics from ever being needed here.)
- **Lane-collision invariant** — assert no two Hit Objects share `(lane, time)` across all tracks.
  This is the assertion that must never fire; it is a correctness bug, not a quality one.

### 6.9 Emit

One `VsrgTrack` per charted source track, `instrument` cloned from that source track's
`InstrumentData` — so timbre is preserved and Stranded Notes are impossible by construction (the
notes came from that instrument). Hit Objects are built directly and installed with
`initTracksForConstruction`. Then:

```
song.setAudioSong(sourceSong)                 // audioSongId + a modifier per source instrument
song.set({bpm: sourceBpm, pitch: sourcePitch, keys, snapPoint: <composer's current>})
song.setDurationFromNotes(source.notes)
performed.forEach(i => song.trackModifiers[i].muted = true)   // via the assigning setter
```

`difficulty` is left at its default. `hidden` is left alone — the source's notes stay drawn on the
composer timeline above the chart that performs them.

### 6.10 Rate and converge

`rateChart(song)` → Rating. If it is inside the level's band, done. Otherwise adjust the knobs one
step (chord cap, minimum gap, and the press-rate ceiling) in the
indicated direction and re-run from §6.4. Cap at `MAX_ATTEMPTS` (8); on exhaustion return the
attempt closest to the band with `converged: false`, and say so in the dialog.

Convergence is monotone in the knobs by construction — widening the minimum gap can only lower
press rate and Strain — so the loop is a bounded search, not a fixed-point iteration. The jack gap is
deliberately _not_ a knob: it moves presses between Lanes rather than adding or removing any, so it
is the one setting whose effect on a Rating has no fixed sign.

AS BUILT — the press-rate ceiling moves on every step, not "in Doubling mode only" as this section
first said. Gating it on "the pass was already thinning something" makes it unreachable exactly where
it is needed: a part inside the level's budget is never thinned, so the search is left with the chord
cap (which does nothing to single-note presses) and the minimum gap, and a stream that fits Hard's
budget while rating 8.1 has no lever to come down at all — landing generation in the band ADR-0016
reserves for hand authoring. Lowering the ceiling below what a part plays is what _creates_ something
to thin, and the mute it costs is the honest price: coverage is judged after the thinning, so a
thinned part returns as a Doubling rather than as a muted track with holes. The coverage contract is
untouched; §6.6's "Performed Tracks never enter reduction" still holds, because a reduced part is by
then no longer a Performed Track. Regression-tested with a 166-press 6.7/s stream.

## 7. The Rating model (`vsrgRating.ts`)

Per Lane, a strain value that spikes on a press and decays exponentially with time:

```
strain[lane] = strain[lane] · exp(-Δt / DECAY_MS) + pressValue
pressValue   = BASE · chordMultiplier(width) · holdMultiplier(overlap) · handMultiplier(imbalance)
```

Same-Lane repetition is punished automatically: the decay has not run its course, so the second
press lands on a hot Lane. Spread-out presses are not, which is the property plain density
statistics lack.

Aggregate by sampling total strain on a fixed grid (200ms), sorting the samples descending, and
taking a geometrically-weighted sum of the top slice — so a chart rates by its hardest sustained
stretch, not its mean and not its single worst instant. Map to 1–10 through stated absolute anchors
(there is no corpus: the repo's only vsrg fixtures are two-Hit-Object goldens), documented as
constants with the reasoning beside them:

| Rating | Anchor                                                           |
| ------ | ---------------------------------------------------------------- |
| 1–3    | ≤ ~2.5 presses/s sustained, chords ≤ 2, no jacks under 250ms     |
| 3.5–6  | ~4 presses/s sustained, occasional 3-wide chords, short bursts   |
| 6–7.9  | ~6–7 presses/s sustained, regular chords and holds, dense bursts |
| 8–10   | beyond what generation produces — hand-authored territory        |

The anchors are the part of this design most likely to be wrong, and the cheapest to fix: Rating is
derived, so re-tuning the curve re-rates every chart at once with no migration.

## 8. UX — the dialog

Lives in the Songs menu beside the background-song picker
(`VsrgComposerMenu.svelte:294`), as a button under the selected background song and disabled
without one.

Contents:

1. **Source song** — the already-picked background song, named.
2. **Chart Level** — three buttons, Normal default. Changing it re-runs prominence affordability
   and **re-ticks the proposal**, visibly.
3. **Parts** — one row per source instrument: checkbox, alias, and for the proposed one a reason
   line. Rows the level cannot afford to _perform_ are still tickable and marked "will be doubled",
   so the trade is on screen rather than discovered afterwards.
4. **Lanes** — 4/6, defaulting to the composer's current `keys`.
5. **Generate** → runs, creates the song via `songsStore.addSong`, opens it in the composer,
   and leaves the dialog open showing the outcome.
6. **Outcome** — measured Rating and whether it converged; which parts were muted and which are
   doubled; the seed. **Roll again** re-runs with a fresh seed and **overwrites the song this
   dialog created** (`songsStore.updateSong`), never a different one. Closing the dialog releases
   ownership: from then on it is an ordinary song.

All user-facing strings go through `$lib/i18n` under a new `vsrg_composer:generate_*` group; the
prominence reason is assembled from flags, never from a pre-built English sentence.

## 9. Verification

- **Golden fixtures** (`test/`, beside `vsrgSong.test.ts`): generate from the existing
  `new-format-composed-genshin` and `new-format-recorded` test songs at each level and lane count
  with a fixed seed, and pin the serialized output. This is what the seeding decision buys.
- **Invariant tests**, asserted on every generated fixture rather than by inspection:
  - no two Hit Objects share `(lane, timestamp)` across all tracks;
  - every muted source track's note count equals the count covered by Hit Objects, sustains
    included where `instrumentSupportsSustain` is true;
  - no Hit Object carries a note its track's instrument cannot voice (`numberToButton !== -1`);
  - every Hit Object's `index` is `< keys`.
- **Rating monotonicity**: widening the minimum gap or lowering the chord cap never raises the
  Rating. This is what makes the convergence loop terminate, so it is a test and not an assumption.
- **Band tests**: each level converges into its band on the fixture songs, and no level ever
  produces a Rating ≥ 8.
- **Determinism**: same request twice → identical serialization; different seed → different chart
  that still satisfies every invariant.
- `test/reactivePublish.test.ts` carries a row per `VsrgSong` callable — any mutator added here
  needs its row.

## 10. Phases

- **A — Rating.** `vsrgRating.ts` plus its tests, standing alone against hand-built charts. Nothing
  user-visible. Doing this first means the convergence loop is never built against a metric nobody
  has looked at.
- **B — Pipeline, no convergence.** Analysis, prominence, clustering, contour, constraints,
  emission. One pass at fixed per-level knobs, exercised from tests only. Golden fixtures land here.
- **C — Convergence.** The retune loop and the monotonicity test on top of B.
- **D — Dialog.** UI, i18n, song creation and the re-roll ownership rule.
- **E — Polish.** The reason line, the "will be doubled" marking, the non-convergence message.

A and B are independently useful: A alone gives the composer a live Rating readout, which is worth
having whether or not D ever ships.

## 11. Risks & mitigations

1. **The Rating anchors are guesses.** No corpus exists. Mitigation: derived, not stored, so
   re-tuning is free; the anchor table is one block of constants with the reasoning beside it; phase
   A ships before anything depends on it, so the numbers get looked at early.
2. **Prominence picks the wrong part.** The likeliest user-visible failure. Mitigation: the proposal
   is pre-ticked and overridable, and its reason is on screen — a wrong pick is one click, not an
   undo (which does not exist).
3. **Convergence oscillates or never lands.** Mitigation: monotone knobs, a hard attempt cap, and a
   best-effort return that says it did not converge rather than pretending.
4. **Doubling everywhere.** If affordability is tuned too strictly, most songs generate Doublings
   and the feature feels decorative. Mitigation: the affordability check and the Rating band share
   their knobs, so a level that can converge can also usually afford its candidate; the dialog
   reports which parts were muted, so this is visible from the first generation rather than
   inferred.
5. **Exact placement makes generated charts awkward to hand-edit** — dragging an off-grid object
   snaps and so moves it. Accepted (ADR-0016). Mitigation: none in this work; if it bites, the fix
   is a finer or non-uniform snap grid, which is its own piece of work on the composer.

## 12. Out of scope

- **Multi-track lane allocation as a distinct strategy.** §6.7's single merged pass handles multiple
  charted tracks correctly (tracks differ only in which `VsrgTrack` owns each Hit Object), but
  dedicating Lane _groups_ per part — a real charting technique for two-hand arrangements — is
  unexplored and deliberately not attempted.
- **Emitting breakpoints** at phrase boundaries. Nice, unrelated, and easy to add later.
- **Per-section Rating** and surgical retuning of only the offending stretch (the third option
  considered in grilling). Would make `breakpoints` load-bearing for generation.
- **A live Rating readout in the composer.** Phase A makes it possible; wiring it up is not part of
  this work.
- **Undo in the vsrg composer.** Routed around, not solved. If it ever arrives, the new-song rule
  should be revisited rather than preserved (ADR-0016's last consequence).
- **Generating all three levels at once**, and a song-library entry point. Both were considered and
  set aside in favour of one chart per run from the composer.
