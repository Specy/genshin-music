<script lang="ts">
    import type {Snippet} from 'svelte'
    import {game} from '$game'
    import type {Pitch} from '$lib/games/types'

    // Old: src/components/shared/Inputs/PitchSelect.tsx
    // Two-tier rule: PITCHES is game-data, read from `game.notes.pitches` directly (never from
    // `$core/legacyConfig`'s PITCHES re-export, UI-code-forbidden). `Pitch` itself is a pure type
    // alias (zero runtime footprint) defined in `$lib/games/types` - imported straight from there,
    // same as `BaseNote.svelte` already does for `NoteImage` (a sibling shared type from the same
    // module) - type-only imports of shared game-type ALIASES aren't a game-data-tier concern,
    // only reading game-data VALUES through the wrong tier is.
    let {
        selected,
        onChange,
        style = '',
        children,
        className = '',
    }: {
        selected: Pitch
        onChange: (pitch: Pitch) => void
        style?: string
        children?: Snippet
        className?: string
    } = $props()

    function handleChange(e: Event & {currentTarget: EventTarget & HTMLSelectElement}) {
        onChange(e.currentTarget.value as Pitch)
        e.currentTarget.blur()
    }
</script>

<select
    class="select {className}"
    style="width:100%;padding:0.3rem;{style}"
    onchange={handleChange}
    value={selected}
>
    {@render children?.()}
    {#each game.notes.pitches as pitch (pitch)}
        <option>{pitch}</option>
    {/each}
</select>

<style>
    /* Same duplicated `.select`/`:focus`/`option:checked` block as `InstrumentSelect.svelte` (see
       its own comment for why this can't just cascade from `inputs/Select.svelte`). This file's
       own <option>s are rendered directly below (no `:global()` needed for `option:checked`), but
       `children` may inject additional caller-supplied <option>s via the snippet - `:global()` is
       still required so that pruning doesn't drop the rule for those. */
    .select {
        background-color: var(--primary);
        border-radius: 0.2rem;
        border: none;
        color: var(--primary-text);
        padding: 0.5rem;
    }

    .select:focus {
        outline: none;
    }

    .select :global(option:checked) {
        color: var(--accent);
    }
</style>
