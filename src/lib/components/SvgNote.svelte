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
    // `color`/`style` props are dropped (not part of `GlyphComponent`'s signature) — see
    // src/lib/games/types.ts's GlyphComponent comment.
    //
    // svelte:component is deprecated in Svelte 5; the replacement is binding the looked-up
    // component to a (capitalized) variable and using it directly as a dynamic tag.
    import {game} from '$game'
    import type {NoteImage} from '$lib/games/types'

    let {name, background}: {name: NoteImage; background?: string} = $props()

    const Glyph = $derived(game.notes.svgGlyphs[name])
</script>

{#if Glyph}
    <Glyph {background} />
{/if}
