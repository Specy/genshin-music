// Genshin GameDefinition — assembled from this folder's data by defineGame (ADR-0003):
//   game.json                    — identity, display, Song Grid, midi, settings, roster
//   presets.json                 — named Note Presets
//   instruments/<Name>/          — meta.json + that instrument's audio samples
// Only what data can't express lives in code here: the Shape registry (shapes.ts)
// and the glyph components below. Runtime values are pinned by
// test/configSurface.test.ts (config-surface-v2 + equivalence vs the frozen v1).
import { GAME_IDENTITY } from './identity';
import { defineGame } from '../defineGame';
import { shapes } from './shapes';
import DoGlyph from './glyphs/do.svelte';
import ReGlyph from './glyphs/re.svelte';
import RebGlyph from './glyphs/reb.svelte';
import MiGlyph from './glyphs/mi.svelte';
import MibGlyph from './glyphs/mib.svelte';
import FaGlyph from './glyphs/fa.svelte';
import SoGlyph from './glyphs/so.svelte';
import LaGlyph from './glyphs/la.svelte';
import LabGlyph from './glyphs/lab.svelte';
import TiGlyph from './glyphs/ti.svelte';
import TibGlyph from './glyphs/tib.svelte';

export const game = defineGame(GAME_IDENTITY.id, {
  shapes,
  // Genshin's own 11 solfège glyphs only - the shared type is Partial, so a per-game
  // module importing just its own glyphs still type-checks against the union.
  svgGlyphs: {
    do: DoGlyph,
    re: ReGlyph,
    reb: RebGlyph,
    mi: MiGlyph,
    mib: MibGlyph,
    fa: FaGlyph,
    so: SoGlyph,
    la: LaGlyph,
    lab: LabGlyph,
    ti: TiGlyph,
    tib: TibGlyph,
  },
});
