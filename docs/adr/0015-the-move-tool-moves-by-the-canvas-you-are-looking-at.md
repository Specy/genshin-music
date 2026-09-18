# The move tool moves by the canvas you are looking at

The composer's tools panel has two buttons — "Push notes up by 1 position" and its opposite — that shift the selected columns' notes vertically. Two things about them were decided together on 2026-08-29, because the second only became answerable once the first was: **what "one position" is**, and **what a note that the track's instrument cannot voice does when it moves**.

## One position is one row of the canvas in front of you

`ComposedSong.moveNotesBy` takes a `unit` (`NoteMoveUnit`), and `Composer.svelte` passes `proView ? 'semitone' : 'row'`. A Song-Grid row in the Compressed View, a semitone in the Pro View — because those are what a row of each canvas actually is. The song model has no opinion about views and never asks which one is open; it is told.

Rejected: **one behaviour everywhere — a scale step in both views**, which is what we recommended. The argument for it is real and is recorded here because it may well win a rematch:

- On a diatonic instrument, roughly **half of all semitone moves land a note on an inert row** — a row inside the Editable Zone that maps to no button. Under the no-delete rule below those notes are not lost, but they go silent and dim. So the Pro View's move button makes notes unplayable about half the time it is pressed, on the one surface where you can watch it happen.
- **Pro View is a per-user preference and never a property of the song** (CONTEXT.md). The same button, on the same song, now edits it differently depending on who opened it.

It was chosen anyway, and the reason is the stronger one: the tool's own label says "1 position", the Pro View's rows _are_ semitones, and a button that moves a note two rows on the canvas you are looking at is lying about what it does. The user's call, taken as provisional ("b for now"). What it does NOT do is give the Compressed View a semitone nudge or the Pro View a scale-step one; if either is wanted, it is a new control rather than a mode on this one.

## A note the instrument cannot voice moves by the scale, not through the instrument

The `'row'` unit has two paths, and which one a note takes is whether its own instrument can voice it:

- **Voiced** → the landing row's canonical nominal carried onto the axis by that instrument and Basepoint (`nominalToNumber`). Unchanged, and it is what keeps a note on a retuned instrument landing on the button that row prints: Vintage-Lyre's Db button catches the note stepped up from its C, and the note stays playable.
- **Stranded** → `noteIds.scaleStepNumber`, which steps the game's own scale — the Song Grid's pitch classes, repeating forever in both directions — and carries the note's accidental along.

Two separate defects made the second path necessary, and neither was reachable from the first:

- **The register teleport.** `nominalToNumber` re-derives the landing number from the instrument's sounding table. For a note that instrument cannot voice, that is not a step, it is a jump into the instrument's register: on Sky's Contrabass (nominals 60–84, register C1) a note at 72 stepped up landed on **38**, three octaves down.
- **The edge clamp.** `gridRowForNumber` places a number past the grid's edge on the edge _row_ — right for drawing it, destructive for moving it. On Genshin a note at 90 stepped down landed on 81, a nine-semitone drop, and stepped **up** it was deleted, having been clamped onto a row with nothing above it.

Rejected: **snapping the note onto the landing row's own number** (the one-expression fix). It cures the register teleport and leaves the edge clamp exactly as broken. Also rejected: **moving every note to the next scale degree, accidental discarded** — cleaner to state, works everywhere, and it quantises: the first nudge of an imported chromatic line collapses its black keys onto the scale. Carrying the accidental is what makes the tool "move the note" rather than "move the note and tidy it".

## Nothing is deleted

A note on the grid's top or bottom row pushed further leaves the grid and becomes a Stranded Note — dimmed, silent, and returned to exactly where it was by one push the other way. The one refusal is the MIDI axis itself: a move that would leave 0..127 leaves the note where it is.

It used to delete. That made the tool lossy in the ordinary case of overshooting: push a selection up twice and back down twice, and every note that touched the ceiling on the way was gone. Undo covered it; the inverse press did not. Now both do.

Rejected: **stopping at the Addressable Span** rather than at the MIDI axis. Past that band nothing can voice the note at any Basepoint — but pushing it back down rescues it, and the composer already says so on screen by dimming it, so the second boundary bought a rule to explain and no protection.

## Consequences

- **The Compressed View stacks notes on its edge row**, because it has no row for an off-grid note and draws them clamped with an accidental hint. Pushing a selection past the ceiling overlaps them there; nothing is lost and the Pro View shows the truth. Accepted deliberately over the alternative — notes at the edge refusing to move — which squashes a chord's intervals silently, which is worse damage and harder to notice.
- **Collisions still merge, and a diatonic step is what makes them.** The scale's gaps are uneven, so a whole tone followed by a semitone lands two notes a semitone apart on one number (D♯5 and E5 both step up to F5). The longest span wins, as before.
- **`scaleStepNumber` is the periodic scale's step in one place**, beside `snapMidiToGridPeriodically` which already extends the grid by octaves for MIDI import. Nothing else needs the way back to a row.
