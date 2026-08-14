/**
 * How many columns a HELD key is worth — the rule live sustain recording writes down.
 *
 * Rounded against the real column lengths (so tempo changers count for what they actually
 * last): the note is worth N+1 columns only once the hold passes the MIDPOINT of the (N+1)th.
 *
 * Counting tick CROSSINGS instead — the obvious reading of "still held when the next column is
 * selected" — records ordinary taps as sustains, because the composer's model runs
 * `lookaheadTime` ahead of the audio: a note played in time with what the user HEARS lands
 * near the END of the model's current column, so even a short tap crosses the next tick. This
 * measures the gesture instead of the phase it happened to land on.
 *
 * @param heldMs      how long the key has been down
 * @param maxSpan     columns the playhead has actually reached (a sustain is never recorded
 *                    into the future); the result is clamped to at least 1
 * @param columnMsAt  length in ms of the column `offset` columns after the note's own
 */
export function spanForHeldMs(
  heldMs: number,
  maxSpan: number,
  columnMsAt: (offset: number) => number
): number {
  let span = 1;
  let covered = columnMsAt(0);
  while (span < maxSpan) {
    const next = columnMsAt(span);
    if (heldMs < covered + next / 2) break;
    covered += next;
    span++;
  }
  return span;
}
