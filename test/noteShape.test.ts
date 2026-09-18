// The hold ring's sweep is a single dash the length of the outline, walked off by animating
// stroke-dashoffset from 0 to that same length. So the perimeter ringGeometry() reports is not
// decorative: if it disagrees with the path it emits, the ring either empties early (leaving a
// player holding a note the cue says is done) or never empties at all. These assertions pin the
// arithmetic that both shipped silhouettes depend on.
import {describe, expect, it} from 'vitest'
import {ringGeometry, RING_VIEWBOX} from '../src/lib/games/noteShape'
import type {NoteShape} from '../src/lib/games/types'

//ringGeometry insets the outline by 5 on each side of the viewBox
const SIDE = RING_VIEWBOX - 10

describe('ringGeometry', () => {
    it('gives a circle the circumference of its inscribed circle', () => {
        const {perimeter} = ringGeometry({kind: 'circle'})
        expect(perimeter).toBeCloseTo(Math.PI * SIDE, 2)
    })

    it('treats a 0.5 corner ratio as exactly the circle case', () => {
        //the generator is shared, so this is what guarantees one formula covers both shapes
        const rounded = ringGeometry({kind: 'rounded-rect', cornerRatio: 0.5})
        expect(rounded).toEqual(ringGeometry({kind: 'circle'}))
    })

    it('gives a zero corner ratio the perimeter of a plain square', () => {
        const {perimeter} = ringGeometry({kind: 'rounded-rect', cornerRatio: 0})
        expect(perimeter).toBeCloseTo(4 * SIDE, 2)
    })

    it("reports Sky's rounded square as four straight runs plus one full circle of corner", () => {
        const ratio = 0.21
        const r = SIDE * ratio
        const {perimeter} = ringGeometry({kind: 'rounded-rect', cornerRatio: ratio})
        expect(perimeter).toBeCloseTo(4 * (SIDE - 2 * r) + 2 * Math.PI * r, 2)
    })

    it('clamps a corner ratio past a half instead of returning a negative perimeter', () => {
        //past 0.5 the arcs would overlap and the straight runs would go negative, which would
        //hand the animation a dash length shorter than the path it has to cover
        const {perimeter} = ringGeometry({kind: 'rounded-rect', cornerRatio: 5})
        expect(perimeter).toBeCloseTo(Math.PI * SIDE, 2)
        expect(perimeter).toBeGreaterThan(0)
    })

    it('starts every outline at top centre so the sweep reads like a clock hand', () => {
        //a rect's native path would start at its top-LEFT corner; the shared generator moves the
        //origin to the top edge's midpoint for every silhouette, which is why no CSS rotation
        //(which would tip a square onto its corner) is needed
        const mid = RING_VIEWBOX / 2
        for (const shape of [
            {kind: 'circle'},
            {kind: 'rounded-rect', cornerRatio: 0.21},
            {kind: 'rounded-rect', cornerRatio: 0},
        ] satisfies NoteShape[]) {
            expect(ringGeometry(shape).d.startsWith(`M${mid} 5`)).toBe(true)
        }
    })

    it('closes every outline, so the stroke has no seam at the origin', () => {
        expect(ringGeometry({kind: 'circle'}).d.endsWith('Z')).toBe(true)
        expect(ringGeometry({kind: 'rounded-rect', cornerRatio: 0.21}).d.endsWith('Z')).toBe(true)
    })
})
