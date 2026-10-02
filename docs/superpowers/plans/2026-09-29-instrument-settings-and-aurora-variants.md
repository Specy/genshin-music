# Instrument Settings and Aurora's Variants

**Date:** 2026-09-29 · **Status:** implemented on `feat/instrument-settings` (c0e387e2, 25c3e98e, d3a13f7f, ef675c34, adec0d74); the by-ear listening checks remain · **Requested by:** Specy (grill session; decisions in ADR-0017 and ADR-0018)

## Goal

Sky's Aurora gains three **Variants** — Ah (default), Eh, Oo — built from the 2026-09-26 in-game capture, and the
app gains the general machinery behind them: **Instrument Settings**, values an instrument declares in its
`meta.json` and each track stores in the song. Variant is the first and, for now, only **Setting Kind**.

What the user sees when it is done:

- The composer's track popup and the VSRG composer's track panel show a **Variant** row for any track whose
  instrument declares one (today only Aurora). Changing it is one undo step and re-voices that track only.
- The Player (with no song loaded) and the Zen keyboard show a Variant picker next to the instrument picker. It is
  remembered, and it is recorded into songs made from the Player.
- Every existing Aurora song plays the new Ah recordings, and records `ah` the next time it is saved.
- Genshin, and every Sky instrument except Aurora, behave and serialize exactly as before.

## Decisions this plan implements (do not relitigate while implementing)

Glossary: **Take**, **Variant**, **Instrument Setting**, **Setting Kind** in `CONTEXT.md`.

- ADR-0017: Variants belong to one instrument (Aurora stays one name). A track's Variant is song data. Free-play
  keyboards keep their own choice in user settings. There is no Random option.
- ADR-0018:
  - Only instrument-declared settings count. `volume`, `reverbOverride`, `pitch`, `muted` and `solo` stay track
    properties.
  - Values live in one `settings` map inside `InstrumentData`, validated on load. Missing or invalid values play the
    default.
  - **Saving writes every declared value, defaults included.**
  - **Swapping a track's instrument resets its settings.**
  - Setting Kinds are first-party code only.
- Variant ids are permanent (`ah`, `eh`, `oo`). Labels are display text: an English fallback in `meta.json` that
  i18n overrides, following the `displayName` pattern.
- Take picks, one letter per note from C4 to C6, using the catalog letters in `new-aurora/variants/CATALOG.md`
  (the captures and catalog were deleted from the tree after implementation; commit 49360100 holds them):

  |                | C4  | D4  | E4  | F4  | G4  | A4  | B4  | C5  | D5  | E5  | F5  | G5  | A5  | B5  | C6  |
  | -------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | `ah` (default) | C   | B   | C   | A   | A   | A   | C   | A   | C   | B   | A   | A   | B   | A   | A   |
  | `eh`           | B   | A   | B   | B   | B   | D   | A   | C   | D   | E   | B   | B   | A   | A   | A   |
  | `oo`           | C   | C   | A   | B   | A   | B   | B   | A   | A   | B   | B   | B   | A   | A   | A   |

  That is 33 distinct Takes. Where Variants share a Take, it was chosen deliberately for blend (the user kept these
  picks after seeing the overlap).

## Repo rules and traps (read before touching anything)

- **No AI co-author trailer** on commits in this repo. Work on a branch (`feat/instrument-settings`): every push to
  `Dev` redeploys the beta. Merge when every phase is green.
- **Config-driven, never name-driven.** No `name === 'Aurora'` anywhere. UI rows appear because
  `declaredSettings(name)` returns a Variant. Icons come from `~icons/*`. Run the Svelte MCP autofixer on every
  changed `.svelte` file until it reports nothing.
- **`InstrumentData` copies are shallow.** The constructor, `set()` and `clone()` are `Object.assign` (`SongClasses.ts:182-245`). A nested `settings` object would be shared by the popup's `edited()` copy (`InstrumentSettingsPopup.svelte:123`), the live track, undo's before/after arrays, `toRecordedSong` (`ComposedSong.svelte.ts:849`) and `RecordedSong` clones. Every one of those must copy the map.
- **`InstrumentData.deserialize` is passed to `.map`** (`Song.svelte.ts:128`), which hands it the array index as a
  second argument. It also receives bare name **strings** (composed v1/v2) and `{}` (`VsrgSong.svelte.ts:936`). Keep
  it single-parameter and guard non-object input.
