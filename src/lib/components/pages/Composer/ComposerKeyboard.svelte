<script lang="ts">
    import {game} from '$game'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import type {NoteNameType, Pitch} from '$lib/games/types'
    import type {LayerStatus} from '$core/Songs/Layer'
    import type {InstrumentData, NoteColumn} from '$core/Songs/SongClasses'
    import type {ComposerSettingsDataType} from '$core/BaseSettings'
    import type {Instrument, ObservableNote} from '$lib/audio/Instrument.svelte'
    import {t} from '$i18n/binding.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import Header from '$cmp/header/Header.svelte'
    import ComposerNote from './ComposerNote.svelte'

    // Old: src/components/pages/Composer/ComposerKeyboard.tsx (142 lines). The note grid rendered
    // below the composer canvas, the "loading instrument"/"error with this layer"/"recording audio"
    // states, the side-column-selection buttons (gated on `settings.useKeyboardSideButtons.value`),
    // and the tempo-changers row.
    //
    // Prop-bag: kept old's `{data, functions}` two-object shape (old's OWN interface was already
    // this shape, unlike ComposerNote's flat one) - same established convention as this migration's
    // sibling `PlayerKeyboard.svelte`/`PlayerMenu.svelte`.
    //
    // `useTheme()` (old, a debounced mobx subscription hook, only used below for the tempo-changer
    // button colours) -> `ThemeProvider` imported directly, same established precedent as every
    // other Phase-4 component; `theme` is NO LONGER threaded down into `<ComposerNote>` either
    // (that prop was dropped there too - see ComposerNote.svelte's own header comment).
    //
    // TEMPO_CHANGERS (old `$config`) -> `game.composer.tempoChangers` read directly off `$game`:
    // this is UI-tier code and TEMPO_CHANGERS is NOT on the `$core/legacyConfig` UI-allowlist (it is
    // per-game data) - same two-tier substitution already established by this task's own
    // `ComposerCache.ts` (P4c Task 1), which reads the identical `game.composer.tempoChangers`.
    //
    // Old's per-note `try { ... } catch (e) { return 'Err' }` (wrapping the `currentColumn.notes
    // .findIndex(...)` lookup + `NoteLayer.toLayerStatus(...)` call, so one bad note can't crash the
    // whole keyboard) has no direct markup equivalent (Svelte templates can't embed a try/catch) -
    // reproduced via `getNoteLayerOrError()` below, a plain function performing the identical
    // try/catch and returning either the computed `LayerStatus` or the literal sentinel `'Err'`;
    // the template branches on that sentinel and renders the bare text "Err" in ComposerNote's place
    // exactly like old's `return 'Err'` did (a bare JSX text node, no wrapping element) -
    // same failure-isolation behavior, required syntactic adaptation only.
    let {
        data,
        functions,
    }: {
        data: {
            keyboard: Instrument
            instruments: InstrumentData[]
            isRecordingAudio: boolean
            currentLayer: number
            currentColumn: NoteColumn
            pitch: Pitch
            settings: ComposerSettingsDataType
            isPlaying: boolean
            noteNameType: NoteNameType
        }
        functions: {
            handleClick: (note: ObservableNote) => void
            startRecordingAudio: (override?: boolean) => void
            selectColumnFromDirection: (direction: number) => void
            handleTempoChanger: (tempoChanger: (typeof game.composer.tempoChangers)[number]) => void
        }
    } = $props()

    function getNoteLayerOrError(index: number): LayerStatus | 'Err' {
        try {
            const foundIndex = data.currentColumn.notes.findIndex((e) => e.index === index)
            return foundIndex >= 0
                ? data.currentColumn.notes[foundIndex].layer.toLayerStatus(data.currentLayer, data.instruments)
                : 0
        } catch {
            return 'Err'
        }
    }

    const keyboardClass = $derived.by(() => {
        let cls = 'keyboard'
        const len = data.keyboard?.notes.length ?? 0
        if (len === 15) cls += ' keyboard-5'
        if (len === 14) cls += ' keyboard-5'
        if (len === 8) cls += ' keyboard-4'
        if (len === 6) cls += ' keyboard-3'
        return cls
    })
</script>

