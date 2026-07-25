<script lang="ts">
    // Old: src/components/shared/SvgNotes/index.tsx (React) — the `SvgNote` wrapper that
    // looked up `noteIconsMap[name]` and rendered it, falling back to `<></>` for an
    // unknown key: `return NoteComponent ? <NoteComponent .../> : <></>`. That module-level
    // map imported BOTH games' glyphs into one object (`import crNote from "./sky/cr"` next
    // to `import doNote from "./genshin/do"`, etc.) — this port fixes that per §5.5: each
    // game supplies only its own glyphs via `game.notes.svgGlyphs` (populated in each game's
    // index.ts from its own `glyphs/` folder), so this component just looks the current
    // game's map up by key instead of owning a hardcoded map itself.
    //
    // `color` restored P4c Task 2 (old default: 'currentColor') - old applied it as an inline
    // `style={{fill: color, stroke: color}}` on the looked-up glyph component itself (see each
    // glyph's own header comment for where that now happens post-port). `style` (the raw CSS-object
    // prop old's SvgNoteImageProps also declared) stays dropped - nothing ever passed it; old's own
    // `SvgNote` function only ever built inline fill/stroke from `color`, never forwarded a
    // caller-supplied `style` object.
    //
    // svelte:component is deprecated in Svelte 5; the replacement is binding the looked-up
    // component to a (capitalized) variable and using it directly as a dynamic tag.
    import {game} from '$game'
    import type {NoteImage} from '$lib/games/types'

    let {name, background, color = 'currentColor'}: {name: NoteImage; background?: string; color?: string} = $props()

    const Glyph = $derived(game.notes.svgGlyphs[name])
</script>

{#if Glyph}
    <Glyph {background} {color} />
{/if}