- **The decoded-sample pool is keyed by instrument name only** (`Instrument.svelte.ts:46,634,660,668`). Live
  playback and audio export share it. It defeats every other fix unless it is re-keyed.
- **Every reuse check compares names**:
  - `ComposerInstrumentSynchronizer.ts:39-48,70-78`
  - `Player.svelte:357,370`
  - `AudioPlayer.ts:49`
  - `OfflineSongRenderer.ts:51-60,407`
- **Never reload an engine in place.** A second `load()` creates a new gain node (`Instrument.svelte.ts:627`), and the old node stays registered with AudioProvider. A Variant change means a new engine plus `dispose()`, exactly like an instrument swap.
- **`registry.ts` must stay JSON-only and service-worker-safe.** Setting Kind _behavior_ (controls, loading) never gets
  imported there. Only ids and data validation do.
- **Do not bump `settingVersion`.** A bump replaces the user's whole stored settings blob with defaults
  (`SettingsService.ts:59-79`). New fields are optional and read with a fallback, following the existing
  `volume ?? 100` pattern.
- **The Player does not lock its instrument row while a song plays.** Only the composer passes `songLocked`. Free-play
  Variant changes made during a song are saved, then applied at stop (the pitch/reverb pattern at
  `Player.svelte:473-487`). They never touch the song's tracks.
- **Locales:**
  - `static/locales/zh.json` is **CRLF**. Edit it in binary mode or rewrite the whole file.
  - Indentation is 2 spaces in en/es/it/ko/pt and 4 in id/ja/ru/tr/zh*.
  - Bump `I18N_VERSIONS` (`i18nCache.ts:11-24`) for every locale touched.
- **`test:update-fixtures` rewrites every golden without comparing.** Always run `npm test` first, then update, then
  review `git diff --stat test/fixtures/`. The **song goldens must not change at all**.
- The user edits the tree while long work runs. **Ask before reverting any change you did not make.**

## Files touched (complete list)

Config and samples

- `src/lib/games/schema.ts`, `src/lib/games/types.ts`, `src/lib/games/registry.ts`
- `src/lib/games/instrumentSettings.ts` (**new**: the resolver; see 1.5; in `games/` rather than `core/`, which is excluded from lint and format)
- `scripts/gameStatic.js`
- `src/lib/games/sky/instruments/Aurora/`: 33 new `*.mp3`, `meta.json` and `README.md`. Delete `0.mp3`–`14.mp3`.
- `docs/adding-instruments-and-games.md`, `docs/skills/instrument-from-sequential-capture/SKILL.md`

Song model

- `src/lib/core/Songs/SongClasses.ts`, `ComposedSong.svelte.ts`, `RecordedSong.ts`, `VsrgSong.svelte.ts`,
  `midiTrackRoster.ts`

Audio

- `src/lib/audio/Instrument.svelte.ts`, `src/lib/audio/AudioPlayer.ts`, `src/lib/audio/OfflineSongRenderer.ts`
- `src/lib/components/pages/Composer/ComposerInstrumentSynchronizer.ts`

UI

- `src/lib/components/pages/Composer/InstrumentSettingsPopup.svelte`
- `src/lib/components/pages/Composer/MidiParser/TrackInfo.svelte`
- `src/lib/components/pages/VsrgComposer/VsrgTrackSettings.svelte`, `src/routes/vsrg-composer/+page.svelte`
- `src/lib/components/settings/InstrumentInput.svelte`, `SettingsRow.svelte`, `SettingsPane.svelte`
- `src/lib/components/pages/Player/Player.svelte`, `PlayerMenu.svelte`
- `src/routes/zen-keyboard/+page.svelte`, `src/lib/components/pages/ZenKeyboard/ZenKeyboardMenu.svelte`
- `src/lib/core/types/SettingsPropriety.ts`

i18n

- `src/lib/i18n/locales/en/index.ts`, `src/lib/i18n/binding.svelte.ts`, `src/lib/i18n/i18nCache.ts`
- `static/locales/*.json`

Tests