{#snippet chevronLeftIcon()}
    <!-- react-icons/fa's FaChevronLeft - same sourcing/precedent as the sibling ComposerCanvas
         .svelte's own copy (unpkg.com/react-icons@5.6.0/fa/index.mjs). Old passed no explicit size
         (`<FaChevronLeft />`), so this keeps the default "1em"/"1em". -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 320 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M34.52 239.03L228.87 44.69c9.37-9.37 24.57-9.37 33.94 0l22.67 22.67c9.36 9.36 9.37 24.52.04 33.9L131.49 256l154.02 154.75c9.34 9.38 9.32 24.54-.04 33.9l-22.67 22.67c-9.37 9.37-24.57 9.37-33.94 0L34.52 272.97c-9.37-9.37-9.37-24.57 0-33.94z"/></svg>
{/snippet}

{#snippet chevronRightIcon()}
    <!-- react-icons/fa's FaChevronRight, same sourcing as above. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 320 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M285.476 272.971L91.132 467.314c-9.373 9.373-24.569 9.373-33.941 0l-22.667-22.667c-9.357-9.357-9.375-24.522-.04-33.901L188.505 256 34.484 101.255c-9.335-9.379-9.317-24.544.04-33.901l22.667-22.667c9.373-9.373 24.569-9.373 33.941 0L285.475 239.03c9.373 9.372 9.373 24.568.001 33.941z"/></svg>
{/snippet}

{#if data.keyboard === undefined}
    <div class="composer-keyboard-wrapper" style="margin-bottom:4rem">
        <h1>{t('composer:error_with_this_layer')}</h1>
    </div>
{:else if data.isRecordingAudio}
    <div class="composer-keyboard-wrapper" style="margin-bottom:4rem;flex-direction:column;align-items:center">
        <Header>{t('composer:recording_audio')}...</Header>
        <AppButton onclick={() => functions.startRecordingAudio(false)} toggled>
            {t('composer:stop_recording_audio')}
        </AppButton>
    </div>
{:else}
    <div class="composer-keyboard-wrapper">
        {#if data.settings.useKeyboardSideButtons.value}
            <button
                onpointerdown={() => functions.selectColumnFromDirection(-1)}
                class="keyboard-column-selection-buttons {!data.isPlaying ? 'keyboard-column-selection-buttons-visible' : ''}"
                style="padding-right:0.5rem;justify-content:flex-end;visibility:{data.isPlaying ? 'hidden' : 'visible'}"
            >
                {@render chevronLeftIcon()}
            </button>
        {/if}
        <div class={keyboardClass}>
            {#if data.keyboard.notes.length === 0}
                <div class="loading">Loading...</div>
            {/if}
            {#each data.keyboard.notes as note, i (note.index)}
                {@const layerOrError = getNoteLayerOrError(i)}
                {#if layerOrError === 'Err'}
                    Err
                {:else}
                    <ComposerNote
                        layer={layerOrError}
                        data={note}
                        noteText={data.keyboard.getNoteText(i, data.noteNameType, data.pitch)}
                        instrument={data.keyboard.name}
                        noteImage={note.noteImage}
                        clickAction={functions.handleClick}
                    />
                {/if}
            {/each}
        </div>
        {#if data.settings.useKeyboardSideButtons.value}
            <button
                onpointerdown={() => functions.selectColumnFromDirection(1)}
                class="keyboard-column-selection-buttons {!data.isPlaying ? 'keyboard-column-selection-buttons-visible' : ''}"
                style="padding-left:0.5rem;justify-content:flex-start;visibility:{data.isPlaying ? 'hidden' : 'visible'}"
            >
                {@render chevronRightIcon()}
            </button>
        {/if}
    </div>
    <div class="tempo-changers-wrapper {data.isPlaying ? 'tempo-changers-wrapper-hidden' : ''}">
        <div class="bottom-right-text">
            {t('composer:tempo')}
        </div>
        {#each game.composer.tempoChangers as tempoChanger (tempoChanger.id)}
            <button
                onclick={() => functions.handleTempoChanger(tempoChanger)}
                style="{tempoChanger.changer === 1
                    ? `background-color:${ThemeProvider.get('primary').toString()};color:${ThemeProvider.getText('primary').toString()}`
                    : `background-color:#${tempoChanger.color.toString(16)}`};outline:{data.currentColumn.tempoChanger === tempoChanger.id
                    ? `3px ${ThemeProvider.get('composer_accent').toString()} solid`
                    : 'unset'};outline-offset:-3px"
            >
                {tempoChanger.text}
            </button>
        {/each}
    </div>
{/if}
