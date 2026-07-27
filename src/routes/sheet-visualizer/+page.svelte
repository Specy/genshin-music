<script lang="ts">
    import {onMount} from 'svelte'
    import {game} from '$game'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import {isComposedOrRecorded} from '$core/utils/Utilities'
    import {songService} from '$core/Services/SongService'
    import {VisualSong} from '$core/Songs/VisualSong'
    import {ComposedSong} from '$core/Songs/ComposedSong'
    import {RecordedSong} from '$core/Songs/RecordedSong'
    import type {SerializedSong} from '$core/Songs/Song'
    import type {NoteNameType} from '$lib/games/types'
    import Analytics from '$core/Analytics'
    import {logger} from '$stores/LoggerStore.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import Switch from '$cmp/inputs/Switch.svelte'
    import Select from '$cmp/inputs/Select.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import SheetVisualizerMenu from '$cmp/pages/SheetVisualizer/SheetVisualizerMenu.svelte'
    import SheetFrame2 from '$cmp/pages/SheetVisualizer/SheetFrame2.svelte'

    let sheet = $state<VisualSong | null>(null)
    let framesPerRow = $state(7)
    let currentSong = $state<SerializedSong | null>(null)
    let hasText = $state(false)
    let songAsText = $state('')
    let flattenSpaces = $state(false)
    let multiColor = $state(false)
    let keyboardLayout = $state<NoteNameType>(game.settings.defaultNoteNameType.sheetVisualizer)
    let ref = $state<HTMLDivElement>()

    onMount(() => {
        setPageVisited('sheetVisualizer')
    })

    function setFrames(amount: number) {
        if (!ref) return
        const newAmount = framesPerRow + amount
        const frame = ref.children[0]?.children[0] as HTMLDivElement | undefined
        if (!frame || newAmount < 1) return
        const width = frame.getBoundingClientRect().width
        if (width < 50 && amount === 1) return
        framesPerRow = newAmount
    }

    function loadSong(song: SerializedSong, layout: NoteNameType) {
        try {
            const temp = songService.parseSong(song)
            const isValid = isComposedOrRecorded(temp)
            if (!isValid) return logger.error(t('sheet_visualizer:invalid_song_to_visualize'))
            try {
                const vs = VisualSong.from(temp, flattenSpaces)
                sheet = vs
                songAsText = vs.toText(layout)
            } catch (e) {
                console.error(e)
                logger.error(t('sheet_visualizer:error_converting_to_visual_song_try_convert_in_recorded'))
                try {
                    const vs = VisualSong.from((temp as RecordedSong | ComposedSong).toRecordedSong(), flattenSpaces)
                    sheet = vs
                    songAsText = vs.toText(layout)
                } catch (e) {
                    console.error(e)
                    logger.error(t('sheet_visualizer:error_converting_to_visual_song'))
                    sheet = null
                    songAsText = ''
                }
            }
        } catch (e) {
            console.error(e)
            logger.error(t('sheet_visualizer:error_converting_to_visual_song'))
        }
        Analytics.songEvent({type: 'visualize'})
    }

    $effect(() => {
        // QUIRK: void hasText is a deliberate no-op read - it makes this $effect re-fire (and
        // re-send Analytics.songEvent) whenever the note-name-text toggle changes, even though
        // loadSong's own body never reads hasText. Matches old's explicit effect-dependency list.
        // Removing this read would silently fire fewer Analytics events than old did.
        void hasText
        if (currentSong) loadSong(currentSong, keyboardLayout)
    })

    const pageTitle = $derived(`${t('home:sheet_visualizer_name')}${currentSong ? ` - ${currentSong.name}` : ''}`)
</script>