- new: `test/instrumentSettings.test.ts`
- extended:
  - `test/gameConfig.test.ts`, `test/serializePlain.test.ts`, `test/undoRedo.test.ts`
  - `test/audioPlayerDiffing.test.ts`, `test/composerNewSongInstrumentSync.test.ts`
  - `test/offlineRenderer.test.ts`, `test/audioContextRebuild.test.ts`
  - `test/composerInstrumentPanel.test.ts`
- regenerated: `test/fixtures/Sky/config-surface-v2.json` (the Aurora block only)

Docs already written, commit with Phase 1: `CONTEXT.md`, `docs/adr/0017-*.md`, `docs/adr/0018-*.md`

---

## Phase 1 — Config: instruments can declare settings

### 1.1 Authoring shape — `schema.ts` (`InstrumentMetaJson` :119-148)

```ts
settings?: Record<string, InstrumentSettingMetaJson>
type InstrumentSettingMetaJson = VariantSettingMetaJson // union grows with each kind
interface VariantSettingMetaJson {
  kind: 'variant'
  default: string
  options: Record<string, { label: string; files: string[] }> // key order = menu order
}
```

### 1.2 Runtime shape — `types.ts` (`InstrumentDefinition` :308-320)

- `settings?: { variant?: { default: string; options: { id: string; label: string; files: string[] }[] } }`.
  It is present **only when declared**, and must be plain data: no Maps, no functions. The living fixture structured-clones it.
- For an instrument with a Variant, `InstrumentNote.file` (:197-221) resolves to the **default** option's file. Every
  consumer that reads `notes[i].file` stays correct for the default.

### 1.3 Validation and build — `registry.ts`

`buildGameMeta` (:339-430) builds the definition field by field (:409-421), so `settings` must be added explicitly.
Otherwise it is silently dropped. Checks, each via `fail()` (:55-57):

- The kind is in a registry-side constant `SETTING_KINDS = ['variant']`.
- Setting ids and option ids match `/^[a-z][a-z0-9_-]*$/`. No `.` or `:`, because they become i18n key paths.
- A declaring instrument's folder name contains no `.` either.
- Variant:
  - It has 2 or more options, and `default` is one of them.
  - Every label is non-empty.
  - `files.length === notes.length`, and every file passes SAFE_SEGMENT (:63-68).
  - An instrument declares at most one Variant.
  - Its notes declare no `file` of their own, since the Variant owns the files. Say so in the error.
  - A file appears at one note index only: a Take belongs to one Button.

### 1.4 Asset copy — `scripts/gameStatic.js`

`prepareGameAudio` (:25-49) also copies every option's files. Deduplicate them, and apply the same SAFE_SEGMENT
check (:14-23). Without this, production gets 404s, which load as silent 1 s buffers.

### 1.5 The resolver — new `src/lib/games/instrumentSettings.ts`

This is pure logic over the active game's instrument data (`$game`), and the model, the engine and the UI all share it:

- `declaredSettings(name)` returns the definition's `settings`, or `undefined`.
- `resolveInstrumentSettings(name, stored)` returns the complete effective values, validated and with defaults
  filled in. Unknown ids are dropped, and invalid values become the default.
- `variantFiles(name, settings)` returns the per-note file list.
- `instrumentIdentityKey(name, settings)` returns `name`, or `name#<variant>` when a Variant is declared (Phase 3).

### 1.6 Tests and docs

- `test/gameConfig.test.ts`:
  - The file-existence sweep (:26-39) must cover every option's files.
  - Add validation cases next to :216-315: unknown kind, default not among the options, files length mismatch, a
    note `file` alongside a Variant, the same file at two notes, and a bad id.
- `docs/adding-instruments-and-games.md`:
  - Add a `settings` row to the meta.json reference table (:55-67).
  - Add a "Variants" subsection after Sustain (:121-159).
  - Update the "one file per button/note" wording (:30-33, :122, :212-219).
- Skill checklist: when a capture has several Takes per button, declare a Variant instead of creating sibling
  instruments (ADR-0017).

**Commit 1:** config support, tests, docs, and the glossary and ADRs. Aurora is unchanged.

## Phase 2 — Aurora's samples and declaration

### 2.1 Prepare the 33 Takes

This is a one-off script. Document it in the README, as every recorded instrument does. The source is
`new-aurora/variants/NN-<Note>-<Take>.wav` (raw 48 kHz, 24-bit mono, cut from the capture; deleted from the tree
after implementation, still in commit 49360100). For each Take:

