<script lang="ts">
    import {onMount} from 'svelte'
    import {t} from '$i18n/binding.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {colorToRGB} from '$core/utils/Utilities'
    import {isMobile} from 'is-mobile'
    import {createShortcutListener} from '$stores/KeybindsStore.svelte'
    import type {NoteColumn} from '$core/Songs/SongClasses'
    import type {ComposedSong} from '$core/Songs/ComposedSong'
    import type {ComposerSettingsDataType} from '$core/BaseSettings'
    import type {ComposerRenderer} from './ComposerRenderer'
    import TimelineButton from './TimelineButton.svelte'

    // The class names below (canvas-wrapper, canvas-relative, canvas-buttons,
    // timeline-wrapper-bg, timeline-wrapper, timeline-scroll) are styled from App.css, not a local
    // <style> block - renaming or restructuring these divs breaks that styling silently.
    //
    // ComposerRenderer (and therefore pixi.js) is never statically imported here - only `import
    // type` (erased at compile time) for typing `renderer`, plus the real
    // `await import('./ComposerRenderer')` inside onMount, which never runs during prerender.
    // Making this a static import would pull pixi.js into the prerendered/SSR build.
    interface ComposerCanvasProps {
        columns: NoteColumn[]
        isPlaying: boolean
        isRecordingAudio: boolean
        song: ComposedSong
        selected: number
        currentLayer: number
        inPreview?: boolean
        settings: ComposerSettingsDataType
        breakpoints: number[]
        selectedColumns: number[]
        selectColumn: (index: number, ignoreAudio?: boolean) => void
        toggleBreakpoint: () => void
    }

    let {
        columns,
        isPlaying,
        isRecordingAudio,
        song,
        selected,
        currentLayer,
        inPreview,
        settings,
        breakpoints,
        selectedColumns,
        selectColumn,
        toggleBreakpoint,
    }: ComposerCanvasProps = $props()

    let notesContainerEl: HTMLDivElement | undefined
    let timelineContainerEl: HTMLDivElement | undefined
    let renderer: ComposerRenderer | null = $state(null)

    // width/hasCache come from the renderer's onGeometryChange callback, not $derived: they're
    // pixi/DOM-measurement values this template cannot compute on its own.
    let width = $state(0)
    let hasCache = $state(false)
    // isMobile() is a stable UA check that cannot change mid-session, so a plain const (not
    // reactive) is safe here.
    const timelineHeight = isMobile() ? 25 : 30

    const isBreakpointSelected = $derived(breakpoints.includes(selected))
    // Mirrors ComposerRenderer's own theme formulas - see that file's header for why this is
    // duplicated rather than shared.
    const sideButtonsRgb = $derived(colorToRGB(ThemeProvider.get('primary').darken(0.08)).join(','))
    const timelineHex = $derived(ThemeProvider.layer('primary', 0.1).hex())
    const backgroundHex = $derived(ThemeProvider.get('primary').hexa())

    onMount(() => {
        let cancelled = false
        let disposeShortcuts: (() => void) | null = null
        void (async () => {
            const {ComposerRenderer: ComposerRendererClass} = await import('./ComposerRenderer')
            if (cancelled || !notesContainerEl || !timelineContainerEl) return
            const instance = new ComposerRendererClass(notesContainerEl, timelineContainerEl, {
                columns, isPlaying, isRecordingAudio, song, selected, currentLayer, inPreview,
                settings, breakpoints, selectedColumns,
            }, {
                selectColumn,
                toggleBreakpoint,
                onGeometryChange: (geometry) => {
                    width = geometry.width
                    hasCache = geometry.hasCache
                },
            })
            await instance.init()
            if (cancelled) {
                instance.destroy()
                return
            }
            renderer = instance
            disposeShortcuts = createShortcutListener('composer', 'composer_canvas', ({shortcut}) => {
                const {name} = shortcut
                if (name === 'next_breakpoint') renderer?.handleBreakpoints(1)
                if (name === 'previous_breakpoint') renderer?.handleBreakpoints(-1)
            })
        })()
        return () => {
            cancelled = true
            disposeShortcuts?.()
            renderer?.destroy()
            renderer = null
        }
    })

    $effect(() => {
        renderer?.update({
            columns, isPlaying, isRecordingAudio, song, selected, currentLayer, inPreview,
            settings, breakpoints, selectedColumns,
        })
    })
</script>

