<script lang="ts">
    import {untrack} from 'svelte'
    import {game} from '$game'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import {preventDefault} from '$core/utils/Utilities'
    import type {ObservableNote} from '$lib/audio/Instrument.svelte'
    import type {InstrumentName, NoteStatus} from '$core/types'
    import type {NoteImage} from '$lib/games/types'
    import GenshinNoteBorder from '$cmp/GenshinNoteBorder.svelte'
    import SvgNote from '$cmp/SvgNote.svelte'

    // QUIRK: noteImage is a redundant prop, always equal to note.noteImage (ZenKeypad's only call
    // site passes noteImage={note.noteImage}) - used only as the truthiness gate in the template
    // below, while the actual glyph name passed to SvgNote reads from note.noteImage instead. Kept
    // as two separate reads rather than simplified into one.
    let {
        note,
        onClick,
        noteImage,
        noteText,
        instrumentName,
        keyPadding,
    }: {
        note: ObservableNote
        noteText: string
        noteImage: NoteImage
        instrumentName: InstrumentName
        keyPadding: number
        onClick: (note: ObservableNote) => void
    } = $props()

    let status: NoteStatus = $state('')
    let statusId = $state(0)
    let ref: HTMLDivElement | undefined = $state()

    // No explicit `Keyframe[]` annotation (TS infers it structurally, which is all
    // `.animate()` needs) - the global `Keyframe` type identifier trips this repo's plain
    // (non-type-aware) `no-undef` eslint rule, which doesn't recognize it the way `KeyboardEvent`/
    // `PointerEvent`/etc. are recognized via the `globals` package's browser list.
    const skyKeyframes = [
        {transform: 'rotateY(0deg) scale(0.8)'},
        {transform: 'rotateY(180deg) scale(0.8)'},
        {transform: 'rotateY(360deg) scale(1)'},
    ]

    function handleClick(e: PointerEvent) {
        preventDefault(e)
        onClick(note)
    }

    function parseClass(status: NoteStatus) {
        let className = game.notes.cssClasses.note
        switch (status) {
            case 'clicked':
                className += ` click-event`
                break
            default:
                break
        }
        return className
    }

    function parseBorderFill(status: NoteStatus) {
        if (status === 'clicked') return 'transparent'
        else if (status === 'toClickNext' || status === 'toClickAndNext') return '#63aea7'
        return 'var(--note-border-fill)'
    }

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

    // void-reads all three note.data fields (not just whichever the body below touches) so this
    // effect reruns on ANY of them changing, matching a whole-object observer rather than a
    // narrower per-field subscription. Don't trim these to "just the fields used".
    //
    // QUIRK: this effect also fires once immediately on mount, so every zen-keyboard note
    // auto-plays its "clicked"/flip animation once on page load, and again whenever the instrument
    // is swapped (a fresh ObservableNote) - a faithful reproduction of existing old behavior, not a
    // bug to suppress. Likewise, the setTimeout below that clears status is never cancelled - if
    // this effect reruns within 100ms of a previous run, an earlier scheduled reset can clear a
    // newer "clicked" status. A pre-existing race, kept as-is rather than given a clearTimeout old
    // never had.
    //
    // QUIRK (load-bearing, a real bug this port found - not old parity): statusId += 1 below reads
    // and writes the same $state within this effect's own run - without untrack(), that's
    // effect_update_depth_exceeded (reproduced live). untrack() confines the increment's read so
    // it isn't tracked as this effect's own dependency; {#key statusId} still re-keys normally,
    // since untrack only suppresses THIS effect's tracking, not the write's propagation to other
    // subscribers. Do not remove untrack() here. Same fix pattern in VsrgLatestScore.svelte,
    // Player.svelte, NumericalInput.svelte, zen-keyboard/+page.svelte.
    $effect(() => {
        void note.data.status
        void note.data.delay
        void note.data.animationId
        if (game.features.hasNoteFrame) {
            status = 'clicked'
            untrack(() => {
                statusId += 1
            })
            setTimeout(() => {
                status = ''
            }, 100)
        } else {
            if (!ref) return
            ref.animate(skyKeyframes, {duration: 400})
        }
    })

    const textColor = $derived(getTextColor())
    const clickColor = $derived(game.instruments.data[instrumentName]?.clickColor)
    const animationBorderColor = $derived(clickColor && theme.isDefault('accent') ? clickColor : undefined)
    // $derived.by(...) (not the bare $derived(expr) sugar) is required: TypeScript narrows status's
    // type to its $state('') initializer literal when the comparison is inlined directly as
    // $derived's argument, since it can't see the reassignment inside the $effect above - wrapping
    // in its own arrow function gives a fresh, unnarrowed read (the same fix PlayerKeyboard.svelte
    // uses for its hideNotes/keyboardClass).
    const svgBackground = $derived.by(() => status === 'clicked'
        ? ((clickColor && theme.isDefault('accent')) ? clickColor : 'var(--accent)')
        : 'var(--note-background)')
    const className = $derived(`${parseClass(status)} ${game.features.hasNoteFrame ? '' : 'sky-zen-note'}`)
</script>

<button
    onpointerdown={handleClick}
    oncontextmenu={preventDefault}
    class="button-hitbox-bigger"
    style="padding:{keyPadding}rem"
>
    {#if game.features.hasNoteFrame}
        {#key statusId}
            <div
                class={game.notes.cssClasses.noteAnimation}
                style={animationBorderColor ? `border-color:${animationBorderColor}` : ''}
            ></div>
        {/key}
    {/if}
    <div bind:this={ref} class={className}>
        {#if game.features.hasNoteFrame}
            <GenshinNoteBorder class="genshin-border" fill={parseBorderFill(status)} />
        {/if}
        {#if noteImage}
            <!-- QUIRK: BaseNote.svelte's SvgNote render passes no color prop (untinted) while this
                 one does - both are correct, deliberate parity with old. Don't "fix" the asymmetry
                 by adding color to BaseNote's render. -->
            <SvgNote
                name={note.noteImage}
                color={theme.isDefault('accent') ? game.instruments.data[instrumentName]?.fill : undefined}
                background={svgBackground}
            />
        {/if}
        <div class={game.notes.cssClasses.noteName} style="color:{textColor}">
            {noteText}
        </div>
    </div>
</button>

<style>
    /* No :global() needed: this class only ever lands on the <div> directly above, which this
       file's own template creates, so normal Svelte scoping already reaches it. */
    .sky-zen-note {
        opacity: 0.8;
    }
</style>
