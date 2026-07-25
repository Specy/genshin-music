<script lang="ts">
    import {game} from '$game'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import {preventDefault} from '$core/utils/Utilities'
    import type {ObservableNote} from '$lib/audio/Instrument.svelte'
    import type {InstrumentName, NoteStatus} from '$core/types'
    import type {ApproachingNote} from '$core/Songs/SongClasses'
    import GenshinNoteBorder from '$cmp/GenshinNoteBorder.svelte'
    import SvgNote from '$cmp/SvgNote.svelte'

    // Old: src/components/pages/Player/PlayerNote.tsx (173 lines) - the per-note button rendered by
    // PlayerKeyboard (sibling file, this task). Richer than the shared BaseNote.svelte (P4a Task 3):
    // approach circles (practice/approaching-mode ring animation), an `animationId` "pulse" ring on
    // every click, and the practice-mode toClick/toClickNext/toClickAndNext/approach-correct/
    // approach-wrong status classes - none of which BaseNote's generic status union covers.
    // `memo(Note, comparator)` is dropped (same rationale as every other memo drop this migration -
    // Svelte 5's fine-grained reactivity already only re-runs what changed).
    //
    // Reactivity: old read `note.data` via `useObservableObject(note.data)` (a mobx->React bridge
    // hook returning a plain snapshot, called `state`) AND separately via `note.status`
    // (ObservableNote's own mobx-observable getter) for `parseClass`'s argument - both paths read the
    // exact same underlying value (`note.status`'s getter is defined as `return this.data.status`).
    // Since `note.data` is now `$state(...)`-backed directly (Phase-4a Task 2), both call sites
    // collapse to one: reading `note.data.status` / `note.data.delay` / `note.data.animationId`
    // directly below, auto-tracked wherever referenced (brief: "note.data read directly ($state)").
    // `getTextColor`'s theme reactivity collapses from `mobx.observe(ThemeProvider.state.data, ...)` +
    // `useState` to a `$derived` reading `theme.get(...)`/`theme.isDefault(...)` - the identical
    // pattern BaseNote.svelte's own (byte-identical) getTextColor already uses.
    //
    // The `animationId !== 0` pulse ring used React's `key={state.animationId}` to force a fresh DOM
    // node on every click (so the `note-animation` CSS animation, which never restarts on an
    // unchanged element, replays each time). Svelte's `{#key expr}` block is the direct equivalent -
    // used below wrapping just that one div - and `{#each approachingNotes as an (an.id)}`'s own
    // keying already reproduces React's `key={note.id}` list-item semantics for the approach circles
    // with no extra work.
    //
    // Two-tier (UI file, reads $game per the P4b plan's mapping table):
    //   APP_NAME === 'Genshin'                     -> game.features.hasNoteFrame (GenshinNoteBorder
    //     render gate + getTextColor's luminosity branch - same collapse BaseNote.svelte uses)
    //   APP_NAME === 'Sky' ? 5 : 7 (approach-circle row width)   -> game.notes.perRow
    //   APP_NAME === 'Genshin' ? 100 : 200 (animation-delay compare) -> game.notes.animationDelayMs
    //   INSTRUMENTS_DATA[instrument]?.clickColor / .fill -> game.instruments.data[instrument]?.clickColor / .fill
    //   NOTES_CSS_CLASSES.*                        -> game.notes.cssClasses.*
    //   BASE_THEME_CONFIG.text.*                   -> game.themes.baseConfig.text.*
    let {
        note,
        data,
        approachingNotes,
        noteText,
        hideNote,
        handleClick,
    }: {
        note: ObservableNote
        data: {
            approachRate: number
            instrument: InstrumentName
        }
        approachingNotes: ApproachingNote[]
        noteText: string
        hideNote: boolean
        handleClick: (note: ObservableNote) => void
    } = $props()

    function getTextColor() {
        const noteBg = theme.get('note_background')
        if (game.features.hasNoteFrame) {
            if (noteBg.luminosity() > 0.65) {
                return game.themes.baseConfig.text.note
            } else {
                return noteBg.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark
            }
        } else {
            return noteBg.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark
        }
    }

    function getApproachCircleColor(index: number) {
        const numOfNotes = game.notes.perRow
        const row = Math.floor(index / numOfNotes)
        if (row === 0) return 'var(--accent)'
        if (row === 1) return theme.get('accent').rotate(180).hex()
        if (row === 2) return "var(--accent)"
        return "var(--accent)"
    }

    function parseBorderFill(status: NoteStatus, disabled: boolean) {
        if (disabled) return 'var(--note-border-fill)'
        if (status === "clicked") return "transparent"
        else if (status === 'toClickNext' || status === 'toClickAndNext') return '#63aea7'
        return 'var(--note-border-fill)'
    }

    function parseClass(status: NoteStatus, disabled: boolean) {
        //TODO there is a bug where if two notes to be clicked are the same, the first click will not be shown, as the transition is the same
        if (disabled) {
            switch (status) {
                case 'clicked':
                    return "click-event"
                default:
                    return ''
            }
        }
        switch (status) {
            case 'clicked':
                return "click-event"
            case 'toClick':
                return "note-red"
            case 'toClickNext':
                return "note-border-click"
            case 'toClickAndNext':
                return "note-red note-border-click"
            case 'approach-wrong':
                return "click-event approach-wrong"
            case 'approach-correct':
                return "click-event approach-correct"
            default:
                return ''
        }
    }

    const textColor = $derived(getTextColor())
    const clickColor = $derived(game.instruments.data[data.instrument]?.clickColor)
    const transitionStyle = $derived(`background-color ${note.data.delay}ms  ${note.data.delay === game.notes.animationDelayMs ? 'ease' : 'linear'} , transform 0.15s, border-color 100ms`)
    const noteClassName = $derived(`${game.notes.cssClasses.note} ${parseClass(note.data.status, hideNote)}`)
    const noteBackgroundColor = $derived(clickColor && note.data.status === 'clicked' && theme.isDefault('accent') ? clickColor : undefined)
    const borderFill = $derived(parseBorderFill(note.data.status, hideNote))
    const svgBackground = $derived(note.data.status === 'clicked'
        ? ((clickColor && theme.isDefault('accent')) ? clickColor : 'var(--accent)')
        : 'var(--note-background)')
    const animationBorderColor = $derived(clickColor && theme.isDefault('accent') ? clickColor : undefined)
