/**
 * THE TWO BREAKPOINTS EVERY SONG HAS AND NOBODY PUT THERE: its FIRST column and its LAST.
 *
 * They are DERIVED from the column count, never stored in `ComposedSong.breakpoints`, and that is
 * the whole mechanism:
 *  - there is no array entry for toggleBreakpoint to take out, so they cannot be removed - the
 *    toggle refuses those two indexes outright and the composer's button is disabled on them;
 *  - the end one FOLLOWS the song. Stored as an index it would go stale the moment a column was
 *    added or removed, which is exactly the staleness validateBreakpoints exists to clean up;
 *  - nothing serializes them. `breakpoints` keeps holding exactly what the user put there, so a
 *    song written before these existed round-trips unchanged - including the `[0]` the constructor
 *    has always written, which simply coincides with the fixed first one now.
 *
 * A stored breakpoint that lands on one of the two is covered by it: withFixedBreakpoints dedupes,
 * and the toggle refuses the index whether or not the array holds it. The stored entry comes back
 * into play if the song later grows past it, which is the sane reading of both facts.
 *
 * A ONE-COLUMN song has ONE of them and not two (both rules name the same index), and a song with
 * NO columns has none - the same "a breakpoint must address a real column" rule
 * ComposedSong.#addressesColumn states for the stored ones.
 *
 * Its own module rather than a method on ComposedSong because all three surfaces that need it -
 * the model's toggle, the canvas' button and the renderer's markers - would otherwise state the
 * rule separately, and the renderer is behind the dynamic pixi import where a value import of the
 * whole song model does not belong.
 */
export function isFixedBreakpoint(index: number, columnCount: number): boolean {
    return columnCount > 0 && (index === 0 || index === columnCount - 1)
}

/**
 * The stored breakpoints plus the fixed ones, deduped and ASCENDING - what a surface that DRAWS
 * markers or STEPS between them works from.
 *
 * It allocates, so the per-column hot paths ask isFixedBreakpoint directly instead of unioning
 * once per painted column (see ComposerRenderer.paintColumn).
 */
export function withFixedBreakpoints(breakpoints: number[], columnCount: number): number[] {
    const all = new Set(breakpoints)
    if (columnCount > 0) {
        all.add(0)
        all.add(columnCount - 1)
    }
    return [...all].sort((a, b) => a - b)
}
