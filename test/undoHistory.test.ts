// Container-level lifecycle of the composer's Undo Step history (2026-08-24 undo/redo design §8.5):
// group collapse, unbalanced-group defense, cap eviction, redo invalidation, Savepoint walks
// (including eviction/stranding) and empty-Step discard. Everything here is song-agnostic on
// purpose - UndoHistory knows nothing about deltas, so nothing below constructs a song. The
// per-mutator round-trip table and the fuzz walks live in test/undoRedo.test.ts.
//
// Plain `.ts` like every other suite: the runes stay inside UndoHistory.svelte.ts and
// test/signals.svelte.ts (the split test/reactivePublish.test.ts already uses).
import {afterEach, describe, expect, it, vi} from 'vitest'
import {UNDO_HISTORY_CAP, UndoHistory, type UndoStep} from '$core/Songs/UndoHistory.svelte'
import {flushEffects, observeDerived} from './signals.svelte'

/** Stand-in for ComposedSongDelta: identity is all the container is allowed to care about. */
interface Delta {
    op: string
}

function makeHistory(): UndoHistory<Delta> {
    return new UndoHistory<Delta>()
}

/** One closed Step of `count` deltas, as a mutator's implicit scope would produce it. */
function recordStep(history: UndoHistory<Delta>, selected = 0, count = 1, label?: string): Delta[] {
    const deltas = Array.from({length: count}, (_, i) => ({op: `${label ?? 'op'}:${selected}:${i}`}))
    history.beginStep(selected, label)
    deltas.forEach(delta => history.record(delta))
    history.endStep()
    return deltas
}

/** Drains the undo stack, newest first. */
function undoAll(history: UndoHistory<Delta>): UndoStep<Delta>[] {
    const popped: UndoStep<Delta>[] = []
    for (let step = history.undoStep(); step; step = history.undoStep()) popped.push(step)
    return popped
}

describe('implicit Steps', () => {
    it('makes one Step per outermost scope, nested calls folding in', () => {
        const history = makeHistory()
        //removeColumns -> validateBreakpoints + normalizeSpans: three scopes, one Step
        history.beginStep(4, 'removeColumns')
        history.record({op: 'columnsRemoved'})
        history.beginStep(4, 'validateBreakpoints')
        history.record({op: 'breakpointsReplaced'})
        history.endStep()
        history.beginStep(4, 'normalizeSpans')
        history.record({op: 'noteFieldChanged'})
        history.endStep()
        history.endStep()

        const step = history.undoStep()!
        expect(step.deltas.map(d => d.op))
            .toEqual(['columnsRemoved', 'breakpointsReplaced', 'noteFieldChanged'])
        //the OUTERMOST scope owns the memo and the label - the inner ones are implementation
        expect(step.label).toBe('removeColumns')
        expect(step.selected).toBe(4)
        expect(history.undoStep()).toBeNull()
    })

    it('discards a Step that recorded nothing', () => {
        const history = makeHistory()
        history.beginStep(2, 'setNoteSpan (no such note)')
        history.endStep()
        expect(history.canUndo).toBe(false)
        expect(history.isDirty).toBe(false)
        expect(history.undoStep()).toBeNull()
    })

    it('keeps a no-op mutator from destroying the redo branch', () => {
        //the reason redo dies at the first RECORD, not at beginStep: an empty Step is not an edit
        const history = makeHistory()
        recordStep(history)
        history.undoStep()
        expect(history.canRedo).toBe(true)

        history.beginStep(0, 'no-op')
        history.endStep()
        expect(history.canRedo).toBe(true)
        expect(history.redoStep()).not.toBeNull()
    })

    it('hands deltas back by reference, never a copy', () => {
        //the by-reference rule of ADR-0013: the delta holds the detached note/column itself, so the
        //stacks must never be `$state` (a proxy of it would be re-inserted into the live graph)
        const history = makeHistory()
        const deltas = recordStep(history, 0, 2)
        const step = history.undoStep()!
        expect(step.deltas[0]).toBe(deltas[0])
        expect(step.deltas[1]).toBe(deltas[1])
        expect(history.redoStep()).toBe(step)
    })

    it('lands a record made outside any Step, with the last cursor memo', () => {
        const history = makeHistory()
        recordStep(history, 7)
        history.undoStep()
        history.record({op: 'stray'})
        const step = history.undoStep()!
        expect(step.deltas.map(d => d.op)).toEqual(['stray'])
        expect(step.selected).toBe(7)
    })
})

