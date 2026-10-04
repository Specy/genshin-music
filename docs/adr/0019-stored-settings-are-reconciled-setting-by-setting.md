# Stored settings are reconciled setting by setting on every load

Each settings family (player, composer, zen keyboard, sheet visualizer, both VSRG pages) is saved to localStorage whole: every setting's definition, meaning its name, tooltip, options, range and notes, sits next to the value the user chose. Loading used to trust that blob completely, unless its `settingVersion` differed from the code's, in which case it was thrown away. Both halves went wrong. Adding one checkbox meant bumping the version, and the bump reset every other setting the user had chosen. A definition edit that came without a bump, such as a new option, a reworded label or the setting notes added beside this ADR, never reached anyone who already had a blob. The MIDI settings had already sidestepped the wipe by backfilling their shortcut list.

We decided (2026-10-04): **on every load the stored blob is reconciled against the code's definitions, one setting at a time** (`core/Services/reconcileSettings.ts`):

- A stored value is **kept** when its entry has the same `type` as the code's setting and the value fits the definition. A checkbox needs a boolean and a text setting a string. A number or slider needs a finite number inside its `threshold`, the same bounds the inputs hold an edit to. A select or instrument needs one of the current `options`.
- Anything else **falls back to that setting's default**. This covers a setting added since the blob was written, one whose `type` changed (even when the old value would happen to fit the new type), and a value the definition no longer accepts, like a removed option or a narrowed range.
- A stored key the code no longer has is **dropped**.
- Every definition comes **from the code**. Storage only ever contributes values.
- An instrument setting's volume is checked on its own, so a bad volume costs only the volume, and an instrument this build lacks still keeps the user's loudness. Its Instrument Settings are normalized against the instrument it ends up on. They are dropped with an instrument that fell back to the default, since a setting belongs to the instrument that declared it (ADR-0018).

The result is written back whenever it differs from what was stored, or the version moved, so the next load finds it already reconciled. Nothing stored means fresh defaults and no write. The result is always a fresh copy, never the module-level defaults object, which callers go on to mutate.

**What a change to a setting needs now: nothing beyond the change.** Adding, removing, retyping or re-optioning a setting carries every user over with their other choices intact. `settingVersion` gates nothing any more. It is still written, and bumping it only forces a write-back. To move existing users onto a new default for a setting whose old values still validate, because the setting's meaning changed, **rename its key**: the old key is dropped and the new one starts at its default.

Considered and rejected:

- **Reconciling only when the version is bumped.** This is how the change was first framed, and on a bump it behaves identically. But the definitions inside the blob would stay stale until someone remembered to bump, which is the same forgotten-bump bug in a new place. Reconciling a few dozen fields per page load costs nothing.
- **Per-setting version numbers** to force one setting back to its default. Renaming the key does the same with no new field to maintain.
- **Keeping the whole-blob wipe for "big" changes.** No change is big enough to justify resetting settings it did not touch.

## Consequences

- A beta blob of the sheet visualizer's first version keeps its label choice instead of resetting to No Text. That reset was a side effect of the old wipe, not something the change that bumped it asked for (the removed `noteNames` switch is dropped either way).
- The MIDI settings, a differently shaped blob with its own shortcut backfill, and themes are unchanged.
- Setting definitions must stay plain JSON data. That was already true, because they are stored. It is also what lets a setting's `notes` and `when` values reach users through the reconcile.
