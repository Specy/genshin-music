<script lang="ts">
    import {onMount} from 'svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import type {VsrgHitObject} from '$core/Songs/VsrgSong'
    import type {VsrgPlayerRenderer, VsrgPlayerCanvasSizes} from './VsrgPlayerRenderer'
    import type {VsrgKeyboardLayout} from './VsrgPlayerKeyboard.svelte'
    import VsrgPlayerCountDown from './VsrgPlayerCountDown.svelte'

    // Old: src/components/pages/VsrgPlayer/VsrgPlayerCanvas.tsx (385 lines, class component) - this
    // file is the "lifecycle only" half of the split described in VsrgPlayerRenderer.ts's header
    // comment (that file owns every pixi object + old's own React state; this one owns the wrapper
    // DOM element, when the renderer gets constructed/fed/destroyed, and the DOM-only
    // `<VsrgPlayerCountDown>` sibling old rendered from the SAME class).
    //
    // Prerender safety (spec's hard constraint): `VsrgPlayerRenderer` (and therefore `pixi.js`) is
    // NEVER statically imported here - only `import type` (fully erased at compile time, zero
    // runtime import) for typing `renderer`, plus the real `await import('./VsrgPlayerRenderer')`
    // inside `onMount`, which never runs during prerender.
    //
    // Old only rendered `<Application>` once `wrapperRef.current` existed - reproduced here by
    // never even attempting to construct the renderer until `wrapperEl` is bound (matching
    // VsrgComposerCanvas.svelte's own established `if (cancelled || !xEl) return` gate).
    //
    // `colors.background_layer_10` (the wrapper div's own inline background-color, old:
    // `style={{backgroundColor: colors.background_layer_10[0]}}`) is recomputed HERE directly from
    // `ThemeProvider`, duplicating the identical formula VsrgPlayerRenderer.ts's own
    // `handleThemeChange` uses (`theme.layer('background', 0.18, 0.06)`) - same disclosed-duplication
    // precedent ComposerCanvas.svelte's own header comment already established for its own
    // `sideButtonsRgb`/`timelineHex`/`backgroundHex` (a renderer-internal color the Svelte-owned DOM
    // also needs cannot be re-derived by the template on its own the other way around, but CAN be
    // independently recomputed here since `ThemeProvider` is a global reactive singleton every
    // component can read directly - cheaper and more idiomatic than adding a callback for a value
    // nothing inside the pixi scene itself ever reads, see VsrgPlayerRenderer.ts's header comment
    // confirming `background_layer_10` has zero pixi-side consumers).
    //
    // `timestamp` (old: internal React state, read directly by this SAME class's `render()` to
    // gate/compute `<VsrgPlayerCountDown>`) crosses the renderer/Svelte-component boundary via the
    // new `onTimestampChange` callback disclosed in VsrgPlayerRenderer.ts's header comment - this
    // file recomputes old's EXACT formula itself once it has both `timestamp` and its own
    // `scrollSpeed` prop.
    interface VsrgPlayerCanvasProps {
        isPlaying: boolean
        scrollSpeed: number
        keyboardLayout: VsrgKeyboardLayout
        maxFps: number
        onSizeChange: (sizes: VsrgPlayerCanvasSizes) => void
        onTick: (timestamp: number) => void
        playHitObject: (hitObject: VsrgHitObject, instrumentIndex: number) => void
    }

    let {
        isPlaying,
        scrollSpeed,
        keyboardLayout,
        maxFps,
        onSizeChange,
        onTick,
        playHitObject,
    }: VsrgPlayerCanvasProps = $props()

    let wrapperEl: HTMLDivElement | undefined
    let renderer: VsrgPlayerRenderer | null = $state(null)
    let timestamp = $state(0)

    const backgroundLayer10 = $derived(ThemeProvider.layer('background', 0.18, 0.06).hex())
    // Old: `(timestamp + scrollSpeed) < 0 && <VsrgPlayerCountDown time={Math.abs(Math.ceil((timestamp
    // + scrollSpeed) / 1000 * 2)) + 1}/>` - identical formula, recomputed here.
    const countdownTime = $derived((timestamp + scrollSpeed) < 0 ? Math.abs(Math.ceil((timestamp + scrollSpeed) / 1000 * 2)) + 1 : null)

    onMount(() => {
        let cancelled = false
        void (async () => {
            const {VsrgPlayerRenderer: VsrgPlayerRendererClass} = await import('./VsrgPlayerRenderer')
            if (cancelled || !wrapperEl) return
            const instance = new VsrgPlayerRendererClass(wrapperEl, {
                isPlaying, scrollSpeed, keyboardLayout, maxFps,
            }, {
                onSizeChange,
                onTick,
                playHitObject,
                onTimestampChange: (t) => timestamp = t,
            })
            await instance.init()
            if (cancelled) {
                instance.destroy()
                return
            }
            renderer = instance
        })()
        return () => {
            cancelled = true
            renderer?.destroy()
            renderer = null
        }
    })

    $effect(() => {
        renderer?.update({isPlaying, scrollSpeed, keyboardLayout, maxFps})
    })
</script>

<div
    class="vsrg-player-canvas box-shadow"
    style="background-color:{backgroundLayer10}"
    bind:this={wrapperEl}
>
    {#if countdownTime !== null}
        <VsrgPlayerCountDown time={countdownTime} />
    {/if}
</div>

<style>
    /* Old: src/components/pages/VsrgPlayer/VsrgPlayerCanvas.module.css (19 lines) - both rules
       ported verbatim. `.vsrg-player-canvas canvas` targets the pixi canvas element, which is
       appended programmatically by VsrgPlayerRenderer.ts (not written in this file's own
       template), so it carries no Svelte scoping hash - `:global(canvas)` keeps the selector's LEFT
       side (`.vsrg-player-canvas`) scoped to this component while leaving the descendant `canvas`
       unscoped, exactly matching the compiled shape Svelte would otherwise be unable to produce for
       an element it doesn't control (same mechanism required by ANY component that appends a real
       DOM/canvas node outside its own template). */
    .vsrg-player-canvas {
        position: absolute;
        bottom: 0;
        width: 50vw;
        /* height: 190vh; magic number */
        height: 100vh;
        max-width: 35rem;
        background-color: var(--background-darken-10);
        border-left: solid 2px var(--secondary);
        border-right: solid 2px var(--secondary);
        /* transform-origin: bottom;
        transform: rotateX(35deg); */
        display: flex;
    }

    .vsrg-player-canvas :global(canvas) {
        position: absolute;
        border-radius: 0.6rem;
    }
</style>
