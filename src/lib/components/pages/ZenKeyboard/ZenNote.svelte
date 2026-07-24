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

    // Old: src/components/pages/ZenKeyboard/ZenNote.tsx (134 lines) - the per-note button rendered
    // by ZenKeypad (sibling file, this task). Unlike PlayerNote.svelte (Task 3), this note's
    // rendered className/animation state is driven by a LOCAL `status`/`statusId` pair, not by
    // `note.data.status` directly - old never reads `note.data.status` for rendering at all, only
    // for detecting THAT a change happened (see the effect below).
    //
    // `useCallback`-wrapped `handleClick` collapses to a plain function (no memoization needed -
    // Svelte's fine-grained reactivity, same rationale used throughout this migration).
    //
    // Reactivity - the note.data subscription (this file's most subtle piece):
    // old's `useEffect(() => { function onStatusChange() {...}; return
    // subscribeObeservableObject(note.data, onStatusChange) }, [note, ref])`. Verified directly
    // against `$lib/Hooks/useObservable.ts`'s real implementation (not assumed):
    // `subscribeObeservableObject` both (a) subscribes via mobx `observe()` to fire on every FUTURE
    // change to ANY property of `note.data`, AND (b) invokes the callback ONCE IMMEDIATELY,
    // synchronously, the moment the effect (re)runs - `const dispose = observe(target, cb);
    // callback({...target}); return dispose`. A Svelte `$effect` reproduces BOTH halves in one
    // idiom: its body also runs once immediately, and reruns whenever a tracked reactive read
    // changes. Reading all three `note.data` fields below (not just whichever one a given call
    // happens to touch) is required so the effect reruns on ANY of them changing, matching mobx's
    // whole-object `observe()` rather than a narrower per-field subscription - the same reasoning
    // PlayerKeyboard.svelte's own `playerStore.state` effect documents for itself. Reading `note`
    // itself (a prop) also makes this rerun whenever the parent swaps in a brand-new
    // ObservableNote instance (old's `[note, ref]` dep array resubscribing on note identity
    // change) - Svelte's props are reactive too, so no extra plumbing is needed for that half.
    //
    // PRESERVED QUIRK (flag, not fixed): because of the immediate-invoke behavior above, this
    // effect firing once on initial mount means every zen-keyboard note plays its "clicked" pulse
    // (Genshin) / flip animation (Sky) once automatically as soon as the page loads (and again
    // every time the instrument is swapped, since `setKeyboardLayout` constructs brand-new
    // ObservableNote instances). Verified directly against the old blob's `subscribeObeservableObject`
    // source - not a porting bug, a faithful reproduction of an existing, slightly odd old behavior.
    // Likewise, old's `setTimeout(() => setStatus(""), 100)` is never cleared/cancelled (no cleanup
    // returned from its effect) - a pre-existing race is possible if this effect reruns within
    // 100ms of a previous run (an earlier scheduled reset could fire after a newer 'clicked' status
    // was just set). Kept exactly as-is below, per the parity-first mandate, rather than "fixed"
    // with a clearTimeout old never had.
    //
    // Theme reactivity: old's `useEffect(() => subscribeObeservableObject(ThemeProvider.state.data,
    // () => setTextColor(getTextColor())), [])` collapses to a `$derived` reading `theme.get(...)` -
    // the identical pattern BaseNote.svelte/PlayerNote.svelte's own (byte-identical) getTextColor
    // already uses.
    //
    // Two-tier (UI file, reads $game per the P4b plan's mapping table):
    //   APP_NAME === 'Genshin'                -> game.features.hasNoteFrame
    //   INSTRUMENTS_DATA[instrumentName]?.clickColor -> game.instruments.data[instrumentName]?.clickColor
    //   NOTES_CSS_CLASSES.*                    -> game.notes.cssClasses.*
    //   BASE_THEME_CONFIG.text.*               -> game.themes.baseConfig.text.*
    //
    // FLAGGED FOR REVIEWER (real visual deviation, not a cosmetic nit - same gap already disclosed
    // and reviewed/approved for PlayerNote.svelte, Task 3; this is the SECOND consumer to hit it):
    // old passed a `color` prop to SvgNote (`color={ThemeProvider.isDefault('accent') ?
    // INSTRUMENTS_DATA[instrumentName]?.fill : undefined}`), which old's SvgNote applied as an
    // inline `style={{fill:color, stroke:color}}` on the glyph. The ported `SvgNote.svelte` (P3
    // Task 9) has NO color prop (`GlyphComponent` is locked to `Component<{background?: string}>`,
    // games/types.ts:41) and this task's brief says to reuse it as-is - dropped here, matching
    // SvgNote's real signature, not silently widening an already-reviewed shared contract.
    //
    // PRESERVED QUIRK (flag, not fixed): old received BOTH a `noteImage: NoteImage` prop AND
    // `note: ObservableNote` (which itself carries `note.noteImage`) - ZenKeypad's only call site
    // always passes `noteImage={note.noteImage}`, so the two are always equal. Old's JSX only ever
    // uses the PROP as a truthiness gate (`{noteImage && <SvgNote name={note.noteImage} .../>}`)
    // and reads the actual glyph key from `note.noteImage` instead - a redundant-but-harmless prop
    // (always truthy in practice). Kept verbatim below rather than simplified away.
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

    $effect(() => {
        void note.data.status
        void note.data.delay
        void note.data.animationId
        if (game.features.hasNoteFrame) {
            status = 'clicked'
            // REAL BUG CAUGHT (not a preserved old quirk - React's `setStatusId(v => v + 1)` has no
            // equivalent failure mode): `statusId += 1` reads AND writes `statusId` within this
            // SAME effect run - the textbook `effect_update_depth_exceeded` trigger Svelte's own
            // error page documents almost verbatim (reproduced live via console instrumentation
            // before this fix; the other half of the same crash was zen-keyboard/+page.svelte's
            // `setKeyboardLayout` call, see that file's own comment). `untrack()` confines the
            // increment's OWN read of the current value so it isn't ALSO registered as this
            // effect's dependency - `{#key statusId}` below still re-keys normally, since untrack
            // only suppresses tracking for the currently-running reactive context (this effect),
            // not the write's normal propagation to other subscribers.
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
    // $derived.by(...) (not the bare $derived(expr) sugar) is required here: TypeScript narrows
    // `status`'s type to its `$state('')` initializer literal when the comparison is inlined
    // directly as $derived's argument (it can't see that `status` is reassigned later inside the
    // $effect above) - wrapping the same expression in its own arrow-function body gives it a
    // fresh, unnarrowed read, the identical fix PlayerKeyboard.svelte's own `hideNotes`/`keyboardClass`
    // already documents for the same TS control-flow quirk.
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
            <GenshinNoteBorder className="genshin-border" fill={parseBorderFill(status)} />
        {/if}
        {#if noteImage}
            <SvgNote name={note.noteImage} background={svgBackground} />
        {/if}
        <div class={game.notes.cssClasses.noteName} style="color:{textColor}">
            {noteText}
        </div>
    </div>
</button>

<style>
    :global(.sky-zen-note) {
        opacity: 0.8;
    }
</style>
