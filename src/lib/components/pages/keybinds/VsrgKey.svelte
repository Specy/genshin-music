<script lang="ts">
    import {clickOutside} from '$lib/utils/clickOutside'

    let {letter, isActive, handleClick}: {
        letter: string
        isActive: boolean
        handleClick: (status: boolean) => void
    } = $props()
</script>

<button
    class="vsrg-player-key-circle"
    use:clickOutside={{active: isActive, ignoreFocusable: true, onOutside: () => handleClick(false)}}
    style="width:3.5rem;font-size:1rem;height:3.5rem;margin:0.4rem;border:none;background-color:{isActive ? 'var(--accent)' : 'var(--primary)'};color:{isActive ? 'var(--accent-text)' : 'var(--primary-text)'};cursor:pointer"
    onclick={() => handleClick(!isActive)}
>
    {letter}
</button>

<style>
    /* QUIRK: this rule is intentionally duplicated in VsrgPlayerKeyboard.svelte's own style block
       too - each is a separately-scoped style block, so neither can reach the other's elements.
       Keep both copies in sync; don't remove this one as a "duplicate" (removing the other file's
       copy once caused a real, live regression there - see that file's own comment).

       Most of the properties below are overridden by this component's own inline style above
       (which wins on specificity) - only display/justify-content/align-items/border-radius end up
       visually effective. Kept byte-verbatim rather than pruned to just the effective properties,
       so it stays in sync with the duplicate copy. */
    .vsrg-player-key-circle {
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 1.4rem;
        background-color: var(--background-layer-10);
        color: var(--background-text);
        width: 100%;
        height: 100%;
        border-radius: 50rem;
        margin: -0.15rem;
        border: solid 0.15rem var(--secondary);
    }
</style>
