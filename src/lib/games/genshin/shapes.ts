// Genshin's Shape registry (ADR-0003). Shape ids are game-prefixed so the same
// geometry can fork behavior per game later (per-game button components — Genshin's
// framed notes vs Sky's frameless ones currently branch on features.hasNoteFrame
// inside the shared note components). Adding an arrangement no grid can express =
// register a new id with a bespoke component; instruments opt in via meta.json.
import type { ShapeDefinition, ShapeId } from '../types';
import { DRUMS_8_LABELS, STANDARD_21_LABELS } from '../shapes/labels';
import GridShape from '../shapes/GridShape.svelte';

export const shapes: Readonly<Record<ShapeId, ShapeDefinition>> = {
  'genshin-3x7': {
    id: 'genshin-3x7',
    capacity: 21,
    columns: 7,
    labels: STANDARD_21_LABELS,
    component: GridShape,
  },
  'genshin-2x4': {
    id: 'genshin-2x4',
    capacity: 8,
    columns: 4,
    labels: DRUMS_8_LABELS,
    component: GridShape,
  },
};
