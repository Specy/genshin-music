import type { NoteShape } from './types';

/**
 * Outline geometry for overlays drawn around a note button — today the practice hold ring.
 *
 * Everything is expressed in the ring SVG's own 100x100 viewBox, so the caller only has to
 * scale the <svg>; no shape needs to know the button's real pixel size.
 *
 * Every outline is emitted as a <path> starting at TOP CENTRE and running clockwise. That is
 * what makes the ring's sweep read like a clock hand for any silhouette, and it is why these
 * are paths rather than <circle>/<rect>: a rect's native path starts at its top-left corner,
 * and the usual `rotate(-90deg)` fix would spin a square into a diamond.
 */

/** The viewBox these coordinates live in. */
export const RING_VIEWBOX = 100;

/**
 * Ring size as a multiple of the BUTTON BOX (the note plus .button-hitbox-bigger's padding),
 * so the drawn ring is somewhat wider than this multiple of the visible note.
 *
 * This is the one number the whole cue depends on, and it is a trade-off with no free choice:
 * too small and a fingertip covers the countdown it exists to show, too large and it reaches
 * across the neighbouring buttons and hides the glyphs a player is reading ahead. Note centres
 * sit only ~65px apart on a phone, so those two limits are genuinely close together. Retune on
 * a real device rather than by eye in a desktop browser.
 */
export const RING_SCALE = 1.1;

/**
 * Stroke width in viewBox units, NOT pixels — it scales with the button instead of staying a
 * fixed thickness, which is what keeps the ring proportionate across phone and desktop sizes.
 */
export const RING_STROKE = 4;
/** Inset from the viewBox edge, leaving room for the stroke to sit on the outline. */
const RING_INSET = 5;
/** Side length of the outline's bounding box. */
const RING_SIDE = RING_VIEWBOX - RING_INSET * 2;

export type RingGeometry = {
  /** `d` for the outline path. */
  d: string;
  /** Length of that path, in viewBox units — the dash length the sweep animates over. */
  perimeter: number;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Rounded square starting at top centre, clockwise. `radius` at half the side degenerates the
 * straight runs to zero length, which is exactly a circle — so this one generator covers both
 * shipped shapes, and the perimeter formula stays valid across the whole range.
 */
function roundedRectPath(radius: number): RingGeometry {
  const min = RING_INSET;
  const max = RING_INSET + RING_SIDE;
  const mid = RING_INSET + RING_SIDE / 2;
  const r = round(radius);
  const d = [
    `M${round(mid)} ${min}`,
    `L${round(max - r)} ${min}`,
    `A${r} ${r} 0 0 1 ${max} ${round(min + r)}`,
    `L${max} ${round(max - r)}`,
    `A${r} ${r} 0 0 1 ${round(max - r)} ${max}`,
    `L${round(min + r)} ${max}`,
    `A${r} ${r} 0 0 1 ${min} ${round(max - r)}`,
    `L${min} ${round(min + r)}`,
    `A${r} ${r} 0 0 1 ${round(min + r)} ${min}`,
    //closes back along the top edge to the starting point at top centre
    'Z',
  ].join(' ');
  //four straight runs plus the four quarter-arcs, which together make one full circle
  const perimeter = 4 * (RING_SIDE - 2 * radius) + 2 * Math.PI * radius;
  return { d, perimeter: round(perimeter) };
}

export function ringGeometry(shape: NoteShape): RingGeometry {
  switch (shape.kind) {
    case 'circle':
      return roundedRectPath(RING_SIDE / 2);
    case 'rounded-rect': {
      //a ratio past 0.5 would make the arcs overlap and the perimeter formula go negative
      const ratio = Math.min(Math.max(shape.cornerRatio, 0), 0.5);
      return roundedRectPath(RING_SIDE * ratio);
    }
  }
}
