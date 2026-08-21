// Shared Label Set constants for the Shape registries (ADR-0003).
// Extracted programmatically from the pre-folder-config `layoutKinds` data
// (games' GameDefinitions, where they were byte-identical across both games).
// Consumed only by each game's shapes.ts; not part of any runtime surface on
// their own. Arrays are per-Button, length = the owning Shape's capacity.
import type { ShapeLabels } from '../types';

/** The 3×7 standard keyboard (21 buttons) — Genshin main instruments. */
export const STANDARD_21_LABELS: ShapeLabels = {
  keyboard: [
    'Q',
    'W',
    'E',
    'R',
    'T',
    'Y',
    'U',
    'A',
    'S',
    'D',
    'F',
    'G',
    'H',
    'J',
    'Z',
    'X',
    'C',
    'V',
    'B',
    'N',
    'M',
  ],
  abc: [
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'A7',
    'B1',
    'B2',
    'B3',
    'B4',
    'B5',
    'B6',
    'B7',
    'C1',
    'C2',
    'C3',
    'C4',
    'C5',
    'C6',
    'C7',
  ],
  number: [
    '1̇',
    '2̇',
    '3̇',
    '4̇',
    '5̇',
    '6̇',
    '7̇',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '1̣',
    '2̣',
    '3̣',
    '4̣',
    '5̣',
    '6̣',
    '7̣',
  ],
  playstation: [
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
  ],
  switch: [
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
    ' ',
  ],
};

/**
 * The 2×7 lower keyboard (14 buttons) — Genshin's two-octave instruments
 * (NightwindHorn): the LOWER two rows of the 3×7, sliced from it so the
 * A-row/Z-row keys and the plain/under-dot number octaves stay byte-identical
 * with the buttons' canonical grid rows (middle + bottom octave).
 */
export const STANDARD_14_LOW_LABELS: ShapeLabels = {
  keyboard: STANDARD_21_LABELS.keyboard.slice(7),
  abc: STANDARD_21_LABELS.abc.slice(7),
  number: STANDARD_21_LABELS.number.slice(7),
  playstation: STANDARD_21_LABELS.playstation.slice(7),
  switch: STANDARD_21_LABELS.switch.slice(7),
};

/** The 3×5 standard keyboard (15 buttons) — Sky main instruments. */
export const STANDARD_15_LABELS: ShapeLabels = {
  keyboard: ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'],
  abc: ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5'],
  number: ['1', '2', '3', '4', '5', '6', '7', '1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1̇̇'],
  playstation: ['L2', 'R2', '⟱', 'X', '⭅', '◼', '⟰', '▲', '⭆', '⬤', 'L1', 'R1', '❰L', '❰R', 'L❱'],
  switch: ['Zl', 'Zr', '⟱', 'B', '⭅', 'Y', '⟰', 'X', '⭆', 'A', 'L', 'R', '❰L', '❰R', 'L❱'],
};

/** The 2×4 drum keyboard (8 buttons) — both games’ drums. */
export const DRUMS_8_LABELS: ShapeLabels = {
  keyboard: ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F'],
  abc: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'],
  number: ['1', '2', '3', '4', '1̣', '2̣', '3̣', '4̣'],
  playstation: ['⟰', '▲', '⭅', '◼', '⟱', 'X', 'L2', 'R2'],
  switch: ['⟰', 'X', '⭅', 'Y', '⟱', 'B', 'Zl', 'Zr'],
};

/**
 * The 1×4 drum keyboard (4 buttons) — Sky's Fortune Drum, the one Instrument in
 * either game with four sounds. Sliced from the 2×4 so its keys and number marks
 * stay byte-identical with the drums' canonical top row.
 */
export const DRUMS_4_LABELS: ShapeLabels = {
  keyboard: DRUMS_8_LABELS.keyboard.slice(0, 4),
  abc: DRUMS_8_LABELS.abc.slice(0, 4),
  number: DRUMS_8_LABELS.number.slice(0, 4),
  playstation: DRUMS_8_LABELS.playstation.slice(0, 4),
  switch: DRUMS_8_LABELS.switch.slice(0, 4),
};

/** The 2×3 SFX keyboard (6 buttons). */
export const SFX_6_LABELS: ShapeLabels = {
  keyboard: ['Q', 'W', 'E', 'A', 'S', 'D'],
  abc: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'],
  number: ['1', '2', '3', '1̇', '2̇', '3̇'],
  playstation: ['⟰', '▲', '⭅', '⟱', 'X', 'L2'],
  switch: ['Zl', 'Zr', '⟱', 'Y', '⟰', 'X'],
};