describe('groups', () => {
    it('collapses several mutator calls into one Step', () => {
        //Duration Hold: the popover's `<`/`>` ticks are separate setNoteSpan calls, one Step
        const history = makeHistory()
        history.beginGroup()
        recordStep(history, 3, 1, 'setNoteSpan')
        recordStep(history, 5, 1, 'setNoteSpan')
        recordStep(history, 5, 1, 'setNoteSpan')
        expect(history.canUndo).toBe(true) //the edits already happened, whatever the stack holds
        expect(history.isDirty).toBe(true)
        history.endGroup()

        const step = history.undoStep()!
        expect(step.deltas).toHaveLength(3)
        //the memo is the column the gesture STARTED on, not where the last tick landed
        expect(step.selected).toBe(3)
        expect(history.undoStep()).toBeNull()
    })

    it('is reentrant - only the outermost endGroup closes the Step', () => {
        const history = makeHistory()
        history.beginGroup()
        history.beginGroup()
        recordStep(history)
        history.endGroup()
        expect(history.groupDepth).toBe(1)
        expect(history.canRedo).toBe(false)
        recordStep(history)
        history.endGroup()
        expect(history.groupDepth).toBe(0)

        expect(history.undoStep()!.deltas).toHaveLength(2)
        expect(history.undoStep()).toBeNull()
    })

    it('drops empty groups', () => {
        const history = makeHistory()
        history.beginGroup()
        history.endGroup()
        expect(history.canUndo).toBe(false)
        expect(history.undoStep()).toBeNull()
    })
})

describe('unbalanced-group defense', () => {
    afterEach(() => vi.restoreAllMocks())

    it('no-ops on endGroup with no open group, warning in dev', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const history = makeHistory()
        recordStep(history)
        history.endGroup()
        expect(history.groupDepth).toBe(0)
        //the stray endGroup changed nothing about the history it was called on
        expect(history.undoStep()!.deltas).toHaveLength(1)
        if (import.meta.env.DEV) expect(warn).toHaveBeenCalled()
    })

    it('never cuts an in-flight mutator Step short', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const history = makeHistory()
        history.beginStep(1, 'setInstrument')
        history.record({op: 'instrumentsReplaced'})
        history.endGroup() //stray: a popover dismissal path that never opened a group
        history.record({op: 'noteFieldChanged'})
        history.endStep()

        expect(history.undoStep()!.deltas).toHaveLength(2)
        if (import.meta.env.DEV) expect(warn).toHaveBeenCalled()
    })

    it('force-closes an abandoned group when the history is walked', () => {
        const history = makeHistory()
        recordStep(history, 0, 1, 'earlier')
        history.beginGroup()
        history.beginGroup()
        recordStep(history, 9, 2, 'hold')

        const step = history.undoStep()!
        expect(step.label).toBe('hold')
        expect(step.deltas).toHaveLength(2)
        expect(history.groupDepth).toBe(0)
        //the force-closed Step is a normal Step: it redoes, and the one under it is still there
        expect(history.redoStep()).toBe(step)
        expect(history.undoStep()).toBe(step)
        expect(history.undoStep()!.label).toBe('earlier')
    })

    it('force-closes a half-open mutator Step too', () => {
        const history = makeHistory()
        history.beginStep(2, 'interrupted')
        history.record({op: 'noteAdded'})

        expect(history.undoStep()!.deltas.map(d => d.op)).toEqual(['noteAdded'])
        //the abandoned depth is reset, so the NEXT mutator opens a Step of its own
        recordStep(history, 0, 1, 'after')
        expect(history.undoStep()!.label).toBe('after')
    })
})

