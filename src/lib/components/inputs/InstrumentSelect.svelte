<script module lang="ts">
    import {game} from '$game'

    // Old: src/components/shared/Inputs/InstrumentSelect.tsx
    // Two-tier rule (src/lib/core/legacyConfig.ts header): this is UI code, so the instrument list
    // is read from `game.instruments.list` directly, never from `$core/legacyConfig`'s
    // `INSTRUMENTS` re-export (that's reserved for CORE files). `game` is a build-time-static
    // import (the $game alias is frozen at sync time - see legacyConfig.ts's own header comment),
    // so this grouping is computed once at module load, exactly like old's top-level
    // (outside-the-component) `prefixes`/`instruments`/`entries` computation - a `<script module>`
    // block (shared once across every instance) is the direct Svelte 5 equivalent of that old
    // module-level computation, rather than recomputing it inside every component instance.
    const prefixes = new Set<string>(
        game.instruments.list
            .filter(ins => ins.includes('_'))
            .map(ins => ins.split('_')[0])
    )
    const instrumentGroups: Record<string, readonly string[]> = {
        instruments: game.instruments.list.filter(ins => !ins.includes('_')),
    }
    for (const prefix of prefixes) {
        instrumentGroups[prefix] = game.instruments.list.filter(ins => ins.startsWith(prefix))
    }
    const entries = Object.entries(instrumentGroups)
</script>

<script lang="ts">
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import {capitalize} from '$core/utils/Utilities'
    import {t} from '$i18n/binding.svelte'
    import type {InstrumentName} from '$core/types'

    let {
        selected,
        onChange,
        style = '',
        className = '',
    }: {
        selected: InstrumentName
        onChange: (instrument: InstrumentName) => void
        style?: string
        className?: string
    } = $props()

    function handleChange(e: Event & {currentTarget: EventTarget & HTMLSelectElement}) {
        onChange(e.currentTarget.value)
        e.currentTarget.blur()
    }

    // Same inline-SVG-chevron-from-theme-text-color mechanism as `inputs/Select.svelte`
    // (Phase 3) and `settings/SettingsSelect.svelte` (this task) - kept identical.
    const backgroundImage = $derived(
        `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
    )
</script>

<select
    class="select {className}"
    style="width:100%;padding:0.3rem;background-image:{backgroundImage};{style}"
    onchange={handleChange}
    value={selected}
>
    {#if entries.length === 1}
        {#each instrumentGroups.instruments as ins (ins)}
            <option value={ins}>{t(`instruments:${ins}`)}</option>
        {/each}
    {:else}
        {#each entries as [prefix, ins] (prefix)}
            <optgroup label={capitalize(prefix)}>
                {#each ins as instrumentName (instrumentName)}
                    <option value={instrumentName}>{t(`instruments:${instrumentName}`)}</option>
                {/each}
            </optgroup>
        {/each}
    {/if}
</select>

<style>
    /* Old Settings.module.css's `.select`/`:focus`/`option:checked` rules - the same block
       `inputs/Select.svelte` already inlined (Phase 3 Task 5, see its own comment). Svelte scopes
       <style> per-component, so old's CSS-Modules-style sharing (one hashed class shared by every
       importer of Settings.module.css) doesn't carry over automatically - duplicated here rather
       than promoting it to the global App.css, to keep this task's blast radius to new files only.
       Unlike `inputs/Select.svelte` (whose <option>s arrive via a caller-supplied snippet, hence
       needing `:global()`), this file's <option>/<optgroup> elements are rendered directly in its
       own template below, so plain scoped CSS already reaches them - no `:global()` needed here. */
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

    .select option:checked {
        color: var(--accent);
    }
</style>