{#snippet chevronLeftIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 320 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M34.52 239.03L228.87 44.69c9.37-9.37 24.57-9.37 33.94 0l22.67 22.67c9.36 9.36 9.37 24.52.04 33.9L131.49 256l154.02 154.75c9.34 9.38 9.32 24.54-.04 33.9l-22.67 22.67c-9.37 9.37-24.57 9.37-33.94 0L34.52 272.97c-9.37-9.37-9.37-24.57 0-33.94z"/></svg>
{/snippet}

{#snippet chevronRightIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 320 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M285.476 272.971L91.132 467.314c-9.373 9.373-24.569 9.373-33.941 0l-22.667-22.667c-9.357-9.357-9.375-24.522-.04-33.901L188.505 256 34.484 101.255c-9.335-9.379-9.317-24.544.04-33.901l22.667-22.667c9.373-9.373 24.569-9.373 33.941 0L285.475 239.03c9.373 9.372 9.373 24.568.001 33.941z"/></svg>
{/snippet}

{#snippet faStepBackwardIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M64 468V44c0-6.6 5.4-12 12-12h48c6.6 0 12 5.4 12 12v176.4l195.5-181C352.1 22.3 384 36.6 384 64v384c0 27.4-31.9 41.7-52.5 24.6L136 292.7V468c0 6.6-5.4 12-12 12H76c-6.6 0-12-5.4-12-12z"/></svg>
{/snippet}

{#snippet faStepForwardIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M384 44v424c0 6.6-5.4 12-12 12h-48c-6.6 0-12-5.4-12-12V291.6l-195.5 181C95.9 489.7 64 475.4 64 448V64c0-27.4 31.9-41.7 52.5-24.6L312 219.3V44c0-6.6 5.4-12 12-12h48c6.6 0 12 5.4 12 12z"/></svg>
{/snippet}

{#snippet faMinusCircleIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zM124 296c-6.6 0-12-5.4-12-12v-56c0-6.6 5.4-12 12-12h264c6.6 0 12 5.4 12 12v56c0 6.6-5.4 12-12 12H124z"/></svg>
{/snippet}

{#snippet faPlusCircleIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm144 276c0 6.6-5.4 12-12 12h-92v92c0 6.6-5.4 12-12 12h-56c-6.6 0-12-5.4-12-12v-92h-92c-6.6 0-12-5.4-12-12v-56c0-6.6 5.4-12 12-12h92v-92c0-6.6 5.4-12 12-12h56c6.6 0 12 5.4 12 12v92h92c6.6 0 12 5.4 12 12v56z"/></svg>
{/snippet}

<div
    class="canvas-wrapper {inPreview ? 'canvas-wrapper-in-preview' : ''}"
    style="width:{width}px;background-color:{hasCache ? 'unset' : backgroundHex}"
>
    <div class="canvas-relative" bind:this={notesContainerEl}>
        {#if !settings.useKeyboardSideButtons.value}
            <button
                onpointerdown={() => selectColumn(selected - 1)}
                class="canvas-buttons {!isPlaying ? 'canvas-buttons-visible' : ''}"
                style="left:0;padding-right:0.5rem;justify-content:flex-start;background:linear-gradient(90deg, rgba({sideButtonsRgb},0.80) 30%, rgba({sideButtonsRgb},0.30) 80%, rgba({sideButtonsRgb},0) 100%)"
            >
                {@render chevronLeftIcon()}
            </button>
            <button
                onpointerdown={() => selectColumn(selected + 1)}
                class="canvas-buttons {!isPlaying ? 'canvas-buttons-visible' : ''}"
                style="right:0;padding-left:0.5rem;justify-content:flex-end;background:linear-gradient(270deg, rgba({sideButtonsRgb},0.80) 30%, rgba({sideButtonsRgb},0.30) 80%, rgba({sideButtonsRgb},0) 100%)"
            >
                {@render chevronRightIcon()}
            </button>
        {/if}
    </div>
    <div class="timeline-wrapper-bg row">
        <div class="timeline-wrapper" style="height:{timelineHeight}px">
            <TimelineButton
                onclick={() => renderer?.handleBreakpoints(-1)}
                tooltip={t('composer:previous_breakpoint')}
                style="background-color:{timelineHex}"
                ariaLabel={t('composer:previous_breakpoint')}
            >
                {@render faStepBackwardIcon()}
            </TimelineButton>
            <TimelineButton
                onclick={() => renderer?.handleBreakpoints(1)}
                tooltip={t('composer:next_breakpoint')}
                style="margin-left:0;background-color:{timelineHex}"
                ariaLabel={t('composer:next_breakpoint')}
            >
                {@render faStepForwardIcon()}
            </TimelineButton>

            <div class="timeline-scroll" style="background-color:{timelineHex}" bind:this={timelineContainerEl}></div>

            <TimelineButton
                onclick={toggleBreakpoint}
                style="background-color:{timelineHex}"
                tooltip={isBreakpointSelected ? t('composer:remove_breakpoint') : t('composer:add_breakpoint')}
                ariaLabel={isBreakpointSelected ? t('composer:remove_breakpoint') : t('composer:add_breakpoint')}
            >
                {@render (isBreakpointSelected ? faMinusCircleIcon : faPlusCircleIcon)()}
            </TimelineButton>
        </div>
    </div>
</div>
