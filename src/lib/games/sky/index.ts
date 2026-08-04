// Sky GameDefinition — assembled from this folder's data by defineGame (ADR-0003).
// See games/genshin/index.ts for the folder layout; only the Shape registry
// (shapes.ts) and the glyph components below are code. Runtime values are pinned
// by test/configSurface.test.ts (config-surface-v2 + equivalence vs the frozen v1).
import { GAME_IDENTITY } from './identity';
import { defineGame } from '../defineGame';
import { shapes } from './shapes';
import CrGlyph from './glyphs/cr.svelte';
import DmGlyph from './glyphs/dm.svelte';
import DmcrGlyph from './glyphs/dmcr.svelte';

export const game = defineGame(GAME_IDENTITY.id, {
  shapes,
  svgGlyphs: {
    cr: CrGlyph,
    dm: DmGlyph,
    dmcr: DmcrGlyph,
  },
});
