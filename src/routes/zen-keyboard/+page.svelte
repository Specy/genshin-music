<script lang="ts">
    import {onMount, untrack} from 'svelte'
    import {t} from '$i18n/binding.svelte'
    import {i18n} from '$i18n/i18n'
    import ZenKeypad from '$cmp/pages/ZenKeyboard/ZenKeypad.svelte'
    import ZenKeyboardMenu from '$cmp/pages/ZenKeyboard/ZenKeyboardMenu.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import {ZenKeyboardSettings, type ZenKeyboardSettingsDataType} from '$core/BaseSettings'
    import {Instrument, type ObservableNote} from '$lib/audio/Instrument.svelte'
    import {metronome} from '$lib/audio/Metronome'
    import {AudioProvider} from '$lib/providers/AudioProvider'
    import {MIDIProvider} from '$lib/providers/MIDIProvider'
    import {settingsService} from '$core/Services/SettingsService'
    import {logger} from '$stores/LoggerStore.svelte'
    import {zenKeyboardStore} from '$stores/ZenKeyboardStore.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import type {InstrumentName} from '$core/types'
    import type {SettingUpdate, SettingVolumeUpdate} from '$core/types/SettingsPropriety'

    // Old: src/app/_client-pages/zen-keyboard/index.tsx (110 lines, the `'use client'` component
    // rendered by src/app/zen-keyboard/page.tsx's thin `<PageBackground page="Main">` wrapper - the
    // PageBackground/page-shell split has no SvelteKit equivalent needed, same as every other
    // ported route this migration). Replaces the Task-1/P1 PageStub per the P4a-Task-10 route
    // audit.
    //
    // `useSetPageVisited('zenKeyboard')` -> `setPageVisited('zenKeyboard')` called inside its own
    // `onMount` below, reproducing the hook's own internal `useEffect(..., [])` (verified against
    // `$cmp/shared/PageVisit/pageVisit.tsx`'s real source) - the same "useEffect -> onMount"
    // translation this whole migration has used consistently.
    //
    // State: `settings`/`instrument`/`isMetronomePlaying` become `$state` (old's three `useState`s).
    //
    // Effects (old useEffect -> Svelte):
    //  1. Mount-only (`[]` deps): loads persisted settings, seeds `metronome.bpm`, constructs the
    //     initial `Instrument`, sets reverb; cleanup hides the loading pill on unmount. -> `onMount`.
    //  2. `[instrument]` deps: pushes the current instrument's notes into `zenKeyboardStore`. Since
    //     `instrument` is a live reactive `$state` (not a per-render closure value like old's prop),
    //     a plain top-level `$effect` reading `instrument` reproduces the exact same
    //     "runs once now, reruns whenever `instrument` is reassigned" shape with no extra plumbing -
    //     BUT calling `zenKeyboardStore.setKeyboardLayout(...)` directly from that effect body
    //     caused a real, live-reproduced `effect_update_depth_exceeded` infinite loop (see this
    //     effect's own inline comment below for the full root-cause trace) - `untrack()` fixes it.
    //  3. `[instrument]` deps: loads + connects the CURRENT instrument's audio buffers, and
    //     disconnects it again on cleanup. Old's cleanup closure reads `instrument.endNode` fresh
    //     inside the SAME per-render closure that ran `load()` (React re-creates the whole closure
    //     every render), so it always disconnects the instrument that WAS actually loaded/connected
    //     by that specific effect run. Svelte has no per-run closure by default - `instrument` is a
    //     single live binding - so this effect explicitly snapshots it into `currentInstrument` at
    //     the top and uses ONLY that snapshot inside `load()`/the cleanup. Without this snapshot,
    //     the cleanup would read whatever `instrument` has ALREADY been reassigned to by the time it
    //     runs (a brand-new, not-yet-loaded Instrument whose `.endNode` is still `null`), silently
    //     leaking the true previous instrument's connected audio nodes forever on every swap - a
    //     real regression old didn't have, not a preserved quirk, so it's deliberately avoided here.
    //  4. `[isMetronomePlaying]` deps: starts/stops the metronome. PRESERVED QUIRK (flag, not
    //     fixed): old never stops the metronome on unmount either (no cleanup on this effect, and
    //     no cleanup anywhere else in the file touches it) - navigating away from this page while
    //     the metronome is running leaves it ticking in the background indefinitely. Verified
    //     directly against the old blob - reproduced as-is below, not fixed.
    //
    // `handleSettingChange`/`onVolumeChange` drop their `useCallback` wrappers (no memoization
    // need, same rationale used throughout this migration) and become plain functions.
    // `handleSettingChange`'s old `async` keyword is dropped too - the body never actually awaits
    // anything (verified against the old blob), so it was vestigial; `updateSettings` similarly
    // drops its `useCallback` wrapper but keeps old's name/shape for traceability. Old's
    // `setSettings({...settings})` (a shallow clone solely to give React a new object reference so
    // it notices the EARLIER in-place `settings[setting.key] = ...` mutation) is dropped entirely -
    // `settings` is `$state`-backed here, so that in-place mutation is already reactively visible
    // everywhere it's read, with no forced-new-reference step needed.
    //
    // PRESERVED QUIRK (flag, not fixed): the instrument-loading pill text passes
    // `` i18n.t('instruments.' + settings.instrument.value) `` - a literal DOT, not the `:`
    // namespace separator every other instrument-label lookup in this codebase uses (e.g.
    // InstrumentSelect.svelte's `t('instruments:'+ins)`). Verified directly against the old blob -
    // this is a real pre-existing typo that makes i18next fail to resolve the nested `instruments`
    // namespace (no `:` means the whole string is looked up as a literal key path within the
    // default namespace instead), so the pill likely shows a raw untranslated key fragment instead
    // of a humanized instrument name. Kept byte-verbatim below, not "fixed" to a colon.
    //
    // Two-tier: this file reads no per-game constant directly (ZenKeypad/ZenKeyboardMenu/ZenNote
    // own every `$game` read this page's rendering needs).
    let settings: ZenKeyboardSettingsDataType = $state(ZenKeyboardSettings.data)
    let instrument: Instrument = $state(new Instrument())
    let isMetronomePlaying = $state(false)

    onMount(() => {
        setPageVisited('zenKeyboard')
    })

    onMount(() => {
        const loaded = settingsService.getZenKeyboardSettings()
        metronome.bpm = loaded.metronomeBpm.value
        instrument = new Instrument(loaded.instrument.value)
        settings = loaded
        AudioProvider.setReverb(loaded.reverb.value)
        return () => logger.hidePill()
    })

    $effect(() => {
        const currentInstrument = instrument
        // REAL BUG CAUGHT (not a preserved old quirk - old's React `useEffect(fn, [instrument])`
        // has no equivalent failure mode): `zenKeyboardStore.setKeyboardLayout` does
        // `this.keyboard.splice(0, this.keyboard.length, ...keyboard)` - reading
        // `zenKeyboardStore.keyboard`'s own `.length` (for the splice delete-count) and WRITING to
        // that same $state array in the same call. Svelte auto-tracks any reactive read that
        // happens synchronously anywhere inside an `$effect`'s call stack (unlike React, where only
        // the explicit dependency array matters) - so the `.length` read inside `setKeyboardLayout`
        // became a tracked dependency of THIS effect, and the splice's own write immediately
        // invalidated it, causing Svelte to reschedule this same effect forever
        // (`effect_update_depth_exceeded`, reproduced live and root-caused via console
        // instrumentation before this fix). `untrack()` (Svelte's documented escape hatch for
        // exactly this "effect reads and writes the same state" class of bug) confines tracking to
        // the explicit `instrument` read on the line above, so the effect still reruns whenever
        // `instrument` is reassigned (old's real intent) without also tracking
        // `setKeyboardLayout`'s own internal bookkeeping read.
        untrack(() => {
            zenKeyboardStore.setKeyboardLayout(currentInstrument.notes)
        })
    })

    $effect(() => {
        const currentInstrument = instrument
        async function load() {
            logger.showPill(i18n.t('zen_keyboard:loading_instrument', {
                instrument: i18n.t('instruments.' + settings.instrument.value),
            }))
            await currentInstrument.load(AudioProvider.getAudioContext())
            logger.hidePill()
            AudioProvider.connect(currentInstrument.endNode, null)
        }

        load()
        return () => {
            AudioProvider.disconnect(currentInstrument.endNode)
        }
    })

    $effect(() => {
        if (isMetronomePlaying) metronome.start()
        else metronome.stop()
    })

    function updateSettings(settings: ZenKeyboardSettingsDataType) {
        settingsService.updateZenKeyboardSettings(settings)
    }

    function handleSettingChange(setting: SettingUpdate) {
        const {data} = setting
        // old had a bare `//@ts-ignore` on this exact line too (verified against the blob):
        // `SettingUpdateKey` is a union across ALL FOUR settings families (Composer/Player/
        // VsrgComposer/ZenKeyboard), so `setting.key` is wider than this page's own
        // `ZenKeyboardSettingsDataType`-typed `settings` object accepts as an index - the same
        // structural looseness `SettingsPane`'s reusable `onUpdate` contract has everywhere it's
        // consumed. Converted to `@ts-expect-error` with a description (bare `@ts-ignore` is
        // banned by this repo's `@typescript-eslint/ban-ts-comment` outside `src/lib/core/`), same
        // substitution AudioProvider/MIDIProvider (Phase-4a Task 2) already established. Old's
        // OTHER `//@ts-ignore` (on the `const {data} = setting` destructure just above) suppressed
        // nothing that still errors under this port's types - dropped rather than kept as an
        // unused (and therefore build-failing) `@ts-expect-error`.
        // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
        settings[setting.key] = {...settings[setting.key], value: data.value}
        if (setting.key === 'instrument') {
            instrument = new Instrument(data.value as InstrumentName)
        }
        if (setting.key === 'reverb') {
            AudioProvider.setReverb(data.value as boolean)
        }
        if (setting.key === 'metronomeBpm') metronome.bpm = data.value as number
        if (setting.key === 'metronomeBeats') metronome.beats = data.value as number
        if (setting.key === 'metronomeVolume') metronome.changeVolume(data.value as number)
        updateSettings(settings)
    }

    function onNoteClick(note: ObservableNote) {
        instrument.play(note.index, settings.pitch.value)
        zenKeyboardStore.animateNote(note.index)
        MIDIProvider.broadcastNoteClick(note.midiNote)
    }

    function onVolumeChange(data: SettingVolumeUpdate) {
        instrument.changeVolume(data.value)
    }
</script>

<PageMetadata
    text={t('home:zen_keyboard_name')}
    description="The simplest keyboard in the app, focus only on playing manually with all the features of the player, instrument and pitch selection, animations and metronome"
/>
<ZenKeyboardMenu
    settings={settings}
    isMetronomePlaying={isMetronomePlaying}
    setIsMetronomePlaying={(val) => isMetronomePlaying = val}
    onVolumeChange={onVolumeChange}
    handleSettingChange={handleSettingChange}
/>
<div class="flex-centered">
    <ZenKeypad
        instrument={instrument}
        onNoteClick={onNoteClick}
        noteNameType={settings.noteNameType.value}
        pitch={settings.pitch.value}
        scale={settings.keyboardSize.value}
        keySpacing={settings.keyboardSpacing.value}
        verticalOffset={settings.keyboardYPosition.value}
    />
</div>