1. **Onset:** keep at most 10 ms of pre-roll, with a 3 ms fade-in.
2. **DC removal.**
3. **Retune** any Take measuring **10 cents or more** from equal temperament, after re-measuring on the prepared PCM.
   Today that is B4 B (+10.0), A5 B (+12.1), B5 A (+15.1) and C6 A (+11.9).
   - Use `rubberband -3 -p <-cents/100>`: the R3 engine, with no time options.
   - Don't use ffmpeg's rubberband filter, which is stuck on the older R2 engine.
   - It installs without sudo: `apt-get download rubberband-cli librubberband3`, then `dpkg-deb -x` each package and
     run with `LD_LIBRARY_PATH` pointing at the extracted libraries.
   - Every other Take ships at its captured pitch.
4. **Level:** scale so the **held level** is **−16.0 dBFS**. Held level means the median of the 200 ms-smoothed level
   within 10 dB of the peak.
   - The old Aurora's held level has a median of −15.5 dBFS, so the new one keeps the same place in existing mixes.
   - The survey page auditioned with held-level matching, so this is how the picks were heard.
   - The expected worst peak is about −1.7 dBFS. **Fail if a decoded peak exceeds −1.0 dBFS.**
5. **Tail:** cut once the level stays below −70 dBFS after gain, with a 100 ms fade-out.
6. **Encode:** `ffmpeg -c:a libmp3lame -b:a 128k -ac 1` at 48 kHz. It writes the Xing/LAME gapless tag, so the
   25 ms lamejs lead-in does not apply.
7. **Verify the decoded result:**
   - Pitch within ±10 cents, or ±5 for the retuned Takes.
   - Held level −16 ± 0.5 dB.
   - Decoded lead under 12 ms.
   - Duration close to the capture's.

Name each file `<Note>-<Take>.mp3` (e.g. `C4-C.mp3`). The names pass SAFE_SEGMENT and trace straight back to
`CATALOG.md`. Delete `0.mp3`–`14.mp3`.

### 2.2 `Aurora/meta.json`

Keep displayName, family, midiName, shape, sustain and `notes: "standard-15"`, and add:

```json
"settings": { "variant": { "kind": "variant", "default": "ah", "options": {
  "ah": { "label": "Ah", "files": ["C4-C.mp3", "D4-B.mp3", "…15 files in button order…"] },
  "eh": { "label": "Eh", "files": ["C4-B.mp3", "…"] },
  "oo": { "label": "Oo", "files": ["C4-C.mp3", "…"] } } } }
```

Leave `sustain` unchanged (`{release: 0.4, minLength: 0.15}`, loopless). See the open question at the end.

### 2.3 `Aurora/README.md` (rewrite)

- **Source:** the 2026-09-26 capture (15 buttons, 381 presses, 46 Takes, C major).
- **Game behavior:** a random Take per press, never the previous one. No loop. The fade is baked into the recording.
- **Variants:** the take table, with shared Takes explained.
- **Processing:** with the retune list.
- **Relation to the old rip:** only D4 is confirmed the same recording.
- **Sustain:** unchanged, and the open question.

### 2.4 Fixture

Run `npm test`. Only `config-surface-v2` fails, in the Aurora block. Then run update-fixtures and confirm that
`git diff --stat test/fixtures/` shows that file alone.

**Commit 2:** Aurora's samples and declaration. At this point every surface plays Ah, which is safe to ship.

## Phase 3 — Song model

### 3.1 `InstrumentData` (`SongClasses.ts:162-245`)

- `SerializedInstrumentData.settings?: Record<string, string | number | boolean>`.
- Add the field `settings: InstrumentSettingValues = {}`. In memory, `{}` means "all defaults"; effective values
  always come from `resolveInstrumentSettings`.
- The constructor, `set()` and `clone()` must **copy the map into a fresh object**. `clone()` becomes
  `new InstrumentData({ ...this, settings: { ...this.settings } })`, and the constructor and `set()` copy
  `data.settings` when it is present.
- `serialize()` writes `settings` **only when the instrument declares settings**, and then writes the **complete
  effective values**, defaults included. Otherwise there is no key at all, not even `undefined` (IndexedDB keeps
  undefined keys). This is what keeps every existing golden byte-identical.
