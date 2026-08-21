// Sky's Shape registry (ADR-0003). See genshin/shapes.ts for the id-naming and
// future button-component notes; the DRUMS_8_LABELS constant is shared with
// Genshin's 2x4 deliberately (identical label data), while the ids stay per-game
// so behavior can fork without data migrations.
import type { NoteShape, ShapeDefinition, ShapeId } from '../types';
import { DRUMS_4_LABELS, DRUMS_8_LABELS, SFX_6_LABELS, STANDARD_15_LABELS } from '../shapes/labels';
import GridShape from '../shapes/GridShape.svelte';

//Sky's buttons are rounded squares. The ratio matches .note-sky's border-radius against its
//width in App.css - 1.3vw/6vw desktop, 1.8vw/8.5vw mobile - which round to the same 0.21.
const ROUNDED_SQUARE: NoteShape = { kind: 'rounded-rect', cornerRatio: 0.21 };

export const shapes: Readonly<Record<ShapeId, ShapeDefinition>> = {
  'sky-3x5': {
    id: 'sky-3x5',
    capacity: 15,
    columns: 5,
    labels: STANDARD_15_LABELS,
    noteShape: ROUNDED_SQUARE,
    component: GridShape,
  },
  'sky-2x4': {
    id: 'sky-2x4',
    capacity: 8,
    columns: 4,
    labels: DRUMS_8_LABELS,
    noteShape: ROUNDED_SQUARE,
    component: GridShape,
  },
  'sky-2x3': {
    id: 'sky-2x3',
    capacity: 6,
    columns: 3,
    labels: SFX_6_LABELS,
    noteShape: ROUNDED_SQUARE,
    component: GridShape,
  },
  //The Fortune Drum's four sounds sit in one row - the only 4-button Instrument in either game.
  'sky-1x4': {
    id: 'sky-1x4',
    capacity: 4,
    columns: 4,
    labels: DRUMS_4_LABELS,
    noteShape: ROUNDED_SQUARE,
    component: GridShape,
  },
};
