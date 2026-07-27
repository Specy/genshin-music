<script lang="ts">
    let {time}: {time: number} = $props()

    let ref: HTMLDivElement | undefined = $state()

    // void time forces this effect to track and rerun on every time change, even though time's
    // value isn't otherwise read below - removing this line would stop the bounce animation from
    // re-triggering on each countdown tick.
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