- `deserialize(data)`:
  - It stays single-parameter.
  - It treats non-object input as `{}`. That is exactly today's result, since a string's `.name` is `undefined` and
    v1/v2 names are re-applied by hand at `ComposedSong.svelte.ts:709-717`. The difference is that it no longer
    throws on the settings lookup.
  - `settings` = the stored values with unknown ids and invalid values dropped (1.5).

### 3.2 The swap rule, at every place a name changes

Add one helper, `withInstrument(name)`: it clones, sets the name and resets `settings` to `{}`. Use it at:

- `InstrumentSettingsPopup.svelte:157`: `edited({ name })` becomes `instrument.withInstrument(name)`.
- `VsrgTrackSettings.svelte:96`, in place: `track.instrument.set({ name, settings: {} })`.
- `TrackInfo.svelte:57` (MIDI import picker). A metadata round-trip keeps the settings (`midiTrackRoster.ts:79-85`
  clones them) until the user picks another instrument.
- `toOtherGame`, which should **always** reset, even for the same name (DunDun→DunDun), because the declaration
  belongs to the other game:
  - `ComposedSong.svelte.ts:2156-2157`
  - `RecordedSong.ts:693-694`
  - `VsrgSong.svelte.ts:398`
- `VsrgSong.svelte.ts:283`: the forced DunDun rename runs after validation, so reset there too.
- As a backstop, `ComposedSong.setInstrument` (:996-1034) resets settings before the roster write at :1004 whenever the
  name differs from the current entry's, inside the same Step. A caller that wants non-default settings on the new
  instrument sets them in a follow-up `setInstrument` inside one edit group.

### 3.3 Changing a Variant

There is **no new mutator**. It goes through `setInstrument(i, instrument.clone().set({ settings: { ...instrument.settings, variant } }))`, which makes it one Undo Step like every other per-track field (the popup already does this for reverb and icon).

### 3.4 Recordings

`Player.svelte:611` saves `[instruments[0].name]` only. After construction, assign
`song.instruments = [new InstrumentData({ name, settings: keyboardSettings })]`. Volume stays out of scope, as today.

### 3.5 Tests

- **Before any update**, run `npm test`. All of these must pass untouched: `instrument-data`, `primitives-v5`,
  `composed-song-v5`, `recorded-song-v4`, `vsrg-song-v3`, `example-import-v5`, `old-format-import-v5`, the Genshin
  conversions, `midi-export` and `vsrg-generated-charts`.
- New `test/instrumentSettings.test.ts` (Sky suite):
  - Aurora round-trips each Variant.
  - An Aurora track without settings loads as `{}` and serializes `{variant: "ah"}`.
  - An invalid value or unknown id becomes the default or is dropped.
  - A non-declaring instrument writes no key (`not.toHaveProperty('settings')`).
  - `clone()` and `set()` share no map.
  - A name change through `setInstrument` resets the settings in one Step, and undo restores Oo.
  - Sky→Genshin→Sky conversion resets to Ah.
  - The MIDI metadata round trip keeps Oo (`METADATA_VERSION` stays 1).
  - v1/v2 name strings still deserialize.
- `test/serializePlain.test.ts`: add a declaring-instrument row at :176-181. The "clone shares nothing" check at
  :308-337 must pass with maps present.
- `test/undoRedo.test.ts` `ROUND_TRIPS` (:357-379 neighbourhood): a Variant change and a swap-reset row.

**Commit 3:** song model.

## Phase 4 — Audio engine identity

### 4.1 `Instrument.svelte.ts`

- `constructor(name, settings?)`. Resolve the name first (the unknown-name fallback at :231), then store
  `this.settings = resolveInstrumentSettings(name, settings)`. The engine must carry its Variant so that `rehome()` →
  `load()` after a context rebuild reloads the same files.
- Build the URLs (:242-256) from `variantFiles(name, this.settings)`, and expose
  `identityKey = instrumentIdentityKey(...)`.
- Key `INSTRUMENT_BUFFER_POOL` by `identityKey` (:46, :634, :660, :668). One pooled array per (instrument, Variant),
  as today per instrument.

Per-URL pooling was considered and rejected for now. It would share the Takes two Variants have in common, which
saves about 26 MB of decoded audio only when all three Aurora Variants play at once. But loop crossfades are baked
into pooled buffers in place (:609-621, :657-659), and the key-per-engine model is the smaller change.