<DefaultPage excludeMenu={true} className="page-no-print">
    {#snippet menu()}
        <SheetVisualizerMenu
            className="no-print"
            onSongLoaded={(song) => currentSong = song}
            {currentSong}
        />
    {/snippet}
    <PageMetadata
        text={pageTitle}
        description="Learn a sheet in a visual way, convert the song into text format or print it as pdf"
    />
    <div style="display:flex;align-items:center;flex-direction:column">
        <div class="visualizer-buttons-wrapper noprint" style="border-bottom:solid 1px var(--secondary);padding-bottom:1rem">
            <Column gap="0.5rem">
                <Row align="center" gap="0.5rem">
                    <div>{t('sheet_visualizer:note_names')}</div>
                    <Switch checked={hasText} onchange={(v) => hasText = v}/>
                    {#if hasText}
                        <Select
                            value={keyboardLayout}
                            onchange={(e) => keyboardLayout = e.currentTarget.value as NoteNameType}
                        >
                            {#each game.notes.nameTypes as noteNameType (noteNameType)}
                                <option value={noteNameType}>{noteNameType}</option>
                            {/each}
                        </Select>
                    {/if}
                </Row>
                <Row align="center" gap="0.5rem">
                    <div>{t('sheet_visualizer:merge_empty_spaces')}</div>
                    <Switch checked={flattenSpaces} onchange={(v) => flattenSpaces = v}/>
                </Row>
                <Row align="center" gap="0.5rem">
                    <div>{t('sheet_visualizer:different_color_rows')}</div>
                    <Switch checked={multiColor} onchange={(v) => multiColor = v}/>
                </Row>
            </Column>

            <div style="display:flex;align-items:center">
                {t('sheet_visualizer:per_row')}: {framesPerRow}
                <button class="visualizer-plus-minus" onclick={() => setFrames(-1)}>
                    -
                </button>
                <button class="visualizer-plus-minus" onclick={() => setFrames(1)}>
                    +
                </button>
            </div>
        </div>
        <h1 class="onprint" style="color:black">
            {game.i18n.interpolation.APP_NAME} Music Nightly
        </h1>
        <h1 class="onprint" style="color:black">
            {currentSong ? currentSong?.name : ''}
        </h1>
        <div style="width:100%" class="noprint">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <h2 class="text-ellipsis" style="margin-top:0.8rem">
                    {currentSong ? currentSong.name : t('sheet_visualizer:no_song_selected')}
                </h2>
                {#if currentSong}
                    <AppButton onclick={() => window.print()} style="min-width:fit-content;margin-left:0.4rem">
                        {t('sheet_visualizer:print_as_pdf')}
                    </AppButton>
                {/if}
            </div>
            <div style="color:var(--background-text)">
                {t('sheet_visualizer:sheet_visualizer_instructions')}
            </div>
        </div>
        <div
            class="visualizer-frame-wrapper"
            style="grid-template-columns:repeat({framesPerRow},1fr)"
            bind:this={ref}
        >
            {#if sheet}
                {#each sheet.chunks as chunk, i (i)}
                    <SheetFrame2
                        chunk={chunk}
                        rows={3}
                        {theme}
                        multiColorRows={multiColor}
                        {hasText}
                        {keyboardLayout}
                    />
                {/each}
            {/if}
        </div>
        {#if songAsText.trim().length > 0}
            <pre class="text-notation-wrapper">{songAsText}</pre>
        {/if}
    </div>
</DefaultPage>

<style>
    /* :global() is required for .page-no-print/.no-print - both are applied via a className prop
       forwarded into CHILD components' own elements (DefaultPage's outer div, and two layers
       deeper, SheetVisualizerMenu -> MenuSidebar's outer div), not elements this file's own
       template renders directly. The other selectors below target elements this file authors
       directly, so they keep normal Svelte scoping. */
    .visualizer-plus-minus {
        width: 2rem;
        margin-left: 0.5rem;
        height: 2rem;
        padding: 0;
        font-size: 1.4rem;
        background-color: var(--primary);
        color: var(--primary-text);
        border: none;
        border-radius: 0.2rem;
        cursor: pointer;
    }

    .visualizer-plus-minus:hover {
        background-color: var(--secondary-layer-10);
    }

    .visualizer-buttons-wrapper {
        display: flex;
        justify-content: space-between;
        width: 100%;
        margin-top: 0.5rem;
        align-items: center;
    }

    .visualizer-frame-wrapper {
        width: 100%;
        margin-top: 1rem;
        display: grid;
        justify-items: center;
        row-gap: 0.2rem;
        border-top: solid 1px var(--secondary);
        padding-top: 1rem;
        grid-template-columns: repeat(5, 1fr);
        justify-content: center;
    }

    .text-notation-wrapper {
        background-color: var(--primary);
        color: var(--primary-text);
        border-radius: 0.5rem;
        border: solid 1px var(--secondary);
        padding: 1rem;
        width: 100%;
        white-space: pre-wrap;
        -webkit-user-select: text;
        user-select: text;
        cursor: text;
        margin-top: 2rem;
    }

    @media print {
        :global(.page-no-print) {
            padding: 1rem;
        }
        :global(.no-print) {
            display: none;
        }
        .text-notation-wrapper {
            background-color: transparent;
            color: black;
        }
    }
</style>
