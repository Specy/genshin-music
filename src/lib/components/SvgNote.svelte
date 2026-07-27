<script lang="ts">
    // svelte:component is deprecated in Svelte 5 - binding the looked-up
    // component to a capitalized variable and using it as a dynamic tag
    // (below) is the replacement.
    import {game} from '$game'
    import type {NoteImage} from '$lib/games/types'

    let {name, background, color = 'currentColor'}: {name: NoteImage; background?: string; color?: string} = $props()

    const Glyph = $derived(game.notes.svgGlyphs[name])
</script>

{#if Glyph}
    <Glyph {background} {color} />
{/if}
