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
        // QUIRK: practice mode is force-reset on load so a returning user is not dropped into it unexpectedly. Old did this deliberately.
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

        // init() is intentionally not awaited: $effect below must be registered synchronously,
        // before any await, or Svelte throws effect_orphan. Fire-and-forget is safe here since
        // playerStore.state.song is always null this early - nothing can call play/practice/
        // approaching before the user interacts with the now-visible page.
        init(settings)

        $effect(() => {
            // Read (and discard) key/playId so this effect reruns on every play/practice/
            // approaching/resetSong/restartSong call, even when the song object is reference-equal.
            void playerStore.state.key
            void playerStore.state.playId
            // untrack: the body reads settings.pitch/reverb and, via handleSettingChange, writes
            // the same settings path - without untrack that read-then-write self-triggers this
            // effect and throws effect_update_depth_exceeded once a song actually plays.
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
