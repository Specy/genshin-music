<script module lang="ts">
    // PRESERVED QUIRK (flag, not fixed): old's `cssBase` had a stray trailing `}` OUTSIDE the
    // CSS-Modules interpolation - ``let cssBase = `keyboard ${s['zen-keyboard']}}` `` - which glues
    // an extra `}` character onto the end of the (CSS-Modules-hashed) `zen-keyboard` token. That
    // corrupted class token never matches ZenKeyboard.module.css's real `.zen-keyboard` selector,
    // so old's `margin: auto 0` rule silently never applies at runtime - a genuine, confirmed
    // dead-styling bug (verified directly against the old blob), not a hypothetical. This Svelte
    // port has no CSS-Modules hashing step (`.zen-keyboard` below is a plain global class, see this
    // file's own scoped style block at the bottom), so the exact mechanism that produced the
    // corruption doesn't carry over 1:1 - but the SAME stray `}` is kept in the SAME position of the resulting string
    // (`zen-keyboard}` below) to reproduce the identical broken-match outcome faithfully, rather
    // than "fixing" it by dropping the brace just because its original cause doesn't apply here.
    const cssBase = `keyboard zen-keyboard}`
    const keyboardClasses = new Map<number, string>([
        [15, `${cssBase} keyboard-5`],
        [14, `${cssBase} keyboard-5`],
        [8, `${cssBase} keyboard-4`],
        [6, `${cssBase} keyboard-3`],
    ])
</script>

<script lang="ts">
    import {onMount} from 'svelte'
    import {zenKeyboardStore} from '$stores/ZenKeyboardStore.svelte'
    import {createKeyboardListener} from '$stores/KeybindsStore.svelte'
    import type {Instrument, ObservableNote} from '$lib/audio/Instrument.svelte'
    import type {NoteNameType, Pitch} from '$core/legacyConfig'
    import ZenNote from './ZenNote.svelte'

    // Old: src/components/pages/ZenKeyboard/ZenKeypad.tsx (64 lines) - reuses the global
    // Keyboard.css `.keyboard`/`.keyboard-5`/`.keyboard-4`/`.keyboard-3` classes (Task 3) plus this
    // file's own `.zen-keyboard` (module-scope constant above, see its own comment for the
    // preserved stray-brace quirk).
    //
    // `useObservableArray(zenKeyboardStore.keyboard)` collapses to reading `zenKeyboardStore.keyboard`
    // directly wherever old read the local `layout` variable - it's already `$state`-backed
    // (Task 1), so every read below is automatically tracked without a subscription wrapper, the
    // same collapse PlayerKeyboard.svelte's own header comment documents for `playerStore.keyboard`.
    //
    // `useEffect(() => createKeyboardListener("zen_keyboard", ...), [onNoteClick, instrument])`:
    // old's dependency array exists only so the callback closure captures the LATEST
    // `onNoteClick`/`instrument` on every render (React re-creates closures per render). Svelte has
    // no such staleness - `instrument`/`onNoteClick` are live reactive bindings read fresh at CALL
    // time regardless of when the listener was registered - so a single `onMount` subscription
    // (never re-run) is the correct, simpler translation; disclosed rather than silently dropped.
    let {
        onNoteClick,
        instrument,
        pitch,
        verticalOffset,
        scale,
        noteNameType,
        keySpacing,
    }: {
        instrument: Instrument
        pitch: Pitch
        scale: number
        noteNameType: NoteNameType
        keySpacing: number
        verticalOffset: number
        onNoteClick: (note: ObservableNote) => void
    } = $props()

    onMount(() => {
        return createKeyboardListener('zen_keyboard', ({shortcut, event}) => {
            if (event.repeat) return
            const note = instrument.getNoteFromCode(shortcut.name)
            if (note !== null) onNoteClick(note)
        })
    })

    const keyboardClass = $derived(keyboardClasses.get(zenKeyboardStore.keyboard.length) || cssBase)
</script>

<div
    class={keyboardClass}
    style="transform:scale({scale / 100}) translateY({verticalOffset}px);margin-top:unset"
>
    {#each zenKeyboardStore.keyboard as note, index (index)}
        <ZenNote
            keyPadding={keySpacing}
            instrumentName={instrument.name}
            noteText={instrument.getNoteText(index, noteNameType, pitch)}
            noteImage={note.noteImage}
            note={note}
            onClick={onNoteClick}
        />
    {/each}
</div>

<style>
    :global(.zen-keyboard) {
        margin: auto 0;
    }
</style>
