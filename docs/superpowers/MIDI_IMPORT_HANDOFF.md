# MIDI Import Experience — implementation handoff

Written 2026-08-24 at the end of a design session. **The design is finished and written down;
no implementation has started.** This file is the working brief for the agent picking it up.

## Mission

Rebuild the composer's MIDI importer along three axes: lock the composer while the importer is
open, replace per-track _layer_ selection with per-track _instrument_ selection driven by a
General-MIDI smart guess, and change note policy so notes the chosen instrument cannot voice are
excluded by default and kept behind a new toggle.

## Read first, in this order

1. `docs/adr/0012-midi-import-chooses-instruments-and-drops-what-cannot-play.md` — the decision
   and its rationale, including why it deliberately sets the **opposite** default from ADR-0011.
2. `docs/superpowers/specs/2026-08-24-midi-import-experience-design.md` — **the build plan and
   the source of truth.** Numbered sections; the phases are §11. Everything below refers to it.
3. `CONTEXT.md` — the three glossary entries this work introduces (Addressable Span, Suggested
   Instrument, and the MIDI clause on Stranded Note) are already written and committed to the
   working tree. They describe the _target_ state, so the glossary is currently ahead of the
   code. That is expected; do not "correct" it back.
4. `AGENTS.md` — repo-wide agent rules, including where the project memory lives.

The spec was written against a six-way parallel audit of the actual code, so its file:line
citations were verified at the time of writing. Re-verify any that look stale rather than
assuming; the composer files are large and move.

## Ground rules

- **Do not revert or commit unexplained working-tree changes.** The user edits this repo while
  agents run, so any uncommitted change you did not make is theirs — including ones that look
  unrelated or accidental. Leave them, and ask if one blocks you.
- **No `Co-Authored-By` trailer** on commits in this repo.
- **Never branch on game id.** Capability is derived from config so a feature lights up when
  config gains it. This is a standing user rule and the spec's §5 depends on it — the adjacency
  table is a statement about General MIDI, not about our two rosters.
- **Svelte 5 runes** throughout (`$state`, `$derived`, `$props`); this codebase is post-migration
  and does not use stores for component state.
- **English i18n only.** Add keys to `src/lib/i18n/locales/en/index.ts`; the other 11 locales
  fall back per-key. Do not machine-translate them. See §7.3 — and note the checker compares
  _key sets only_, so a changed meaning needs a **new key**, never an edited string.
- Commit per phase with a message that names the phase. Ask before force-pushing or rewriting
  history.

## Phases

§11 of the spec defines six, each ending green. They are ordered so each is independently
reviewable and the risky churn is isolated:

- **A — the lock.** §3. Independently valuable: it fixes the destroyed-edits defect on its own,
  before any import semantics move. Start here.
- **B — core moves and repairs.** §6.3, §6.4, §7.2, §8. Pure core-tier, own tests, no UI
  dependency.
- **C — config corrections.** §5.4, §9. Isolated so the golden-fixture churn is one commit.
- **D — the suggestion.** §5, against C's corrected config.
- **E — the roster.** §4. Deletes `defaultLayerForTrack`.
- **F — the panel.** §6.5, §7.

If you run out of night, stop at a phase boundary with the suite green rather than half-landing
the next one.

## Verification

```bash
npm test
```

That is `test:genshin` then `test:sky` — the suite runs **twice**, once per `PUBLIC_GAME`, and
both must pass. Baseline at handoff: 80 test files; Genshin 1421 passed / 5 skipped, Sky 1378
passed / 48 skipped.

Also run, and keep green:

```bash
npm run check && npm run lint && npm run format:check
```

`npm run check:translations` reports missing keys and exits 0; it is not in CI. Expect it to
report the new English-only keys — that is the intended state, not a failure.

## Fixture policy — read before regenerating anything

Three different kinds of fixture are touched by phase C, and they are **not** handled the same
way (§9):

- `test/fixtures/{Sky,Genshin}/config-surface-v2.json` — living golden. Regenerate.
- `test/fixtures/{Sky,Genshin}/config-surface.json` — **FROZEN. Do not regenerate.** It exists
  precisely so a config edit cannot quietly redefine what the app used to be. Add an explicit
  expected-deviation entry in the form the existing `frozen.midiBounds.upper = 83` precedent
  establishes in `test/configSurface.test.ts`. If a deviation entry cannot express the change,
  stop and ask rather than regenerating.
