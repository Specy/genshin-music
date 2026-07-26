<script lang="ts">
    // Old: src/components/pages/VsrgPlayer/VsrgPlayerCountDown.tsx (33 lines) +
    // VsrgPlayerCountdown.module.css (9 lines). `memo(_VsrgPlayerCountDown, (p, n) => p.time ===
    // n.time)` dropped (established precedent, every memo drop this migration).
    //
    // Old's `useEffect(() => {...}, [time])` (WAAPI `.animate()` scale-bounce, fires on mount AND on
    // every `time` change) -> a top-level `$effect` reading `time` at its synchronous top (the
    // established `void time` idiom, e.g. PlayerKeyboard.svelte/PlayerSongControls.svelte) so it
    // reruns on mount and every prop change exactly like old's dependency-array effect.
    let {time}: {time: number} = $props()

    let ref: HTMLDivElement | undefined = $state()

    $effect(() => {
        void time
        if (!ref) return
        ref.animate([
            {transform: 'scale(1.4)'},
            {transform: 'scale(1)'},
        ], {
            duration: 500,
            iterations: 1,
        })
    })
</script>

<div class="vsrg-player-countdown flex-centered" bind:this={ref}>
    {time}
</div>

<style>
    .vsrg-player-countdown {
        position: absolute;
        top: 50%;
        left: calc(50% - 2.5rem);
        font-size: 5rem;
        width: 5rem;
        font-weight: bold;
        text-shadow: 0 0 0.5rem #252525;
        transition: all 0.1s;
    }
</style>
