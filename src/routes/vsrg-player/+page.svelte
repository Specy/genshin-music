<script lang="ts">
    import {onMount} from 'svelte'
    import AppBackground from '$cmp/theme/AppBackground.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import VsrgPlayerMenu from '$cmp/pages/VsrgPlayer/VsrgPlayerMenu.svelte'
    import VsrgPlayerCanvas from '$cmp/pages/VsrgPlayer/VsrgPlayerCanvas.svelte'
    import VsrgPlayerKeyboard from '$cmp/pages/VsrgPlayer/VsrgPlayerKeyboard.svelte'
    import VsrgPlayerRight from '$cmp/pages/VsrgPlayer/VsrgPlayerRight.svelte'
    import VsrgLatestScore from '$cmp/pages/VsrgPlayer/VsrgLatestScore.svelte'
    import type {VsrgSongSelectType} from '$cmp/pages/VsrgPlayer/VsrgPlayerSongRow.svelte'
    import type {VsrgPlayerCanvasSizes} from '$cmp/pages/VsrgPlayer/VsrgPlayerRenderer'
    import {DEFAULT_DOM_RECT} from '$core/legacyConfig'
    import {VsrgSong, type VsrgHitObject} from '$core/Songs/VsrgSong'
    import {RecordedSong} from '$core/Songs/RecordedSong'
    import {ComposedSong} from '$core/Songs/ComposedSong'
    import {AudioPlayer} from '$lib/audio/AudioPlayer'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {songService} from '$core/Services/SongService'
    import {settingsService} from '$core/Services/SettingsService'
    import type {VsrgPlayerSettingsDataType} from '$core/BaseSettings'
    import type {SettingUpdate} from '$core/types/SettingsPropriety'
    import {vsrgPlayerStore} from '$stores/VsrgPlayerStore.svelte'
    import {keyBinds, createShortcutListener} from '$stores/KeybindsStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {t} from '$i18n/binding.svelte'

    let settings = $state(settingsService.getDefaultVsrgPlayerSettings())
    let song: VsrgSong | null = $state(null)
    let songDuration = $state(0)
    let audioSong: RecordedSong | null = $state(null)
    // QUIRK (load-bearing): duplicated verbatim from VsrgPlayerRenderer.ts's own
    // defaultVsrgPlayerSizes export - this route must never statically import that module (it
    // touches pixi.js, which would break prerendering), so it keeps its own copy instead.
    let canvasSizes: VsrgPlayerCanvasSizes = $state({
        el: {...DEFAULT_DOM_RECT},
        rawWidth: 0,
        rawHeight: 0,
        width: 0,
        height: 0,
        keyWidth: 0,
        hitObjectSize: 0,
        scaling: 0,
        verticalOffset: 0,
    })
    let isPlaying = $state(false)

    // Hardcoded 'C' base pitch below (not settings-derived - VsrgPlayerSettingsDataType has no
    // pitch field), matching old.
    const songAudioPlayer = new AudioPlayer('C')
    const keyboardAudioPlayer = new AudioPlayer('C')
    let lastTimestamp = 0

    onMount(() => {
        settings = settingsService.getVsrgPlayerSettings()
        vsrgPlayerStore.setLayout(keyBinds.getVsrgKeybinds(4))
        const disposeShortcuts = createShortcutListener('vsrg_player', 'vsrg_player', ({shortcut}) => {
            const {name} = shortcut
            if (name === 'restart') onRetrySong()
            if (name === 'stop') onStopSong()
        })
        setPageVisited('vsrgPlayer')
        return () => {
            songAudioPlayer.destroy()
            keyboardAudioPlayer.destroy()
            vsrgPlayerStore.resetScore()
            logger.hidePill()
            disposeShortcuts()
        }
    })

    async function onSongSelect(newSong: VsrgSong, type: VsrgSongSelectType) {
        const serializedAudioSong = await songsStore.getSongById(newSong.audioSongId)
        logger.showPill(t('logs:loading_instruments'))
        if (serializedAudioSong) {
            const parsed = songService.parseSong(serializedAudioSong)
            // QUIRK: raw field write below, not the .setBasePitch() method AudioPlayer also exposes - functionally identical (setBasePitch is a one-line wrapper around this same field write), but reproduced verbatim to match old rather than "cleaned up" to call the method.
            songAudioPlayer.basePitch = parsed.pitch
            if (parsed instanceof RecordedSong) {
                audioSong = parsed
                await songAudioPlayer.syncInstruments(parsed.instruments)
            }
            if (parsed instanceof ComposedSong) {
                const recorded = parsed.toRecordedSong(0)
                audioSong = recorded
                await songAudioPlayer.syncInstruments(recorded.instruments)
            }
        } else {
            audioSong = null
        }
        await keyboardAudioPlayer.syncInstruments(newSong.tracks.map(track => track.instrument))
        logger.hidePill()
        song = newSong
        songDuration = newSong.getHighestNoteTime()
        isPlaying = true
        if (type === 'play') {
            vsrgPlayerStore.setLayout(keyBinds.getVsrgKeybinds(newSong.keys))
            vsrgPlayerStore.playSong(newSong)
        }
    }

    function handleSettingChange(setting: SettingUpdate) {
        const {data} = setting
        // @ts-expect-error SettingUpdateKey spans all settings families; narrower here by design.
        settings[setting.key] = {...settings[setting.key], value: data.value}
        updateSettings()
        if (setting.key === 'maxFps') vsrgPlayerStore.emitEvent('fpsChange')
    }

    function updateSettings(override?: VsrgPlayerSettingsDataType) {
        settingsService.updateVsrgPlayerSettings(override !== undefined ? override : settings)
    }

    function onSizeChange(sizes: VsrgPlayerCanvasSizes) {
        canvasSizes = sizes
    }

    function onStopSong() {
        isPlaying = false
        song = null
        vsrgPlayerStore.stopSong()
    }

    function onRetrySong() {
        if (!song) return
        onSongSelect(song, 'play')
    }

    function handleTick(timestamp: number) {
        lastTimestamp = timestamp
        if (!song) return
        if (lastTimestamp >= songDuration + 2000) {
            isPlaying = false
            vsrgPlayerStore.showScore()
        }
        if (lastTimestamp >= song.duration || timestamp < 0) return
        if (audioSong) {
            const notes = audioSong.tickPlayback(timestamp + settings.offset.value)
            notes.forEach(n => {
                const layers = n.layer.toArray()
                layers.forEach((l, i) => {
                    if (l === 0 || song!.trackModifiers[i].muted) return
                    songAudioPlayer.playNoteOfInstrument(i, n.index)
                })
            })
        }
    }

    function playHitObject(hitObject: VsrgHitObject, instrumentIndex: number) {
        if (keyboardAudioPlayer) {
            hitObject.notes.forEach(n => {
                keyboardAudioPlayer.playNoteOfInstrument(instrumentIndex, n)
            })
        }
    }
