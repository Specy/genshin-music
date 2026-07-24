<script lang="ts">
    import {onMount, untrack} from 'svelte'
    import {game} from '$game'
    import {SPEED_CHANGERS} from '$core/legacyConfig'
    import {t} from '$i18n/binding.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import PlayerMenu from './PlayerMenu.svelte'
    import PlayerKeyboard from './PlayerKeyboard.svelte'
    import PlayerSongControls from './PlayerSongControls.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {playerStore} from '$stores/PlayerStore.svelte'
    import {playerControlsStore} from '$stores/PlayerControlsStore.svelte'
    import {Instrument} from '$lib/audio/Instrument.svelte'
    import AudioRecorder from '$lib/audio/AudioRecorder'
    import {AudioProvider} from '$lib/providers/AudioProvider'
    import {metronome} from '$lib/audio/Metronome'
    import {asyncConfirm, asyncPrompt} from '$stores/AsyncPromptStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {settingsService} from '$core/Services/SettingsService'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {createShortcutListener} from '$stores/KeybindsStore.svelte'
    import {delay} from '$core/utils/Utilities'
    import Analytics from '$core/Analytics'
    import {InstrumentData, Recording} from '$core/Songs/SongClasses'
    import {RecordedSong} from '$core/Songs/RecordedSong'
    import type {ComposedSong} from '$core/Songs/ComposedSong'
    import type {NoteLayer} from '$core/Songs/Layer'
    import type {InstrumentName} from '$core/types'
    import type {PlayerSettingsDataType} from '$core/BaseSettings'
    import type {SettingUpdate, SettingVolumeUpdate} from '$core/types/SettingsPropriety'

    // Old: src/app/_client-pages/player/index.tsx (467 lines) - the `Player` class component (the
    // page's actual implementation) plus its thin default-export wrapper function `PlayerPage`
    // (which only did `useTranslation(...)` + `useSetPageVisited('player')` before rendering
    // `<Player t={t} inPreview={inPreview}/>`). Both collapse into this single component: the `t`
    // prop-threading is dropped entirely (every method below reads the reactive `t()` binding
    // directly, the same convention `PlayerKeyboard.svelte`/`PlayerMenu.svelte`/
    // `PlayerSongControls.svelte` already established for this exact page family - no hook/prop
    // needed since `t()` is a module-level singleton here, not a per-render React value), and
    // `useSetPageVisited('player')` moves out to the TWO route files that mount this component
    // (`src/routes/player/+page.svelte` and `src/routes/+page.svelte`, old's `/` and `/player` were
    // byte-identical route bodies - see those files' own header comments) since it's a per-ROUTE
    // concern, not a per-COMPONENT one (matches the already-established
    // `zen-keyboard/+page.svelte`/`sheet-visualizer/+page.svelte` convention of calling
    // `setPageVisited` from the route's own `onMount`, not from a shared page component).
    //
    // WHICH class fields became `$state` (read by the template output below) vs plain closure
    // locals (internal bookkeeping only, same rule `PlayerKeyboard.svelte`'s header comment
    // establishes and explains in depth): `settings`/`instruments`/`isLoadingInstrument`/
    // `isRecording`/`isRecordingAudio`/`isMetronomePlaying`/`hasSong`/`speedChanger` are all read
    // directly by the markup below -> `$state`. `instrumentsData` is grepped nowhere in old's own
    // `render()` (only read/written inside `loadInstrument`/`loadInstruments`/`playSound`) -> a
    // plain `let`, same treatment as `PlayerKeyboard.svelte`'s own `songToPractice`/`nextChunkDelay`.
    // `recording` (the note-`Recording` buffer, unrelated to `isRecording`/`isRecordingAudio`),
    // `mounted`, and `cleanup` are all internal-only -> plain closure locals, `cleanup`'s type
    // narrowed from old's `(Function | Lambda)[]` (mobx's disposer type) to `(() => void)[]` (no
    // mobx dependency anywhere in this tree, same substitution used throughout this migration).
    //
    // `componentDidMount` -> `onMount`. Kept in old's own relative order: settings load (with the
    // "reset hidePracticeMode so users aren't confused" quirk, preserved verbatim comment and all),
    // `mounted = true`, seed the keyboard layout from the initial instrument, the `toggle_record`
    // shortcut listener, then `init(settings)` (loads the instrument + applies reverb) and the
    // "syncSongData" `subscribeObeservableObject(playerStore.state, cb)` subscription. One
    // deliberate, disclosed reordering: old `await`ed `init(settings)` BEFORE registering the
    // subscription; here the `$effect` below is registered synchronously (required - Svelte only
    // recognizes a synchronously-returned closure from `onMount` as its cleanup function, and
    // `$effect` itself must be called from a still-active reactive/mount context, not from inside an
    // async continuation after an `await` - same constraint every other async-onMount page in this
    // migration works around, e.g. `zen-keyboard/+page.svelte`'s `load()` helper called
    // fire-and-forget from a synchronous `$effect` body), while `init(settings)` is invoked without
    // an `await` (fire-and-forget) directly inside `onMount`. This is behaviorally inert in every
    // realistic case: `playerStore.state.song` is `null` at the moment of mount regardless of the
    // exact sub-millisecond ordering (nothing can call `playerStore.play/practice/approaching`
    // before the user interacts with the now-visible page, by which point `init` has long since
    // resolved), so the subscription's own `if (... || song === null) return` guard behaves
    // identically either way - and it incidentally closes a latent old-only leak where unmounting
    // while `init()` was still pending meant the subscription was never registered (so `dispose`
    // was never pushed to `cleanup`, and `subscribeObeservableObject` would still fire and leak
    // after the "already unmounted" point once `init()` finally resolved).
    //
    // The syncSongData subscription itself: old's `subscribeObeservableObject(playerStore.state, cb)`
    // fires `cb({...playerStore.state})` once immediately on subscribe AND once per individual mobx
    // property write inside `PlayerStore`'s `setState`/`Object.assign` (per the established,
    // reviewed finding in `PlayerKeyboard.svelte`'s own header comment: mobx's raw `observe()`, unlike
    // `autorun`/`reaction`, is not batched by actions). Per the Global Constraints section, this
    // becomes an `$effect` reading `playerStore.state.key`/`.playId` at its synchronous top (so it
    // reruns on every `play`/`practice`/`approaching`/`resetSong`/`restartSong` call even when the
    // song object is reference-equal) - Svelte's own batching naturally coalesces every synchronous
    // field write from ONE such call into a SINGLE effect run, which is exactly the "batch it"
    // outcome old's OWN `PlayerKeyboard.svelte` sibling subscription needed a manual `setTimeout`
    // debounce to achieve (old's comment there: "mobx calls for each prop changed while i want to
    // batch it") - no debounce is needed or added here since Svelte's default scheduling already
    // gives the same coalesced-once-per-call result, and old's OWN `Player.tsx` never had a
    // debounce on THIS particular subscription (unlike its `PlayerKeyboard.tsx` sibling), so adding
    // one here would be inventing new timing behavior, not preserving old's. The callback body
    // itself is wrapped in `untrack()`: it reads `settings.pitch`/`settings.reverb` and (via
    // `handleSettingChange`) WRITES `settings[setting.key] = {...settings[setting.key], ...}` - a
    // read-then-write of the SAME property path, which Svelte auto-tracks as a dependency of
    // whatever effect is synchronously executing when the read happens (per the codebase's own
    // established finding, `zen-keyboard/+page.svelte`'s `setKeyboardLayout` effect fix) - left
    // untracked, this would self-invalidate and throw `effect_update_depth_exceeded` the moment a
    // song actually starts playing. `untrack()` is the same fix already applied twice elsewhere in
    // this exact migration for the identical "effect reads and (transitively) writes the same
    // `$state` path" hazard (`ZenKeyboardStore.svelte.ts`'s `setKeyboardLayout` effect,
    // `ZenNote.svelte`'s `statusId` write) - a required, correctness-preserving adaptation, not a
    // behavior change (old's mobx subscription had no such hazard: React's `setState` scheduling
    // has no equivalent self-invalidating read/write-tracking mechanism to trip).
    //
    // `componentWillUnmount` -> the function `onMount` returns. Byte-parity order preserved.
    //
    // Methods: byte-parity bodies throughout, `this.state.X`/`this.props.t` reads become direct
    // closure-local reads, `this.setState({field}, callback)` becomes a direct assignment (already
    // reactively visible under `$state`, matching this migration's established "already-in-place-
    // mutated, no forced-new-reference step needed" idiom) followed by the callback's own body
    // inlined directly (`this.updateSettings` as the setState callback -> a direct `updateSettings()`
    // call right after the mutation). Two array-reassignment calls deserve explicit note, since they
    // land on OPPOSITE sides of the same "is it $state?" line `PlayerKeyboard.svelte`'s header
    // comment already establishes: `loadInstrument`'s `instruments = [...instruments]` (after the
    // in-place `instruments[0] = instrument`) is KEPT even though `$state` arrays already
    // reactively surface in-place index writes on their own - kept anyway for exact parity with old
    // and because it's harmless, the same call `PlayerKeyboard.svelte`'s own `tick()` makes for its
    // `approachingNotes` reassignment; `loadInstrument`'s/`loadInstruments`'s `instrumentsData`
    // reassignment, by contrast, is DROPPED (only the in-place `instrumentsData[0] = ...` mutation
    // survives) since `instrumentsData` is a plain (non-`$state`) local here - forcing a "new
    // reference" on a value nothing reads reactively serves no purpose, the same reasoning
    // `PlayerKeyboard.svelte`'s own header comment gives for dropping `handlePracticeClick`'s
    // vestigial `this.setState({songToPractice})`.
    //
    // `toggleRecordAudio`'s local `const recording = await AudioProvider.stopRecording()` shadowed
    // `this.recording` (the unrelated `Recording` note-buffer class field) by name only in old,
    // disambiguated there purely by the `this.` prefix. With no `this.` here, the local is renamed
    // `audioRecording` to avoid colliding with the outer `recording` variable - mechanical, no
    // behavior change (same class of required rename as `PlayerKeyboard.svelte`'s own
    // `approachingNotesRow` parameter rename for an analogous shadowing conflict).
    //
    // `handleSpeedChanger` (old: `ChangeEvent<HTMLSelectElement>`, `e.target.value`) is retyped
    // `Event & {currentTarget: EventTarget & HTMLSelectElement}` reading `e.currentTarget.value` -
    // the established native-`<select onchange>` handler shape this exact prop already has on the
    // `PlayerSongControls` side (`onRawSpeedChange`, see that component's own header comment).
    //
    // `//@ts-ignore` on `handleSettingChange`'s `settings[setting.key] = ...` -> `@ts-expect-error`
    // with a description (bare `@ts-ignore` is banned outside `src/lib/core/`) - the same
    // `SettingUpdateKey`-spans-4-settings-families substitution already established at
    // `zen-keyboard/+page.svelte`'s identical line.
    //
    // Two-tier (UI file, reads `$game` directly per the P4b plan's mapping table): old's
    // `INSTRUMENTS[0]` (both in the constructor's initial `instruments`/`instrumentsData` seed) ->
    // `game.instruments.list[0]`, the same substitution already established at
    // `MidiSetup.svelte`/`ZenKeyboardMenu.svelte`. `SPEED_CHANGERS` stays a direct
    // `$core/legacyConfig` import (on the UI-tier identity allowlist per the Global Constraints
    // section - Task 1 of this phase added it there). `NoteLayer` is a type-only import (only used
    // as `playSound`'s optional parameter type, never constructed here).
    //
    // Render: old's bare `<>...</>` fragment (PageMetadata + Menu + the right-panel record button +
    // KeyboardPlayer + PlayerSongControls, four/five top-level siblings) becomes this file's plain
    // top-level markup - Svelte components don't need an explicit fragment wrapper for multiple
    // root nodes. `<AppButton style={{marginTop: "0.8rem"}}>` (a React inline-style object) becomes
    // the CSS-string form `style="margin-top:0.8rem"` (`AppButton.svelte`'s own `style` prop is a
    // plain string, the same substitution used everywhere else `AppButton`/`AppBackground`-family
    // components are ported in this migration). `{!hasSong && <AppButton>...}` -> `{#if !hasSong}`
    // (a real DOM add/remove, matching old's actual conditional-render semantics, not a CSS-hide).
    //
    // Old's `<KeyboardPlayer>`/`<Menu>` local import aliases are dropped in favor of this
    // migration's established convention of tagging components by their real ported filename
    // (`PlayerKeyboard`/`PlayerMenu`) rather than re-deriving old's own default-export alias names.
    //
    // AppBackground (old: `PageBackground page="Main"`, i.e. `AppBackground page="Main"` -
    // `src/app/_components/PageBackground.tsx` is a 1-line pass-through) is NOT wired inside this
    // component - old wrapped `ClientPage` (this component) with it from OUTSIDE, at the
    // `app/page.tsx`/`app/player/page.tsx` route level, never inside `player/index.tsx` itself. The
    // two route files that mount `<Player/>` wire `<AppBackground page="Main">` around it instead
    // (see their own header comments) - the same "AppBackground wired directly by individual page
    // components, not shared chrome" convention `DefaultPage.svelte`'s own header comment already
    // documents, and the exact shape this file's `inPreview` sibling call site (`theme/+page.svelte`)
    // already uses (`<AppBackground page="Main"><Player inPreview/></AppBackground>`).
    let settings: PlayerSettingsDataType = $state(settingsService.getDefaultPlayerSettings())
    let instruments: Instrument[] = $state([new Instrument(game.instruments.list[0])])
    let instrumentsData: InstrumentData[] = [new InstrumentData({name: game.instruments.list[0]})]
    let isLoadingInstrument = $state(true)
    let isRecording = $state(false)
    let isRecordingAudio = $state(false)
    let isMetronomePlaying = $state(false)
    let hasSong = $state(false)
    let speedChanger = $state(SPEED_CHANGERS.find(e => e.name === 'x1') as typeof SPEED_CHANGERS[number])
    let recording = new Recording()
    let mounted = false
    let cleanup: (() => void)[] = []

    let {inPreview = false}: {inPreview?: boolean} = $props()

    onMount(() => {
        const loadedSettings = settingsService.getPlayerSettings()
        //for now reset this to prevent users from being confused
        loadedSettings.hidePracticeMode.value = false
        settings = loadedSettings
        mounted = true
        const instrument = instruments[0]
        if (instrument) playerStore.setKeyboardLayout(instrument.notes)
        const disposeShortcuts = createShortcutListener('player', 'player', ({shortcut}) => {
            const {name} = shortcut
            if (name === 'toggle_record') toggleRecord()
        })
        cleanup.push(disposeShortcuts)

        init(settings)

        $effect(() => {
            void playerStore.state.key
            void playerStore.state.playId
            untrack(() => {
                const {eventType, song} = playerStore.state
                if (!settings.syncSongData.value || song === null) return
                if (['play', 'practice', 'approaching'].includes(eventType)) {
                    handleSettingChange({
                        data: {
                            ...settings.pitch,
                            value: song.pitch
                        }, key: 'pitch'
                    })
                    handleSettingChange({
                        data: {
                            ...settings.reverb,
                            value: song.reverb
                        }, key: 'reverb'
                    })
                }
                loadInstruments(song.instruments)
            })
        })

        return () => {
            playerStore.resetSong()
            playerStore.resetKeyboardLayout()
            playerControlsStore.clearPages()
            playerControlsStore.resetScore()
            AudioProvider.clear()
            logger.hidePill()
            instruments.forEach(ins => ins.dispose())
            cleanup.forEach(c => c())
            mounted = false
            metronome.stop()
        }
    })

    async function init(loadedSettings: PlayerSettingsDataType) {
        await AudioProvider.waitReverb()
        await loadInstrument(loadedSettings.instrument.value)
        AudioProvider.setReverb(loadedSettings.reverb.value)
    }

    function setHasSong(data: boolean) {
        hasSong = data
    }

    function changeVolume(obj: SettingVolumeUpdate) {
        if (obj.key === 'instrument') {
            settings.instrument = {...settings.instrument, volume: obj.value}
            instruments.forEach(ins => ins.changeVolume(obj.value))
        }
        updateSettings()
    }

    async function loadInstrument(name: InstrumentName) {
        const oldInstrument = instruments[0]
        AudioProvider.disconnect(oldInstrument.endNode)
        instruments[0].dispose()
        const instrument = new Instrument(name)
        const volume = settings.instrument.volume ?? 100
        instrument.changeVolume(volume)
        isLoadingInstrument = true
        const loaded = await instrument.load(AudioProvider.getAudioContext())
        if (!loaded) logger.error(t('logs:error_loading_instrument'))
        AudioProvider.connect(instrument.endNode, null)
        if (!mounted) return
        playerStore.setKeyboardLayout(instrument.notes)
        instruments[0] = instrument
        instrumentsData[0] = new InstrumentData({name, volume})
        instruments = [...instruments]
        isLoadingInstrument = false
        AudioProvider.setReverb(settings.reverb.value)
    }

    function handleSpeedChanger(e: Event & {currentTarget: EventTarget & HTMLSelectElement}) {
        const changer = SPEED_CHANGERS.find(el => el.name === e.currentTarget.value)
        if (!changer) return
        speedChanger = changer
        restartSong()
    }

    async function restartSong(override?: number) {
        if (!mounted) return
        playerStore.restartSong((typeof override === 'number') ? override : playerControlsStore.position, playerControlsStore.end)
    }

    async function onSongFinished() {
        if (settings.loopPractice.value) {
            await delay(1000)
            restartSong()
        }
    }

    async function loadInstruments(toLoad: InstrumentData[]) {
        //remove excess instruments
        const extraInstruments = instruments.splice(toLoad.length)
        extraInstruments.forEach(ins => {
            AudioProvider.disconnect(ins.endNode)
            ins.dispose()
        })
        logger.showPill(t('logs:loading_instruments'))
        const promises = toLoad.map(async (ins, i) => {
            if (instruments[i] === undefined) {
                //If it doesn't have a layer, create one
                const instrument = new Instrument(ins.name)
                instruments[i] = instrument
                const loaded = await instrument.load(AudioProvider.getAudioContext())
                if (!loaded) logger.error(t('logs:error_loading_instrument'))
                if (!mounted) return instrument.dispose()
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            } else if (instruments[i].name === ins.name) {
                //if it has a layer and it's the same, just set the volume and reverb
                instruments[i].changeVolume(ins.volume)
                AudioProvider.setReverbOfNode(instruments[i].endNode, ins.reverbOverride)
                return instruments[i]
            } else {
                //if it has a layer and it's different, delete the layer and create a new one
                const old = instruments[i]
                AudioProvider.disconnect(old.endNode)
                old.dispose()
                const instrument = new Instrument(ins.name)
                instruments[i] = instrument
                const loaded = await instrument.load(AudioProvider.getAudioContext())
                if (!loaded) logger.error(t('logs:error_loading_instrument'))
                if (!mounted) return instrument.dispose()
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            }
        })
        const newInstruments = await Promise.all(promises) as Instrument[]
        if (!mounted) return
        if (instruments[0]) {
            settings.instrument = {...settings.instrument, value: instruments[0].name}
            playerStore.setKeyboardLayout(instruments[0].notes)
        }
        instruments = newInstruments
        instrumentsData = toLoad
        logger.hidePill()
        updateSettings()
    }

    function playSound(index: number, layers?: NoteLayer) {
        if (isRecording) handleRecording(index)
        if (!layers) {
            instruments[0].play(index, settings.pitch.value)
        } else {
            instruments.forEach((ins, i) => {
                const insData = instrumentsData[i]
                if (layers.test(i) && !insData?.muted) {
                    const pitch = insData?.pitch || settings.pitch.value
                    ins.play(index, pitch)
                }
            })
        }
    }

    function updateSettings(override?: PlayerSettingsDataType) {
        settingsService.updatePlayerSettings(override !== undefined ? override : settings)
    }

    //TODO make method to sync settings to the song
    function handleSettingChange(setting: SettingUpdate) {
        const {data} = setting
        // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
        settings[setting.key] = {...settings[setting.key], value: data.value}
        if (setting.key === 'instrument') {
            loadInstrument(data.value as InstrumentName)
        }
        if (setting.key === 'reverb') AudioProvider.setReverb(data.value as boolean)
        if (setting.key === 'bpm') metronome.bpm = data.value as number
        if (setting.key === 'metronomeBeats') metronome.beats = data.value as number
        if (setting.key === 'metronomeVolume') metronome.changeVolume(data.value as number)
        updateSettings()
    }

    async function addSong(song: RecordedSong | ComposedSong) {
        try {
            const id = await songsStore.addSong(song)
            song.id = id
            const type = song.type ?? (song.data.isComposedVersion ? 'composed' : 'recorded')
            logger.success(t('logs:song_added_to_folder', {
                song_name: song.name,
                folder_name: t(`menu:${type}`)
            }), 4000)
        } catch (e) {
            console.error(e)
            return logger.error(t('logs:error_importing_song', {song_name: song.name}))
        }
    }

    async function removeSong(name: string, id: string) {
        const result = await asyncConfirm(t('confirm:delete_song', {song_name: name}))
        if (!mounted) return
        if (result) {
            await songsStore.removeSong(id)
            Analytics.userSongs('delete', {page: 'player'})
        }
    }

    async function renameSong(newName: string, id: string) {
        await songsStore.renameSong(id, newName)
    }

    function handleRecording(index: number) {
        if (isRecording) {
            recording.addNote(index)
        }
    }

    function toggleMetronome() {
        const wasPlaying = isMetronomePlaying
        isMetronomePlaying = !wasPlaying
        if (wasPlaying) {
            metronome.stop()
        } else {
            metronome.bpm = settings.bpm.value
            metronome.beats = settings.metronomeBeats.value
            metronome.changeVolume(settings.metronomeVolume.value)
            metronome.start()
        }
    }

    async function toggleRecord(override?: boolean | null) {
        if (typeof override !== 'boolean') override = null
        const newState = override !== null ? override : !isRecording
        if (!newState && recording.notes.length > 0) { //if there was a song recording
            const songName = await asyncPrompt(t('question:ask_song_name_cancellable'))
            if (!mounted) return
            if (songName !== null) {
                const song = new RecordedSong(songName, recording.notes, [instruments[0].name])
                song.bpm = settings.bpm.value
                song.pitch = settings.pitch.value
                song.reverb = settings.reverb.value
                addSong(song)
                Analytics.userSongs('record', {page: 'player'})
            }
        } else {
            recording = new Recording()
        }
        isRecording = newState
    }

    function enableLoop(enabled: boolean) {
        settings.loopPractice.value = enabled
        updateSettings()
    }

    function setHidePracticeNotes(hide: boolean) {
        settings.hidePracticeMode.value = hide
        updateSettings()
    }

    async function toggleRecordAudio(override?: boolean | null) {
        if (!mounted) return
        if (typeof override !== 'boolean') override = null
        const newState = override !== null ? override : !isRecordingAudio
        isRecordingAudio = newState
        if (newState) {
            AudioProvider.startRecording()
        } else {
            const audioRecording = await AudioProvider.stopRecording()
            const fileName = await asyncPrompt(t('question:ask_song_name_cancellable'))
            if (!mounted || !audioRecording) return
            try {
                if (fileName) await AudioRecorder.downloadBlob(audioRecording.data, fileName + '.wav')
            } catch (e) {
                console.error(e)
                logger.error(t('logs:error_downloading_audio'))
            }
        }
    }
