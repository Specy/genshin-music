// Sky's Shape registry (ADR-0003). See genshin/shapes.ts for the id-naming and
// future button-component notes; the DRUMS_8_LABELS constant is shared with
// Genshin's 2x4 deliberately (identical label data), while the ids stay per-game
// so behavior can fork without data migrations.
import type { ShapeDefinition, ShapeId } from '../types';
import { DRUMS_8_LABELS, SFX_6_LABELS, STANDARD_15_LABELS } from '../shapes/labels';
import GridShape from '../shapes/GridShape.svelte';

export const shapes: Readonly<Record<ShapeId, ShapeDefinition>> = {
  'sky-3x5': {
    id: 'sky-3x5',
    capacity: 15,
    columns: 5,
    labels: STANDARD_15_LABELS,
    component: GridShape,
  },
  'sky-2x4': {
    id: 'sky-2x4',
    capacity: 8,
    columns: 4,
    labels: DRUMS_8_LABELS,
    component: GridShape,
  },
  'sky-2x3': {
    id: 'sky-2x3',
    capacity: 6,
    columns: 3,
    labels: SFX_6_LABELS,
    component: GridShape,
  },
};
