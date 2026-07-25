<script lang="ts">
    import {onMount} from 'svelte'
    import {preventDefault} from '$core/utils/Utilities'
    import type {ClickType} from '$core/utils/Utilities'
    import type {VsrgSong, VsrgHitObject} from '$core/Songs/VsrgSong'
    import type {RecordedSong} from '$core/Songs/RecordedSong'
    import type {RecordedNote} from '$core/Songs/SongClasses'
    import type {VsrgComposerRenderer} from './VsrgComposerRenderer'

    // Old: src/components/pages/VsrgComposer/VsrgComposerCanvas.tsx (393 lines, class component) -
    // this file is the "lifecycle only" half of the split described in VsrgComposerRenderer.ts's
    // header comment (that file owns every pixi object; this one owns the wrapper DOM element,
    // when the renderer gets constructed/fed/destroyed, and the native wheel/pointer event
    // bindings old wired directly on this same div via JSX props).
    //
    // Prerender safety (spec's hard constraint): `VsrgComposerRenderer` (and therefore `pixi.js`)
    // is NEVER statically imported here - only `import type` (fully erased at compile time, zero
    // runtime import) for typing `renderer`, plus the real `await import('./VsrgComposerRenderer')`
    // inside `onMount`, which never runs during prerender.
    //
    // Old only rendered `<Application>` once `wrapperRef.current` existed - reproduced here by
    // never even attempting to construct the renderer until `wrapperEl` is bound (matching
    // ComposerCanvas.svelte's own established `if (cancelled || !xEl) return` gate).
    interface VsrgComposerCanvasProps {
        vsrg: VsrgSong
        isHorizontal: boolean
        isPlaying: boolean
        snapPoint: number
        scrollSnap: boolean
        snapPoints: number[]
        selectedHitObject: VsrgHitObject | null
        audioSong: RecordedSong | null
        scaling: number
        maxFps: number
        renderableNotes: RecordedNote[]
        tempoChanger: number
        onKeyDown: (key: number) => void
        onKeyUp: (key: number) => void
        onAddTime: () => void
        onRemoveTime: () => void
        onTimestampChange: (timestamp: number) => void
        onSnapPointSelect: (timestamp: number, key: number, clickType?: ClickType) => void
        dragHitObject: (timestamp: number, key?: number) => void
        releaseHitObject: () => void
        selectHitObject: (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => void
    }

    let {
        vsrg,
        isHorizontal,
        isPlaying,
        snapPoint,
        scrollSnap,
        snapPoints,
        selectedHitObject,
        audioSong,
        scaling,
        maxFps,
        renderableNotes,
        tempoChanger,
        onKeyDown,
        onKeyUp,
        onAddTime,
        onRemoveTime,
        onTimestampChange,
        onSnapPointSelect,
        dragHitObject,
        releaseHitObject,
        selectHitObject,
    }: VsrgComposerCanvasProps = $props()

    let wrapperEl: HTMLDivElement | undefined
    let renderer: VsrgComposerRenderer | null = $state(null)

    onMount(() => {
        let cancelled = false
        void (async () => {
            const {VsrgComposerRenderer: VsrgComposerRendererClass} = await import('./VsrgComposerRenderer')
            if (cancelled || !wrapperEl) return
            const instance = new VsrgComposerRendererClass(wrapperEl, {
                vsrg, isHorizontal, isPlaying, snapPoint, scrollSnap, snapPoints, selectedHitObject,
                audioSong, scaling, maxFps, renderableNotes, tempoChanger,
            }, {
                onKeyDown, onKeyUp, onAddTime, onRemoveTime, onTimestampChange, onSnapPointSelect,
                dragHitObject, releaseHitObject, selectHitObject,
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
        renderer?.update({
            vsrg, isHorizontal, isPlaying, snapPoint, scrollSnap, snapPoints, selectedHitObject,
            audioSong, scaling, maxFps, renderableNotes, tempoChanger,
        })
    })
</script>

<!-- old's own div had no ARIA role/keyboard handling on its pointer handlers either (verified
     against the old blob directly) - suppressed rather than adding a11y attributes old didn't
     have, same established convention as PlayerSlider.svelte/ThemePropriety.svelte/ThemePreview.svelte. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="vsrg-top-canvas-wrapper"
    bind:this={wrapperEl}
    onwheel={(e) => renderer?.handleWheel(e)}
    onpointerdown={(e) => renderer?.setIsDragging(e)}
    onpointerup={() => renderer?.setIsNotDragging()}
    onpointerleave={() => renderer?.setIsNotDragging()}
    onpointermove={(e) => renderer?.handleDrag(e)}
    oncontextmenu={preventDefault}
></div>