</script>

<AppBackground page="Main">
    <PageMetadata text={t('home:vsrg_player_name')} description="Play or practice VSRG songs" />
    <VsrgPlayerMenu
        settings={settings}
        onSettingsUpdate={handleSettingChange}
        onSongSelect={onSongSelect}
    />
    <div class="vsrg-player-page appear-on-mount">
        <div class="vsrg-player-grid">
            <VsrgPlayerCanvas
                keyboardLayout={settings.keyboardLayout.value}
                onTick={handleTick}
                maxFps={settings.maxFps.value}
                scrollSpeed={settings.approachTime.value}
                onSizeChange={onSizeChange}
                playHitObject={playHitObject}
                isPlaying={isPlaying}
            />
            <VsrgPlayerKeyboard
                keyboardLayout={settings.keyboardLayout.value}
                offset={canvasSizes.verticalOffset}
                hitObjectSize={canvasSizes.hitObjectSize}
                verticalOffset={settings.verticalOffset.value}
                horizontalOffset={settings.horizontalOffset.value}
            />
        </div>
        <VsrgPlayerRight
            song={song}
            onStopSong={onStopSong}
            onRetrySong={onRetrySong}
        />
        <VsrgLatestScore />
    </div>
</AppBackground>

<style>
    .vsrg-player-page {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        align-items: center;
    }

    .vsrg-player-grid {
        opacity: 0.96;
        width: 100%;
        height: 100%;
        display: grid;
        justify-items: center;
        align-items: flex-end;
        grid-template-areas:
            'a'
            'b';
        perspective: 100vh;
        grid-template-rows: 1fr min-content;
    }
</style>