### 4.2 Every reuse check uses `identityKey` and constructs with settings

- `ComposerInstrumentSynchronizer.ts`: `poolByName` → pool by key (:70-78), claim (:39-48), and construct at :45.
- `Player.svelte`:
  - `doLoadInstruments` (:349-402): `needsLoad` (:357), reuse (:370) and create (:362, :380).
  - `loadInstrument` (:251-270) takes settings.
  - The stop-time restore (:173-178) and `init` (:197-201) use the user's saved settings.
- `AudioPlayer.ts:31-68`: reuse at :49, create at :42 and :59. This covers the VSRG composer, the VSRG player and
  MidiSetup.
- `OfflineSongRenderer.ts`: `PlannedTrack` (:51-60) carries `settings`, filled from the track's `InstrumentData` at
  :116-125. `loadPlannedInstruments` (:398-415) constructs with them at :407. Audio export and the live player (which
  plans through it, `PlayerKeyboard.svelte:494`) both need this.
- `zen-keyboard/+page.svelte`: construct with the saved settings (:51, :149-151), and **dispose** the engine being
  replaced. The existing leak would otherwise multiply with every Variant toggle.
- The unloaded placeholder engines (`Composer.svelte:111`, `Player.svelte:39`) must never match a live track's key.
  Keep them on their current names.

### 4.3 Tests

Extend these four tests:

- `audioPlayerDiffing.test.ts` (:101, :116)
- `composerNewSongInstrumentSync.test.ts` (:144, :250, :310)
- `offlineRenderer.test.ts` (:216)
- `audioContextRebuild.test.ts` (:223)

Cases to cover:

- The same name with a different Variant gets a different engine and different buffers.
- The same name and Variant reuses the engine.
- A context rebuild keeps the Variant.
- An undo that changes a Variant re-voices the track.

**Commit 4:** audio identity.

## Phase 5 — UI and i18n

### 5.1 Composer track popup (`InstrumentSettingsPopup.svelte`)

- Add a **Variant** row using `Select`, styled like the reverb and icon rows (:173-207), rendered only when
  `declaredSettings(instrument.name)?.variant` exists.
- Options follow the declared order, labelled with `tVariant`.
- `onChange(edited({ settings: { ...instrument.settings, variant } }))`, with `{disabled}` like its siblings.

### 5.2 VSRG track panel (`VsrgTrackSettings.svelte`)

