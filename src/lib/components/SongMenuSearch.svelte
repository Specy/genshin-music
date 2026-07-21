<script lang="ts">
    import IconButton from './inputs/IconButton.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: the `.search`/fuzzy-search-box half of src/components/shared/pagesLayout/SongMenu.tsx,
    // extracted into its own non-generic component. Purely a structural split (this component owns
    // no state/behavior beyond a controlled text input - `value`/`onInput` are the same "diverge
    // locally? no - old's text input element was already fully controlled by SongMenu's own
    // searchValue state, preserved as a plain controlled input here too) - SongMenu.svelte itself
    // stays the file this task's dispatch names, this is just where its own `.search`/`.search
    // input` CSS (old SongMenu.module.css, 11 lines, never part of App.css's bulk pull) now lives,
    // since a generics-attributed component combined with a style block empirically trips a
    // svelte-check tooling limit once the surrounding file is large enough (see SongMenu.svelte's
    // own top comment) - giving the CSS its own small, non-generic component sidesteps that
    // entirely.
    // NOTE for future editors of THIS file: a script comment that spells out a real style-tag or
    // script-tag substring with actual angle brackets - even describing this very issue - confuses
    // svelte-check's tag-boundary scan whenever the file also has a real style block, producing
    // exactly the phantom error this paragraph describes (verified via bisection while porting this
    // file). Worded around it above on purpose; keep any future edits to this comment doing the same.
    let {
        value,
        onInput,
        backgroundColor,
        textColor,
    }: {
        value: string
        onInput: (value: string) => void
        backgroundColor: string
        textColor: string
    } = $props()
</script>

{#snippet searchIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z" /></svg>
{/snippet}

{#snippet timesIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 352 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z" /></svg>
{/snippet}

<div
    class="search"
    style="background-color:{backgroundColor};color:{textColor};outline:solid 0.2rem transparent;outline-offset:-0.2rem;outline-color:{value === '' ? 'transparent' : 'var(--accent)'}"
>
    <input
        type="text"
        placeholder={t('common:search')}
        {value}
        oninput={(e) => onInput(e.currentTarget.value)}
        style="color:{textColor}"
    />
    <IconButton
        size="1rem"
        ariaLabel={value === '' ? 'Search' : 'Clear search'}
        style="background-color:transparent;color:inherit"
        onclick={() => onInput('')}
    >
        {#if value === ''}
            {@render searchIcon()}
        {:else}
            {@render timesIcon()}
        {/if}
    </IconButton>
</div>

<style>
    /* Old: src/components/shared/pagesLayout/SongMenu.module.css (11 lines) - this component's own
       CSS, never part of App.css's bulk pull (unlike the folder/song-row/song-button classes,
       which already live there - see SongFolder.svelte/pages/ErrorSongRow.svelte). */
    .search {
        border-radius: 0.4rem;
        display: flex;
        flex-direction: row;
        gap: 0.5rem;
        align-items: center;
        padding-right: 0.5rem;
    }

    .search input {
        padding: 0.5rem 1rem;
        border: none;
        background-color: transparent;
        max-width: 8rem;
        outline: none;
    }
</style>