describe('cap and redo invalidation', () => {
    it(`keeps ${UNDO_HISTORY_CAP} Steps, evicting the oldest`, () => {
        const history = makeHistory()
        const overflow = 20
        for (let i = 0; i < UNDO_HISTORY_CAP + overflow; i++) recordStep(history, i, 1, `step${i}`)

        const popped = undoAll(history)
        expect(popped).toHaveLength(UNDO_HISTORY_CAP)
        expect(popped[0].label).toBe(`step${UNDO_HISTORY_CAP + overflow - 1}`) //newest kept
        expect(popped.at(-1)!.label).toBe(`step${overflow}`) //oldest survivor
        expect(history.canUndo).toBe(false)
        //everything that came back is redoable: eviction happens on landing, never on a walk
        expect(history.canRedo).toBe(true)
    })

    it('never evicts while walking the history', () => {
        const history = makeHistory()
        for (let i = 0; i < UNDO_HISTORY_CAP; i++) recordStep(history, i, 1, `step${i}`)
        undoAll(history)
        for (let i = 0; i < UNDO_HISTORY_CAP; i++) expect(history.redoStep()).not.toBeNull()

        expect(history.canRedo).toBe(false)
        expect(undoAll(history)).toHaveLength(UNDO_HISTORY_CAP)
    })

    it('clears the redo stack when a new Step lands', () => {
        const history = makeHistory()
        recordStep(history, 0, 1, 'a')
        recordStep(history, 1, 1, 'b')
        recordStep(history, 2, 1, 'c')
        history.undoStep()
        history.undoStep()
        expect(history.canRedo).toBe(true)

        recordStep(history, 3, 1, 'd')
        expect(history.canRedo).toBe(false)
        expect(history.redoStep()).toBeNull()
        expect(undoAll(history).map(step => step.label)).toEqual(['d', 'a'])
    })

    it('clears the redo stack at the first delta of a group, not at its end', () => {
        //a Duration Hold that is still open has already edited the song; redo must be dead by then
        const history = makeHistory()
        recordStep(history)
        history.undoStep()
        history.beginGroup()
        expect(history.canRedo).toBe(true)
        history.beginStep(0, 'setNoteSpan')
        history.record({op: 'noteFieldChanged'})
        expect(history.canRedo).toBe(false)
        history.endStep()
        history.endGroup()
    })
})

describe('savepoint walks', () => {
    it('starts clean and follows the walk back to the saved position', () => {
        const history = makeHistory()
        expect(history.isDirty).toBe(false)

        recordStep(history, 0, 1, 'a')
        expect(history.isDirty).toBe(true)
        history.undoStep()
        //back at BOTTOM, which is where the freshly installed song was saved
        expect(history.isDirty).toBe(false)
        history.redoStep()
        expect(history.isDirty).toBe(true)

        history.markSavepoint()
        expect(history.isDirty).toBe(false)
        recordStep(history, 1, 1, 'b')
        recordStep(history, 2, 1, 'c')
        expect(history.isDirty).toBe(true)
        history.undoStep()
        expect(history.isDirty).toBe(true)
        history.undoStep()
        //undoing back to the Savepoint makes the song clean - nothing prompts about undone changes
        expect(history.isDirty).toBe(false)
        history.undoStep()
        expect(history.isDirty).toBe(true) //past it, in the other direction
    })

    it('is dirty while a gesture is still open', () => {
        const history = makeHistory()
        history.markSavepoint()
        history.beginGroup()
        history.beginStep(0, 'hold')
        history.record({op: 'noteFieldChanged'})
        expect(history.isDirty).toBe(true)
        history.endStep()
        history.endGroup()
        expect(history.isDirty).toBe(true)
    })

    it('strands a save taken mid-gesture, in BOTH walk directions', () => {
        //the autosave cadence can fire inside a Duration Hold: the file then holds the half-finished
        //gesture, which no Step boundary describes. Undoing the hold must NOT read clean - the file
        //would keep the edit that was just undone (see markSavepoint).
        const history = makeHistory()
        recordStep(history, 0, 1, 'before the hold')
        history.beginGroup()
        history.beginStep(0, 'setNoteSpan')
        history.record({op: 'noteFieldChanged'})
        history.markSavepoint() //the autosave, mid-hold
        history.endStep()
        history.endGroup()

        expect(history.isDirty).toBe(true)
        history.undoStep() //back at 'before the hold', which is NOT what was written
        expect(history.isDirty).toBe(true)
        undoAll(history)
        expect(history.isDirty).toBe(true)
        history.markSavepoint() //...and a save at a real boundary cleans it again
        expect(history.isDirty).toBe(false)
    })

    it('stays dirty when the saved Step is evicted past the cap', () => {
        const history = makeHistory()
        recordStep(history, 0, 1, 'saved')
        history.markSavepoint()
        for (let i = 0; i < UNDO_HISTORY_CAP; i++) recordStep(history, i, 1, `step${i}`)

        expect(history.isDirty).toBe(true)
        //and no walk can find it again: the Step is gone from both stacks
        undoAll(history)
        expect(history.isDirty).toBe(true)
    })

    it('strands a BOTTOM savepoint once the oldest Step is evicted', () => {
        //"before the oldest Step" stops meaning "the saved file" the moment eviction starts, so
        //draining the stack must NOT read clean
        const history = makeHistory()
        for (let i = 0; i <= UNDO_HISTORY_CAP; i++) recordStep(history, i, 1, `step${i}`)
        undoAll(history)
        expect(history.canUndo).toBe(false)
        expect(history.isDirty).toBe(true)
    })

    it('strands a savepoint left in a cleared redo branch', () => {
        const history = makeHistory()
        recordStep(history, 0, 1, 'a')
        recordStep(history, 1, 1, 'saved')
        history.markSavepoint()
        history.undoStep()
        expect(history.isDirty).toBe(true)

        recordStep(history, 2, 1, 'divergent') //drops the branch the Savepoint sat in
        expect(history.isDirty).toBe(true)
        history.undoStep() //back at 'a', where the save is NOT
        expect(history.isDirty).toBe(true)
        undoAll(history)
        expect(history.isDirty).toBe(true)
    })

    it('re-saving at any position makes it clean again', () => {
        const history = makeHistory()
        recordStep(history, 0, 1, 'a')
        history.markSavepoint()
        recordStep(history, 1, 1, 'b')
        history.markSavepoint()
        expect(history.isDirty).toBe(false)
        history.undoStep()
        expect(history.isDirty).toBe(true)
        history.redoStep()
        expect(history.isDirty).toBe(false)
    })
})