- Add the same row, and edit in place (the panel's convention, :29-46).
- Then call `onChange(track, previous)` so the song is marked changed (`+page.svelte:645-662` only counts a change
  when `previous` is passed) and `syncInstruments` runs.

### 5.3 Free-play keyboards (Player and Zen)

- `SettingsInstrument` (`SettingsPropriety.ts:38-43`) gains `settings?: InstrumentSettingValues`.
  - It is **optional and absent from the defaults**, so the `settings-defaults` fixtures and `settingVersion` stay
    as they are.
  - Read it everywhere as `resolveInstrumentSettings(value, stored.settings ?? {})`.
- `InstrumentInput.svelte` (:45-68):
  - Show a Variant `<select>` next to the instrument select when the picked instrument declares one.
  - Changes go out through a **new callback**, `onInstrumentSettingsChange({ key, settings })`, because all three
    `handleSettingChange` implementations copy only `value`.
  - Picking another instrument clears `settings` (the swap rule).
  - Thread the callback through `SettingsRow.svelte` (:87-97) and `SettingsPane.svelte`, next to `changeVolume`.
- Player (`Player.svelte`, `PlayerMenu.svelte:541-546`):
  - Store the value in `settings.instrument.settings`.
  - With no song loaded, rebuild the user's engine.
  - With a song loaded, **save only, and apply at stop**, never touching a song track.
  - Recording carries the value (3.4).
- Zen (`+page.svelte`, `ZenKeyboardMenu.svelte:174-197`):
  - Store and **persist** it, unlike its volume today.
  - Rebuild the engine.
  - Picking an instrument from the floating picker resets settings.

### 5.4 i18n

- In `en/index.ts`:
  - Add `instrument_settings.variant: 'Variant'` (:840-853), the row label on every surface.
  - Add a new namespace, `instrument_variants: { Aurora: { ah: 'Ah', eh: 'Eh', oo: 'Oo' } }`. It can't live under
    `instruments`, whose values must be strings.
- `binding.svelte.ts`: add `tVariant(instrument, id)`. It uses `instrument_variants:<instrument>.<id>` when the key
  exists, otherwise the option's meta.json label, otherwise the id (the `tInstrument` pattern at :69-81).
- Run `npm run generate:english-locale`.
- Insert the new keys, in English, into the 11 other `static/locales/*.json`, anchored next to existing keys:
  - zh.json needs CRLF.
  - Keep each file's own indentation.
  - Bump `I18N_VERSIONS` for every file touched.
  - Then run `npm run check:translations`.

### 5.5 Tests

- `composerInstrumentPanel.test.ts`:
  - The row appears for Aurora and not for Piano.
  - Changing it is one Step and serializes the new value.
  - Swapping resets it.
- Add handler tests for the Player and Zen settings callback if a nearby suite already mounts `SettingsPane`.

**Commit 5:** UI and i18n.

---

## Verification

1. After each phase: run `npm test` (both games) before any fixture update. Then run `npm run test:update-fixtures`
   and `git diff --stat test/fixtures/`. The only regenerated fixture is `Sky/config-surface-v2.json`, plus new
   fixtures that new tests add.
2. `npm run check`, `cross-env PUBLIC_GAME=sky npm run check`, `npm run lint`, `npm run format:check`,
   `npm run check:translations`.
3. `npm run build:sky` and `npm run build:genshin`. The Sky build must contain all 33 files under
   `assets/audio/sky/Aurora/` and none of `0.mp3`–`14.mp3`.
4. By hand in `npm run dev:sky`. Headless Playwright is fine for the plumbing; the vowel checks need ears.
   1. **Composer:** add three Aurora tracks and set them to Ah, Eh and Oo. Play: three vowels. Undo and redo the
      Variant. Save, reload, and it's the same.
   2. **An existing Aurora song** plays Ah. Save it, and the file has `"settings":{"variant":"ah"}`.
   3. **Swap:** Aurora (Oo) → Piano → Aurora gives Ah. Undo twice gives Oo.
   4. **Export audio** of the three-track song: three vowels. A context rebuild (iOS interruption path) keeps them.
   5. **Player:**
      - Free play on Eh, then record: the recorded track is Eh.
      - Play a song with an Oo track: you hear Oo. Stop: back to Eh.
      - Change the Variant mid-song: it applies at stop.
   6. **Zen:** pick Oo and reload the page: still Oo.
   7. **VSRG composer:** a track on Aurora Eh plays Eh, and survives save and reload.
   8. **Cross-game:** a Sky song with Aurora Oo exported to Genshin becomes Vodyanitsa, with no settings. Taken back to
      Sky, it's Aurora Ah.
   9. **MIDI:** export and re-import in the app keeps Oo.
   10. **Genshin build:** no Variant rows appear anywhere, and songs serialize exactly as before.

## Acceptance criteria

- The Aurora Variants sound as picked on every surface: composer, player, zen, VSRG and export.
- Changing a Variant is one Undo Step and re-voices that track only.
- Saved songs record the Variant, defaults included.
- Tracks and files for instruments that declare no settings are byte-identical to before; the goldens prove it.
- A swap resets settings everywhere a name changes.
- No `settingVersion` bump. No instrument-name branches.
- Every suite, the checks and both builds are green.

## Explicit non-goals and follow-ups

- **Deferred** (ADR-0017/0018): more Setting Kinds, a Random option, a listener-side Variant preference, and
  Variant-aware MIDI (e.g. importing "Choir Aahs" as Ah).
- **Existing quirks, left alone:**
  - Changing the Player's instrument mid-song swaps out track 0.
  - Zen doesn't persist its volume.
  - `Player.changeVolume` overrides song tracks.
- **Per-URL sample sharing between Variants** (4.1).
- ~~**Remove `static/aurora-takes/`** once the survey is over.~~ Done: the survey page was removed after the picks were settled.
- **Open question for the user:** does Aurora in the game stop on key-up, or always ring out? Until answered,
  `sustain` stays `{release: 0.4, minLength: 0.15}`. If it always rings out, the 0.4 s release on note-off does not
  match the game.
