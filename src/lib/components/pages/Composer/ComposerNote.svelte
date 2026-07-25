<script module lang="ts">
    import {game} from '$game'
    import type {LayerStatus} from '$core/Songs/Layer'

    // Old: src/components/pages/Composer/ComposerNote.tsx (97 lines, `memo`-wrapped). The
    // per-note button rendered by ComposerKeyboard's note grid - simpler than Player's PlayerNote
    // (no approach circles / click-pulse animation; `layer` instead drives which instrument
    // "layers" toggled this column light up via CSS class combinations).
    //
    // Precomputed classNameMap (`${game.notes.cssClasses.noteComposer} layer-1 layer-2 ...`
    // derived from the LayerStatus bit pattern, 16 entries for i=0..15 - LayerStatus's own type
    // permits a 17th member, 16, that this loop never produces, an old, harmless quirk reproduced
    // as-is, not widened). Ported into a `<script module>` block - Svelte's per-module,
    // computed-once-and-shared-across-every-instance equivalent of old's own module-level
    // `new Map(...)` (same idiom already used by `$cmp/inputs/InstrumentSelect.svelte` for the
    // same "build-time-static $game data, computed once" shape). Kept the exact old string-join
    // INCLUDING the empty tokens it produces: `layers.map(...).join(' ')` over four all-empty
    // strings (layer=0) yields three separating spaces, so the final className is
    // `"<noteComposer>    "` (one space from the template literal + three from the join) -
    // reproduced byte-for-byte, not collapsed/trimmed.
    /*
        if ((layer & 1) !== 0) className += " layer-1"
        if ((layer & 2) !== 0) className += " layer-2"
        if ((layer & 4) !== 0) className += " layer-3"
        if ((layer & 8) !== 0) className += " layer-4"
    */
    const classNameMap = new Map<LayerStatus, string>(
        new Array(16)
            .fill(0)
            .map((_, i) => {
                const layers = i.toString(2).split('').map(x => parseInt(x)).reverse()
                const className = `${game.notes.cssClasses.noteComposer} ${layers.map((x, idx) => x === 1 ? `layer-${idx + 1}` : '').join(' ')}`
                return [i as LayerStatus, className] as const
            })
    )
</script>

<script lang="ts">
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {preventDefault} from '$core/utils/Utilities'
    import type {InstrumentName} from '$core/types'
    import type {ObservableNote} from '$lib/audio/Instrument.svelte'
    import type {NoteImage} from '$lib/games/types'
    import GenshinNoteBorder from '$cmp/GenshinNoteBorder.svelte'
    import SvgNote from '$cmp/SvgNote.svelte'

    // Prop-bag flatten (this task's cross-cutting instruction): old's `ComposerNoteProps` was
    // ALREADY a flat interface (not a `data`/`functions` bag) - ported as-is, one change: `theme:
    // Theme` is DROPPED (old's `useTheme()` hook result, threaded down purely so the `useEffect`
    // below could depend on `[theme]`) in favour of importing the reactive `ThemeProvider`
    // singleton directly - the same established precedent as `PlayerNote.svelte`/`BaseNote.svelte`.
    // `memo(ComposerNote, comparator)` dropped (Svelte 5 fine-grained reactivity; the comparator's
    // 5 fields collapse to whatever this component's own template/derived values actually read).
    let {
        data,
        layer,
        instrument,
        clickAction,
        noteText,
        noteImage,
    }: {
        data: ObservableNote
        layer: LayerStatus
        instrument: InstrumentName
        clickAction: (data: ObservableNote) => void
        noteText: string
        noteImage: NoteImage
    } = $props()

    // Old: `const [colors, setColors] = useState(baseTheme)` (module-level `baseTheme` constant,
    // computed ONCE at module-import time, shared as the INITIAL value for every instance) +
    // `useEffect(() => {...}, [theme])` that immediately overwrote it with the fuller
    // isDark()-branching formula.
    // OLD QUIRK, PRESERVED (not just disclosed): module-level `baseTheme` applied only
    // `desaturate(0.6)` (no lighten/darken) and is what the FIRST render used, while the effect
    // then applied the fuller formula. This is reproduced structurally, not just formula-for-formula:
    // `$state` below is seeded with the SAME plain-desaturate-only expression (evaluated per-
    // instance at component-creation time - the closest per-instance equivalent of old's one-time
    // module-eval snapshot; every instance mounts after the app's theme has already loaded in both
    // old and new, so this is not a behavior-affecting narrowing) and `$effect` immediately
    // corrects it to the fuller formula. Because `$effect` never runs during prerendering (this
    // migration's own established finding, P3 Task 4's "mounted gate" fix), a prerendered/exported
    // page ships the plain-desaturate value in its static HTML - exactly like old's first paint
    // before hydration's `useEffect` fired - and hydration corrects it, exactly like old's mount
    // effect did. A plain `$derived` (always the fuller formula, no transient) was considered and
    // rejected: it would silently drop this old, reproducible two-phase quirk for no behavioral
    // gain.
    let colors = $state({
        note_background: ThemeProvider.get('note_background').desaturate(0.6).toString(),
        isAccentDefault: ThemeProvider.isDefault('accent'),
    })

    $effect(() => {
        const color = ThemeProvider.get('note_background').desaturate(0.6)
        colors = {
            note_background: color.isDark() ? color.lighten(0.45).toString() : color.darken(0.18).toString(),
            isAccentDefault: ThemeProvider.isDefault('accent'),
        }
    })

    const className = $derived(classNameMap.get(layer) ?? game.notes.cssClasses.noteComposer)
</script>

<button
    onpointerdown={(e) => {
        preventDefault(e)
        clickAction(data)
    }}
    class="button-hitbox"
    oncontextmenu={preventDefault}
>
    <div class={className}>
        {#if game.features.hasNoteFrame}
            <GenshinNoteBorder fill={colors.note_background} className="genshin-border" />
        {/if}
        <SvgNote
            name={noteImage}
            color={colors.isAccentDefault ? game.instruments.data[instrument]?.fill : undefined}
            background="var(--note-background)"
        />
        <div class="layer-3-ball-bigger"></div>
        <div class="layer-4-line"></div>
        <div class={game.features.hasNoteFrame ? 'note-name' : 'note-name-sky'}>
            {noteText}
        </div>
    </div>
</button>
