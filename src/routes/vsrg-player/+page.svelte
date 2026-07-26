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

    // Old: THREE files collapse into this ONE route, per this task's brief - same
    // shape/rationale vsrg-composer/+page.svelte (P4c Task 8) already established for its own
    // sibling page ("no separate preview consumer anywhere on this branch, so there is no second
    // caller that would need a $cmp/Page.svelte + route split the way Player.svelte/Composer.svelte
    // needed" - re-verified true here too: grepped `src/routes/theme/+page.svelte`, zero `Vsrg`
    // references):
    //   - src/app/vsrg-player/page.tsx (6 lines): `<PageBackground page="Main"><ClientPage/>
    //     </PageBackground>` -> the `<AppBackground page="Main">` wrapper below, at the route level
    //     (same established mapping as /player/+page.svelte's own identical wrapper).
    //   - src/app/_client-pages/vsrg-player/index.tsx's own default-exported `VsrgPlayerPage`
    //     wrapper function: `useSetPageVisited('vsrgPlayer')` then `<VsrgPlayer/>` -> the
    //     `setPageVisited('vsrgPlayer')` call inside `onMount` below (React's commit order runs a
    //     parent's own effect AFTER its child's - i.e. after old's `VsrgPlayer` class's own
    //     `componentDidMount` already ran - so it is placed at the END of `onMount` here, matching
    //     that real observable order, not just textual position).
    //   - The `VsrgPlayer` class itself (`componentDidMount`/`componentWillUnmount`/every method/
    //     the render tree) - ported directly below, PascalCase methods become plain functions,
    //     `this.state.X` becomes a top-level `$state` (or a plain closure variable for the two
    //     fields the render tree never reads - `lastTimestamp` and the two `AudioPlayer` instances,
    //     matching the established "only promote to $state what's actually read reactively"
    //     convention already used by every other Phase-4 page port, e.g. vsrg-composer/+page.svelte's
    //     own `audioPlayer`/`lastTimestamp`).
    //
    // `currentLayout: keyBinds.getVsrgKeybinds(4)` (old: a constructor-time class-state field, read
    // exactly ONCE, in `componentDidMount`, and never again - not even by `render()`) is inlined
    // directly at its one real call site in `onMount` below rather than kept as its own field - a
    // disclosed, zero-behavior-change simplification.
    //
    // `defaultVsrgPlayerSizes` is duplicated here VERBATIM from VsrgPlayerRenderer.ts's own export,
    // for the SAME reason old itself already duplicated it (old's own comment: "Defined locally
    // (mirrors VsrgPlayerCanvas' export) so the page does not statically import the pixi module.")
    // - importing the VALUE from VsrgPlayerRenderer.ts would statically pull in `pixi.js`, breaking
    // this route's prerender safety; `VsrgPlayerCanvasSizes` above is a TYPE-only import (fully
    // erased at compile time, zero runtime import) so it carries no such risk.
    //
    // `songAudioPlayer`/`keyboardAudioPlayer` both construct `new AudioPlayer('C')` - a literal,
    // hardcoded base pitch (NOT derived from any setting - `VsrgPlayerSettingsDataType` has no
    // `pitch` field at all), matching old exactly; `onSongSelect` below re-assigns
    // `songAudioPlayer.basePitch` via a RAW field write (`songAudioPlayer.basePitch = parsed.pitch`),
    // not the `.setBasePitch()` method AudioPlayer also exposes - old's own exact quirk (functionally
    // identical either way, `setBasePitch` is a one-line wrapper around the same field write),
    // reproduced verbatim rather than "cleaned up" to call the method.
    let settings = $state(settingsService.getDefaultVsrgPlayerSettings())
    let song: VsrgSong | null = $state(null)
    let songDuration = $state(0)
    let audioSong: RecordedSong | null = $state(null)
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
        // @ts-expect-error SettingUpdateKey spans all settings families; narrower here by design -
        // old's own `//@ts-ignore` on the equivalent line.
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