- `test/fixtures/{Sky,Genshin}/midi-export.json` — golden **base64 byte** comparison of exported
  `.mid` output. The corrected `midiName` values change program-change bytes, so this flips
  deliberately. Regenerate, and say so in the commit message.

## Settled — do not re-litigate

These were decided with the user during the grilling session, several against the obvious
alternative. Reopening them costs a round trip the user is not awake for:

- Live preview into the real composer + an edit lock, **not** a staged import with a commit
  button. The canvas is the preview.
- The lock is enforced in the **handlers**, not by `disabled` props alone. Roughly half the
  note-entry surface never touches a blockable control (§3.2).
- The roster is built from the selected tracks, exactly. The open song's roster is irrelevant.
- The suggestion **never** reads the track's notes — a pre-selection that moves when the offset
  moves is worse than one that is merely imperfect.
- "Out of range" means _the chosen instrument cannot voice it_, not _outside `MIDI_BOUNDS`_.
  Default drops those notes. This is a user-visible behaviour change and it is intended.
- `midiName` and `family` are validated separately and are **not** required to agree. Only the
  values that are not GM vocabulary get corrected (§5.4). Retagging Contrabass from `guitar` to
  `strings` was measured and **rejected** — it fixes `guitar` → Guitar but breaks `strings` →
  Contrabass, because roster order puts Contrabass ahead of Cello.
- Stats keep three columns; the ↑↓ split becomes instrument-relative and need not sum to the
  total.

## Flag rather than decide

- If the modulo fold in §6.4 cannot be made coherent for sub-octave instruments even as
  best-effort, say so — do not quietly restore the old loop or widen the fold's remit.
- Exact English wording for the new strings is yours to draft, but if a new key would change the
  meaning of an existing translated one, follow §7.3's rule (new key, delete the stale one) and
  note it.
- If the synchronizer's name-keyed reuse (§4.5) turns out to need a larger refactor than a pool,
  land phases A–D without it and report; the reload is a performance defect, not a correctness
  one.

## The landmines, condensed

All are documented in the spec with citations; this is the short list so you recognise them when
you hit them.

1. A live **Duration Hold** turns a plain selection move — which stays unlocked — into a span
   write. Opening the importer must settle in-flight gestures, not just refuse new ones (§3.3).
2. `startSustainRecording` **adds a note** as part of beginning to sound it. Under the lock that
   press must degrade to a plain audition (§3.2).
3. The importer's base-pitch selector must be **deleted**, not blocked — blocking leaves the
   control dead, and `loadSong` already re-seeds the composer's pitch setting (§3.4).
4. `loadSong`'s conditional close (`if (songToLoad.id && song.id === null)`) both misses the
   saved-song case and, if made unconditional, closes the importer that the
   `?songId=X&showMidi=true` route just opened (§3.4).
5. Metadata is indexed by **original** MIDI track index, not by position in the selected set —
   export writes one track per layer including silent ones, and the panel filters noteless
   tracks out (§4.2). This reasoning lives only in `defaultLayerForTrack`'s docstring today, and
   phase E deletes it.
6. Track-name-as-alias corrupts our own round trip: `"Db | My Bass"`, `"pizzicato strings"`,
   `"Track n.3"`. Parse the first, accept the second, never adopt the third (§4.3).
7. An **empty roster** is newly reachable by deselecting every track, and `playSound`
   dereferences `song.instruments[layer].pitch` unguarded (§4.4).
8. Channel-9 tracks report family `"drums"` (not a GM family) and an `undefined` patch name.
   Both of the first two suggestion tiers miss them entirely (§5.3).
9. `suggestOffset`'s 2-argument signature cannot express per-track Basepoints; it takes per-track
   groups instead, and the six tests in its `describe` block move with it (§6.5).
10. Moving `addressableSpan` into `$core/Songs/noteIds.ts` invalidates the "PRO VIEW GEOMETRY
    CARVE-OUT" paragraph in `legacyConfig.ts` and `proViewGeometry.ts`'s own header, both of
    which justify a carve-out by that file value-importing `INSTRUMENTS_DATA` and `PITCHES`.
    After the move it imports neither (§8).

## Out of scope

§10 of the spec. In particular: no accidental-preserving import (ADR-0007 still defers it), no
composer folding tool, no per-track offset suggestion, and no read-only mode for anything but
the importer.
