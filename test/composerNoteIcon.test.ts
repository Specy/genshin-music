/**
 * ONE SHARED CONTENT BOX FOR THE NOTE MARKS (spec §2, 2026-08-22).
 *
 * ComposerCache bakes one texture per layer combination, framed to the whole column, and three of
 * the four marks are drawn inside `[margin/2, noteWidth - margin/2]` by construction - the filled
 * rect, the border rect and the line all take `noteWidth - margin` as their width. The circle was
 * the exception: its radius was derived from the ROW HEIGHT alone, so on a cell taller than it is
 * wide the diameter outgrew the column and the frame clipped the circle flat at the column's very
 * edge, past the margin. Pro View makes such cells routine (sky's small Editable Zones fit tall
 * rows, and the zoom multiplies them), which is where it was seen.
 *
 * The rule is a pure exported helper so this file can state it without a pixi Application; what
 * that buys is only meaningful because `drawNote` is its one production caller.
 */
import {describe, expect, it} from 'vitest'
import {noteCircleRadius} from '$cmp/pages/Composer/ComposerCache'

//the margin both shipped caches are built with (ComposerCache's own default; the Pro View passes
//no other), so the rows below are the real box rather than an invented one
const MARGIN = 4

describe('the layer-3 circle stays inside the box every other mark respects', () => {
    it('keeps the height rule wherever it fits', () => {
        //a Compressed View cell: the column is far wider than a 21st of the canvas is tall, so the
        //width term is not the smaller one and the icon is exactly the size it has always been
        expect(noteCircleRadius(40, 24, MARGIN)).toBe(24 / 3 - 0.5)
        expect(noteCircleRadius(40, 12, MARGIN)).toBe(12 / 3 - 0.5)
    })

    it('caps a cell that is taller than it is wide to the column', () => {
        //a Pro View cell at zoom: the row is the Editable Zone's, not the game's 21/15
        expect(noteCircleRadius(20, 60, MARGIN)).toBe((20 - MARGIN) / 2 - 0.5)
        //...and the height rule alone would have drawn a circle 39px across in a 20px column
        expect((60 / 3 - 0.5) * 2).toBeGreaterThan(20)
    })

    it('changes hands exactly where the two terms meet', () => {
        //`h/3 <= (w - m)/2`, i.e. `h <= 1.5 * (w - m)`: at the boundary both terms agree, so no
        //cell size is served by neither rule
        const width = 24
        const boundary = 1.5 * (width - MARGIN)
        expect(noteCircleRadius(width, boundary, MARGIN)).toBe((width - MARGIN) / 2 - 0.5)
        expect(noteCircleRadius(width, boundary, MARGIN)).toBe(boundary / 3 - 0.5)
        expect(noteCircleRadius(width, boundary - 0.6, MARGIN)).toBe((boundary - 0.6) / 3 - 0.5)
        expect(noteCircleRadius(width, boundary + 0.6, MARGIN)).toBe((width - MARGIN) / 2 - 0.5)
    })

    it('never draws a diameter wider than the box, at any cell this cache is built with', () => {
        //THE PROPERTY ITSELF, over the whole range of column widths and row heights the two views
        //produce between them (a ~1000px canvas over 8..35 columns, rows from the Compressed
        //View's 45vh/21 up to the Pro View's zoomed cap)
        for (let noteWidth = 10; noteWidth <= 130; noteWidth += 2) {
            for (let noteHeight = 6; noteHeight <= 140; noteHeight += 2) {
                const radius = noteCircleRadius(noteWidth, noteHeight, MARGIN)
                //the stroke is 1px centred on the path, so the INK reaches radius + 0.5
                expect(radius * 2 + 1).toBeLessThanOrEqual(noteWidth - MARGIN)
                //...and the height rule is still the ceiling: the cap only ever shrinks the icon
                expect(radius).toBeLessThanOrEqual(noteHeight / 3 - 0.5)
            }
        }
    })
})