</script>

<PageMetadata
    text={t('home:player_name')}
    description="Learn how to play songs, play them by hand and record them. Use the approaching circles mode or the guided tutorial to learn sections of a song at your own pace. Share your sheets or import existing ones."
/>
<PlayerMenu
    functions={{addSong, removeSong, handleSettingChange, changeVolume, renameSong}}
    data={{settings}}
    inPreview={inPreview}
/>
<div class="right-panel appear-on-mount">
    <div class="upper-right">
        {#if !hasSong}
            <AppButton
                toggled={isRecording}
                onclick={() => toggleRecord()}
                style="margin-top:0.8rem"
            >
                {isRecording ? t('common:stop') : t('common:record')}
            </AppButton>
        {/if}
    </div>
    <div class="keyboard-wrapper">
        <PlayerKeyboard
            data={{
                isLoading: isLoadingInstrument,
                instrument: instruments[0],
                pitch: settings.pitch.value,
                keyboardSize: settings.keyboardSize.value,
                noteNameType: settings.noteNameType.value,
                hasSong,
                hasAnimation: settings.noteAnimation.value,
                approachRate: settings.approachSpeed.value,
                keyboardYPosition: settings.keyboardYPosition.value,
                speedChanger,
                hideNotesInPracticeMode: settings.hidePracticeMode.value,
                visualSheetSize: settings.numberOfVisualColumns.value * settings.numberOfVisualRows.value
            }}
            functions={{
                playSound,
                setHasSong,
                onSongFinished
            }}
        />
    </div>
</div>
<PlayerSongControls
    hidePracticeNotes={settings.hidePracticeMode.value}
    isRecordingAudio={isRecordingAudio}
    isVisualSheetVisible={settings.showVisualSheet.value}
    visualSheetColumns={settings.numberOfVisualColumns.value}
    loopEnabled={settings.loopPractice.value}
    isMetronomePlaying={isMetronomePlaying}
    hasSong={hasSong}
    speedChanger={speedChanger}
    setLoopEnabled={enableLoop}
    setHidePracticeNotes={setHidePracticeNotes}
    onToggleRecordAudio={toggleRecordAudio}
    onRestart={restartSong}
    onToggleMetronome={toggleMetronome}
    onRawSpeedChange={handleSpeedChanger}
/>