</script>

<button
    onpointerdown={(e) => {
        e.preventDefault()
        handleClick(note)
    }}
    oncontextmenu={preventDefault}
    class="button-hitbox-bigger"
>
    {#each approachingNotes as approachingNote (approachingNote.id)}
        <div
            class={game.notes.cssClasses.approachCircle}
            style="animation:approach {data.approachRate}ms linear;border-color:{getApproachCircleColor(approachingNote.index)}"
        ></div>
    {/each}
    {#if note.data.animationId !== 0}
        {#key note.data.animationId}
            <div
                class={game.notes.cssClasses.noteAnimation}
                style={animationBorderColor ? `border-color:${animationBorderColor}` : ''}
            ></div>
        {/key}
    {/if}
    <div
        class={noteClassName}
        style="transition:{transitionStyle};{noteBackgroundColor ? `background-color:${noteBackgroundColor}` : ''}"
    >
        {#if game.features.hasNoteFrame}
            <GenshinNoteBorder className="genshin-border" fill={borderFill} />
        {/if}
        <SvgNote
            name={note.noteImage}
            color={theme.isDefault('accent') ? game.instruments.data[data.instrument]?.fill : undefined}
            background={svgBackground}
        />
        <div class={game.notes.cssClasses.noteName} style="color:{textColor}">
            {noteText}
        </div>
    </div>
</button>