describe('the version signal reaches deriveds', () => {
    //through a `$derived`, not a bare effect: the composer reads these getters from templates and
    //deriveds, which only propagate when the VALUE changes - see test/signals.svelte.ts
    it('flips canUndo, canRedo and isDirty for subscribers', async () => {
        const history = makeHistory()
        const canUndo = observeDerived(() => history.canUndo)
        const canRedo = observeDerived(() => history.canRedo)
        const isDirty = observeDerived(() => history.isDirty)
        try {
            await flushEffects()
            const baseline = [canUndo.runs(), canRedo.runs(), isDirty.runs()]

            recordStep(history) //false -> true for canUndo and isDirty, canRedo unchanged
            await flushEffects()
            expect(canUndo.runs()).toBeGreaterThan(baseline[0])
            expect(isDirty.runs()).toBeGreaterThan(baseline[2])
            expect(canRedo.runs()).toBe(baseline[1])

            const afterEdit = canRedo.runs()
            history.undoStep()
            await flushEffects()
            expect(canRedo.runs()).toBeGreaterThan(afterEdit)

            const afterUndo = isDirty.runs()
            history.redoStep()
            await flushEffects()
            expect(isDirty.runs()).toBeGreaterThan(afterUndo)

            const afterRedo = isDirty.runs()
            history.markSavepoint() //dirty -> clean with no stack change at all
            await flushEffects()
            expect(isDirty.runs()).toBeGreaterThan(afterRedo)
        } finally {
            //load-bearing: a failed assertion would otherwise leave live effect roots counting for
            //the rest of the file (test/reactivePublish.test.ts's firedSignals has the same finally)
            canUndo.dispose()
            canRedo.dispose()
            isDirty.dispose()
        }
    })

    it('publishes canUndo on the first delta of an open Step', async () => {
        const history = makeHistory()
        const canUndo = observeDerived(() => history.canUndo)
        try {
            await flushEffects()
            const baseline = canUndo.runs()
            history.beginGroup()
            history.beginStep(0, 'hold')
            history.record({op: 'noteFieldChanged'})
            await flushEffects()
            //the undo button must light up during the gesture, because pressing it force-closes
            //the group and undoes exactly this
            expect(canUndo.runs()).toBeGreaterThan(baseline)
        } finally {
            canUndo.dispose()
        }
    })
})
