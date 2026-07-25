<script lang="ts">
    import {onMount} from 'svelte'
    import {goto} from '$app/navigation'
    import {resolve} from '$app/paths'
    import {ClickType, clamp, isFocusable} from '$core/utils/Utilities'
    import {DEFAULT_VSRG_KEYS_MAP} from '$core/legacyConfig'
    import {t} from '$i18n/binding.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import DecoratedCard from '$cmp/layout/DecoratedCard.svelte'
    import VsrgComposerMenu from '$cmp/pages/VsrgComposer/VsrgComposerMenu.svelte'
    import VsrgTop from '$cmp/pages/VsrgComposer/VsrgTop.svelte'
    import VsrgBottom from '$cmp/pages/VsrgComposer/VsrgBottom.svelte'
    import type {VsrgHitObjectType} from '$cmp/pages/VsrgComposer/VsrgBottom.svelte'
    import VsrgComposerCanvas from '$cmp/pages/VsrgComposer/VsrgComposerCanvas.svelte'
    import {VsrgSong, type VsrgHitObject, type VsrgTrack, type VsrgTrackModifier, type VsrgSongKeys} from '$core/Songs/VsrgSong'
    import type {SnapPoint} from '$core/types'
    import type {SettingUpdate} from '$core/types/SettingsPropriety'
    import type {VsrgComposerSettingsDataType} from '$core/BaseSettings'
    import {AudioPlayer} from '$lib/audio/AudioPlayer'
    import {KeyboardProvider} from '$lib/providers/KeyboardProvider'
    import type {KeyboardEventData} from '$lib/providers/KeyboardProvider'
    import {asyncConfirm, asyncPrompt} from '$stores/AsyncPromptStore.svelte'
    import {createShortcutListener, type ShortcutListener} from '$stores/KeybindsStore.svelte'
    import {registerLeaveHandler} from '$stores/navigationGuard.svelte'
    import {settingsService} from '$core/Services/SettingsService'
    import {vsrgComposerStore} from '$stores/VsrgComposerStore.svelte'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {songService} from '$core/Services/SongService'
    import {RecordedSong} from '$core/Songs/RecordedSong'
    import {ComposedSong} from '$core/Songs/ComposedSong'
    import type {SerializedSong} from '$core/Songs/Song'
    import type {RecordedNote} from '$core/Songs/SongClasses'
    import {homeStore} from '$stores/HomeStore.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'

    // Old: src/app/_client-pages/vsrg-composer/index.tsx (707 lines) - the `VsrgComposer` class
    // component (the whole page) plus its thin default-export wrapper function `VsrgcomposerPage`
    // (`useSetPageVisited('vsrgComposer')` then `<VsrgComposer navigation={...}
    // registerLeaveHandler={...} t={...}/>`).
    //
    // FILE-SPLIT DECISION (per this task's own brief): unlike Composer.svelte/Player.svelte, which
    // split their old class body into a `$cmp/pages/X/X.svelte` component + a thin
    // `src/routes/X/+page.svelte` route wrapper (because BOTH of those pages are also mounted a
    // SECOND time, in preview mode, from `theme/+page.svelte`), the vsrg-composer page has NO
    // preview consumer anywhere on this branch (grepped `src/routes/theme/+page.svelte`: zero `Vsrg`
    // references) - so there is no second caller that would need the class/route split. This whole
    // file IS the page: state, lifecycle, every method, and the render tree all live directly here,
    // a deliberate choice stated explicitly per the brief rather than mirroring the composer split
    // by reflex.
    //
    // `navigation`/`registerLeaveHandler`/`t` prop-threading is dropped exactly like every other
    // Phase-4 page: `registerLeaveHandler` is imported directly (`$stores/navigationGuard.svelte`,
    // P4c Task 2), `t()` is the reactive i18n binding, and `goto`/`resolve` (`$app/navigation`/
    // `$app/paths`) replace the old React-Router-shaped `navigation.push` (used only by the dead
    // `changePage` below - see its own note).
    //
    // REQUIRED ADAPTATION, LOAD-BEARING (same class of fix as Composer.svelte's own documented
    // `refreshSong()`, and VsrgComposerStore.svelte.ts's own header note that this class instance is
    // NOT deep-proxied by `$state()`): `vsrg` is a `VsrgSong` class instance - Svelte 5's `$state()`
    // runtime proxy never wraps it (only `Object.prototype`/`Array.prototype`-rooted values are deep-
    // proxied), so in-place mutations (`vsrg.tracks.push(...)`, `vsrg.set({...})`, etc.) are
    // invisible to any `$derived`/template/`$effect` reading `vsrg` UNLESS the top-level `vsrg`
    // variable itself is reassigned. `refreshVsrg()` below (`vsrg = vsrg.clone()`) is called at
    // EVERY point old's own `this.setState({vsrg, ...})` included `vsrg` as a key - reproducing old's
    // own (React-driven, "any setState re-renders everything downstream") rendering trigger as
    // literally as possible - PLUS one place old's setState omitted `vsrg` but this port still needs
    // it (`setAudioSong`'s `vsrg.setAudioSong(...)` call, which reassigns `vsrg.trackModifiers` -
    // read directly by `VsrgComposerMenu`'s own `data.trackModifiers` template prop; see that
    // function's own comment for the full reasoning, since old's coarse full-tree React re-render
    // papered over the exact same gap).
    //
    // NOT a correctness gap needing `refreshVsrg()`, even though the underlying pixi renderer
    // (`VsrgComposerCanvas.svelte`/`VsrgComposerRenderer.ts`, Task 7) is fed the SAME live `vsrg`
    // reference: that renderer's OWN `vsrgComposerStore.addEventListener('ALL', ...)` mechanism
    // (`handleEvent` -> `calculateSizes()`/`generateCache()` -> `draw()`) reads its retained
    // `this.state.vsrg` directly on every relevant `vsrgComposerStore.emitEvent(...)` call - since
    // that retained reference is the SAME live object this page mutates in place, its CONTENTS are
    // always current regardless of whether the renderer's OWN field was just reassigned by a fresh
    // `update()` call. Every `vsrgComposerStore.emitEvent(...)` call site below is ported at the
    // EXACT same point old's own code emitted it, for exactly this reason.
    //
    // `heldKeys`/`pressedDownHitObjects`/`lastTimestamp`/`playbackTimestamp`/`mounted`/`cleanup` are
    // old class-instance fields the render tree never reads directly - plain (non-`$state`) closure
    // variables here, same established "only promote to $state what the template/a derived/an effect
    // actually reads" convention used throughout this migration.
    let settings = $state(settingsService.getDefaultVsrgComposerSettings())
    let vsrg: VsrgSong = $state(new VsrgSong('Untitled'))
    // svelte-ignore state_referenced_locally
    vsrg.addTrack('DunDun')
    // svelte-ignore state_referenced_locally
    vsrg.set({
        bpm: settings.bpm.value,
        keys: settings.keys.value,
    })

    // svelte-ignore state_referenced_locally
    const audioPlayer = new AudioPlayer(settings.pitch.value)
    // svelte-ignore state_referenced_locally
    const audioPlaybackPlayer = new AudioPlayer(settings.pitch.value)
    let selectedTrack = $state(0)
    let snapPoint: SnapPoint = $state(1)
    let snapPoints: number[] = $state([0])
    let snapPointDuration = $state(0)
    let selectedHitObject: VsrgHitObject | null = $state(null)
    let scaling = $state(60)
    let selectedType: VsrgHitObjectType = $state('tap')
    let isPlaying = $state(false)
    let lastCreatedHitObject: VsrgHitObject | null = $state(null)
    let audioSong: RecordedSong | null = $state(null)
    let renderableNotes: RecordedNote[] = $state([])
    let tempoChanger = $state(1)
    let changes = $state(0)

    let lastTimestamp = 0
    let mounted = false
    const heldKeys: (boolean | undefined)[] = []
    const pressedDownHitObjects: (VsrgHitObject | undefined)[] = []
    const cleanup: (() => void)[] = []

    function refreshVsrg() {
        vsrg = vsrg.clone()
    }

    function addTrack() {
        vsrg.addTrack()
        refreshVsrg()
        vsrgComposerStore.emitEvent('tracksChange')
    }

    onMount(() => {
        const id = 'vsrg-composer'
        const loadedSettings = settingsService.getVsrgComposerSettings()
        settings = loadedSettings
        audioPlayer.setBasePitch(loadedSettings.pitch.value)
        audioPlaybackPlayer.setBasePitch(loadedSettings.pitch.value)
        mounted = true
        calculateSnapPoints()
        syncInstruments()

        cleanup.push(registerLeaveHandler(prepareToLeave))
        const disposeShortcuts = createShortcutListener('vsrg_composer', 'vsrg_composer', handleShortcut)
        cleanup.push(disposeShortcuts)
        KeyboardProvider.listen(handleKeyboardDown, {id, type: 'keydown'})
        KeyboardProvider.listen(handleKeyboardUp, {id, type: 'keyup'})

        setPageVisited('vsrgComposer')

        return () => {
            mounted = false
            KeyboardProvider.unregisterById('vsrg-composer')
            audioPlaybackPlayer.destroy()
            audioPlayer.destroy()
            cleanup.forEach(dispose => dispose())
        }
    })

    const handleShortcut: ShortcutListener<'vsrg_composer'> = ({shortcut, event}) => {
        const {name} = shortcut
        if (event.code === 'Space') {
            if (event.repeat && name === 'toggle_play') return
            if (isFocusable(document.activeElement)) {
                (document.activeElement as HTMLElement | null)?.blur()
            }
        }
        if (name === 'set_tap_hand') selectedType = 'tap'
        if (name === 'set_hold_hand') selectedType = 'hold'
        if (name === 'set_delete_hand') selectedType = 'delete'
        if (name === 'deselect') {
            selectedHitObject = null
            lastCreatedHitObject = null
        }
        if (name === 'toggle_play') togglePlay()
        if (name === 'next_breakpoint') onBreakpointSelect(1)
        if (name === 'previous_breakpoint') onBreakpointSelect(-1)
        if (name === 'next_track') selectTrack(Math.min(vsrg.tracks.length - 1, selectedTrack + 1))
        if (name === 'previous_track') selectTrack(Math.max(0, selectedTrack - 1))
        if (name === 'delete') {
            if (!selectedHitObject) return
            vsrg.removeHitObjectInTrackAtTimestamp(selectedTrack, selectedHitObject.timestamp, selectedHitObject.index)
            selectedHitObject = null
            lastCreatedHitObject = null
        }
        if (name === 'move_right') {
            if (!selectedHitObject) return
            if (settings.isVertical.value) {
                selectedHitObject.index = clamp(selectedHitObject.index + 1, 0, vsrg.keys)
            } else {
                selectedHitObject.timestamp = selectedHitObject.timestamp + snapPointDuration
            }
            releaseHitObject()
        }
        if (name === 'move_down') {
            if (!selectedHitObject) return
            if (settings.isVertical.value) {
                selectedHitObject.timestamp = selectedHitObject.timestamp - snapPointDuration
            } else {
                selectedHitObject.index = clamp(selectedHitObject.index + 1, 0, vsrg.keys)
            }
            releaseHitObject()
        }
        if (name === 'move_left') {
            if (!selectedHitObject) return
            if (settings.isVertical.value) {
                selectedHitObject.index = clamp(selectedHitObject.index - 1, 0, vsrg.keys)
            } else {
                selectedHitObject.timestamp = selectedHitObject.timestamp - snapPointDuration
            }
            releaseHitObject()
        }
        if (name === 'move_up') {
            if (!selectedHitObject) return
            if (settings.isVertical.value) {
                selectedHitObject.timestamp = selectedHitObject.timestamp + snapPointDuration
            } else {
                selectedHitObject.index = clamp(selectedHitObject.index - 1, 0, vsrg.keys)
            }
            releaseHitObject()
        }
    }

    function updateSettings(override?: VsrgComposerSettingsDataType) {
        settingsService.updateVsrgComposerSettings(override !== undefined ? override : settings)
    }

    function syncInstruments() {
        audioPlayer.syncInstruments(vsrg.tracks.map(track => track.instrument))
    }

    function syncAudioSongInstruments() {
        if (audioSong === null) return
        audioPlaybackPlayer.syncInstruments(audioSong.instruments)
        audioPlaybackPlayer.basePitch = audioSong.pitch
    }

    function handleKeyboardDown({event, letter, shift}: KeyboardEventData) {
        if (shift) return
        const key = DEFAULT_VSRG_KEYS_MAP[vsrg.keys]?.indexOf(letter)
        if (key >= 0) {
            if (event.repeat) return
            startHitObjectTap(key)
        }
    }

    function handleKeyboardUp({letter}: KeyboardEventData) {
        const key = DEFAULT_VSRG_KEYS_MAP[vsrg.keys]?.indexOf(letter)
        if (key >= 0) {
            endHitObjectTap(key)
        }
    }

    function startHitObjectTap(key: number) {
        heldKeys[key] = true
        changes++
        const timestamp = findClosestSnapPoint(lastTimestamp)
        if (selectedType === 'delete') {
            vsrg.removeHitObjectInTrackAtTimestamp(selectedTrack, timestamp, key)
            selectedHitObject = null
            return
        }
        const hitObject = vsrg.createHitObjectInTrack(selectedTrack, timestamp, key)
        pressedDownHitObjects[key] = hitObject
        selectedHitObject = hitObject
    }

    function endHitObjectTap(key: number) {
        const hitObject = pressedDownHitObjects[key]
        if (heldKeys[key] && hitObject) {
            const snap = findClosestSnapPoint(hitObject.timestamp + hitObject.holdDuration)
            vsrg.setHeldHitObjectTail(selectedTrack, hitObject, snap - hitObject.timestamp)
        }
        heldKeys[key] = false
        pressedDownHitObjects[key] = undefined
    }

    function handleSettingChange({key, data}: SettingUpdate) {
        // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
        settings[key] = {...settings[key], value: data.value}
        // PRESERVED QUIRK: old special-cases exactly `keys`/`bpm`/`difficulty` here (NOT a generic
        // `songSetting` flag branch the way Composer.svelte's own handleSettingChange does) - even
        // though `pitch` is ALSO marked `songSetting: true` in VsrgComposerSettings.data, old never
        // propagates a "pitch" setting change into `vsrg.pitch` for an ALREADY-OPEN song (only
        // `createNewSong` ever seeds `vsrg.pitch` from the settings). Reproduced exactly - not
        // generalized to match Composer's own different (and, for THIS page, more complete) idiom.
        if (key === 'keys') {
            vsrg.changeKeys(data.value as VsrgSongKeys)
        }
        if (key === 'bpm') {
            vsrg.set({bpm: data.value as number})
            calculateSnapPoints()
        }
        if (key === 'difficulty') {
            vsrg.set({difficulty: data.value as number})
        }
        updateSettings()
        if (key === 'keys') vsrgComposerStore.emitEvent('updateKeys')
        if (key === 'isVertical') vsrgComposerStore.emitEvent('updateOrientation')
        if (key === 'maxFps') vsrgComposerStore.emitEvent('maxFpsChange')
    }

    async function prepareToLeave(): Promise<boolean> {
        if (changes === 0) return true
        if (settings.autosave.value) return (await saveSong()) !== null
        const shouldSave = await asyncConfirm(t('question:unsaved_song_save', {song_name: vsrg.name}), true)
        if (shouldSave === null) return false
        if (!shouldSave) return true
        return (await saveSong()) !== null
    }

    // DEAD CODE, preserved: old's own `changePage` is defined but never wired to any child prop
    // (grepped the raw blob: `VsrgComposerMenu`'s props/JSX call site here never included a
    // `changePage`/theme-link callback the way Composer.svelte's/PlayerMenu.svelte's own menus do) -
    // this page has no "change app theme" link at all. Ported anyway per this task's own brief
    // (which explicitly lists it among the methods to port), unreachable in both old and here.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- unreachable in old too, see comment above
    async function changePage(page: string) {
        if (page === 'Home') return homeStore.open()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see AppLink.svelte's identical resolve(href as any) note; page is a general runtime string, not a literal route id
        await goto(resolve(`/${page}` as any))
    }

    function onSnapPointChange(newSnapPoint: SnapPoint) {
        vsrg.set({snapPoint: newSnapPoint})
        snapPoint = newSnapPoint
        refreshVsrg()
        calculateSnapPoints()
        vsrgComposerStore.emitEvent('snapPointChange')
    }

    function selectHitObject(hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) {
        const newSelectedType: VsrgHitObjectType = hitObject.isHeld ? 'hold' : 'tap'
        if (selectedType === 'delete' || clickType === ClickType.Right) {
            vsrg.removeHitObjectInTrack(trackIndex, hitObject)
            selectedHitObject = null
            refreshVsrg()
            return
        }
        if (selectedType === 'hold' && clickType === ClickType.Left) {
            selectedHitObject = hitObject
            lastCreatedHitObject = hitObject
            selectedType = newSelectedType
        }
        selectedHitObject = hitObject
        selectedTrack = trackIndex
        selectedType = newSelectedType
    }

    function onSnapPointSelect(timestamp: number, key: number, type?: ClickType) {
        changes++
        if (timestamp < 0) {
            console.warn('Timestamp is less than 0')
            return
        }
        const existing = vsrg.getHitObjectsAt(timestamp, key)
        const firstNote = existing.find(h => h !== null)
        if (type === ClickType.Unknown) console.warn('unknown click type')
        // if wants to add a tap note
        if (selectedType === 'tap' && type === ClickType.Left) {
            if (firstNote) {
                selectedHitObject = firstNote
                refreshVsrg()
                return
            }
            const hitObject = vsrg.createHitObjectInTrack(selectedTrack, timestamp, key)
            playHitObject(hitObject, selectedTrack)
            selectedHitObject = hitObject
        }
        // if wants to add a hold note
        if (selectedType === 'hold' && type === ClickType.Left) {
            if (lastCreatedHitObject !== null) {
                vsrg.setHeldHitObjectTail(selectedTrack, lastCreatedHitObject, timestamp - lastCreatedHitObject.timestamp)
                lastCreatedHitObject = null
                selectedHitObject = null
            } else {
                if (firstNote) {
                    selectedHitObject = firstNote
                    refreshVsrg()
                    return
                }
                const newLastCreatedHitObject = vsrg.createHeldHitObject(selectedTrack, timestamp, key)
                lastCreatedHitObject = newLastCreatedHitObject
                selectedHitObject = newLastCreatedHitObject
            }
        }
        // if wants to remove a note
        if (selectedType === 'delete' || type === ClickType.Right) {
            vsrg.removeHitObjectInTrackAtTimestamp(selectedTrack, timestamp, key)
            selectedHitObject = null
        }
        refreshVsrg()
    }

    function selectTrack(newSelectedTrack: number) {
        selectedTrack = newSelectedTrack
    }

    function setAudioSong(song: SerializedSong | null) {
        changes++
        if (song === null) {
            vsrg.setAudioSong(null)
            audioSong = null
            renderableNotes = []
            return
        }
        const parsed = songService.parseSong(song)
        if (parsed instanceof RecordedSong) {
            // REQUIRED ADAPTATION (beyond old's own `this.setState({audioSong, renderableNotes})`,
            // which omits `vsrg`): `vsrg.setAudioSong(parsed)` (below) reassigns
            // `vsrg.trackModifiers` to a brand-new array whenever a DIFFERENT background song is
            // picked - `VsrgComposerMenu`'s own `data.trackModifiers` prop reads that field directly
            // in its template, which needs `vsrg` itself refreshed to pick it up (see this file's own
            // header comment "REQUIRED ADAPTATION, LOAD-BEARING" for the general mechanism). Old
            // never needed this because ANY `setState` call - even one that omits `vsrg` - forced
            // React to re-render the WHOLE tree, so `VsrgMenu`'s own `trackModifiers={vsrg
            // .trackModifiers}` prop read the CURRENT (just-mutated) value regardless.
            vsrg.setAudioSong(parsed)
            parsed.startPlayback(lastTimestamp)
            vsrg.setDurationFromNotes(parsed.notes)
            renderableNotes = vsrg.getRenderableNotes(parsed)
            audioSong = parsed
            refreshVsrg()
            syncAudioSongInstruments()
            calculateSnapPoints()
        }
        if (parsed instanceof ComposedSong) {
            const recorded = parsed.toRecordedSong(0)
            vsrg.setDurationFromNotes(recorded.notes)
            recorded.startPlayback(lastTimestamp)
            vsrg.setAudioSong(parsed) //set as composed song because it's the original song
            renderableNotes = vsrg.getRenderableNotes(recorded)
            audioSong = recorded
            refreshVsrg()
            syncAudioSongInstruments()
            calculateSnapPoints()
        }
    }

    async function askForSongUpdate() {
        return await asyncConfirm(t('question:unsaved_song_save', {song_name: vsrg.name}), true)
    }

    async function createNewSong() {
        if (vsrg.name !== 'Untitled' && changes > 0) {
            const promptResult = await askForSongUpdate()
            if (promptResult === null) return
            if (promptResult) {
                await saveSong()
            }
        }
        const name = await asyncPrompt(t('question:enter_song_name'))
        if (name) {
            const newVsrg = new VsrgSong(name)
            newVsrg.set({
                bpm: settings.bpm.value,
                keys: settings.keys.value,
                pitch: settings.pitch.value,
                snapPoint,
            })
            newVsrg.addTrack()
            const id = await songsStore.addSong(newVsrg)
            newVsrg.set({id})
            vsrg = newVsrg
            renderableNotes = []
            vsrgComposerStore.emitEvent('songLoad')
            calculateSnapPoints()
            syncInstruments()
        }
    }

    function calculateSnapPoints() {
        const amount = vsrg.duration / (60000 / vsrg.bpm) * snapPoint
        const newSnapPointDuration = vsrg.duration / amount
        snapPoints = new Array(Math.floor(amount)).fill(0).map((_, i) => i * newSnapPointDuration)
        snapPointDuration = newSnapPointDuration
    }

    function dragHitObject(newTimestamp: number, key?: number) {
        if (selectedHitObject === null) return
        selectedHitObject.timestamp = newTimestamp
        if (key !== undefined && key < settings.keys.value) selectedHitObject.index = key
        refreshVsrg()
    }

    function findClosestSnapPoint(timestamp: number) {
        return snapPoints.reduce((prev, curr) => {
            if (Math.abs(curr - timestamp) < Math.abs(prev - timestamp)) return curr
            return prev
        })
    }

    function releaseHitObject() {
        if (selectedHitObject === null) return
        selectedHitObject.timestamp = findClosestSnapPoint(selectedHitObject.timestamp)
        const tracks = vsrg.getHitObjectsBetween(selectedHitObject.timestamp, selectedHitObject.timestamp + selectedHitObject.holdDuration, selectedHitObject.index)
        tracks.forEach((track, i) => track.forEach(h => h !== selectedHitObject && vsrg.removeHitObjectInTrackAtTimestamp(i, h.timestamp, h.index)))
        changes++
        refreshVsrg()
    }

    function onTrackChange(track: VsrgTrack, index: number) {
        vsrg.tracks[index] = track
        refreshVsrg()
        syncInstruments()
    }

    function onNoteSelect(note: number) {
        selectedHitObject?.toggleNote(note)
        audioPlayer.playNoteOfInstrument(selectedTrack, note)
        // old's own `this.setState({selectedHitObject})` re-passes the SAME reference (mutated in
        // place by `.toggleNote()` above) - any React setState still forces a re-render there. Here,
        // `selectedHitObject` needs a genuinely NEW reference for Svelte to notice: `VsrgHitObject`'s
        // own (cheap - a handful of primitive fields, no track/instrument data) `.clone()` gives one,
        // reflecting the just-toggled `.notes` array in both the canvas AND VsrgTop's own
        // `VsrgComposerKeyboard` `selected` prop.
        if (selectedHitObject) selectedHitObject = selectedHitObject.clone()
    }

    function togglePlay() {
        vsrg.startPlayback(lastTimestamp)
        if (lastTimestamp >= vsrg.duration) {
            isPlaying = false
            return
        }
        if (audioSong) audioSong.startPlayback(lastTimestamp)
        isPlaying = !isPlaying
    }

    function playHitObject(hitObject: VsrgHitObject, trackIndex: number) {
        audioPlayer.playNotesOfInstrument(trackIndex, hitObject.notes)
    }

    function onTimestampChange(timestamp: number) {
        lastTimestamp = timestamp
        if (isPlaying) {
            if (lastTimestamp >= vsrg.duration) {
                isPlaying = false
                return
            }
            heldKeys.forEach((key, i) => {
                if (key) {
                    const hitObject = pressedDownHitObjects[i]
                    if (!hitObject) return
                    const diff = timestamp - hitObject.timestamp
                    if (diff > snapPointDuration) {
                        hitObject.holdDuration = diff
                        hitObject.isHeld = true
                    }
                }
            })
            if (audioSong) {
                const notes = audioSong.tickPlayback(timestamp)
                notes.forEach(n => {
                    const layers = n.layer.toArray()
                    layers.forEach((l, i) => {
                        if (l === 0 || vsrg.trackModifiers[i].muted) return
                        audioPlaybackPlayer.playNoteOfInstrument(i, n.index)
                    })
                })
            }
            const tracks = vsrg.tickPlayback(timestamp)
            tracks.forEach((track, index) => track.forEach(hitObject => playHitObject(hitObject, index)))
        }
    }

    async function deleteTrack(index: number) {
        if (vsrg.tracks.length === 1) {
            logger.error(t('vsrg_composer:cannot_delete_last_track'))
            return
        }
        const confirm = await asyncConfirm(t('vsrg_composer:delete_track_question'))
        if (!confirm || !mounted) return
        changes++
        vsrg.deleteTrack(index)
        selectedTrack = Math.max(0, index - 1)
        refreshVsrg()
        vsrgComposerStore.emitEvent('tracksChange')
    }

    async function onSongOpen(song: VsrgSong) {
        if (changes !== 0) {
            let confirm = settings.autosave.value && vsrg.name !== 'Untitled'
            if (!confirm) {
                const promptResult = await asyncConfirm(t('question:unsaved_song_save', {song_name: vsrg.name}), true)
                if (promptResult === null) return
                confirm = promptResult
            }
            if (confirm) {
                if (await saveSong() === null) return
            }
        }
        settings.bpm = {...settings.bpm, value: song.bpm}
        settings.keys = {...settings.keys, value: song.keys}
        settings.pitch = {...settings.pitch, value: song.pitch}
        updateSettings()
        changes++
        vsrg = song
        snapPoint = song.snapPoint
        selectedTrack = 0
        selectedHitObject = null
        lastCreatedHitObject = null
        vsrgComposerStore.emitEvent('songLoad')
        syncInstruments()
        const loadedAudioSong = await songsStore.getSongById(song.audioSongId)
        setAudioSong(loadedAudioSong)
        calculateSnapPoints()
    }

    function addTime() {
        vsrg.duration += 1000
        calculateSnapPoints()
        changes++
        refreshVsrg()
    }

    function removeTime() {
        vsrg.duration -= 1000
        calculateSnapPoints()
        changes++
        refreshVsrg()
    }

    function onScalingChange(newScaling: number) {
        scaling = newScaling
        vsrgComposerStore.emitEvent('scaleChange')
    }

    async function saveSong() {
        const name = vsrg.id !== null ? vsrg.name : await asyncPrompt(t('question:enter_song_name'))
        if (name === null) return null
        vsrg.set({name})
        if (vsrg.id === null) {
            const id = await songsStore.addSong(vsrg)
            vsrg.set({id})
        } else {
            songsStore.updateSong(vsrg)
        }
        changes = 0
        refreshVsrg()
        return vsrg
    }

    function onTrackModifierChange(trackModifier: VsrgTrackModifier, index: number, recalculate: boolean) {
        vsrg.trackModifiers[index] = trackModifier
        vsrg.trackModifiers = [...vsrg.trackModifiers]
        changes++
        if (recalculate && audioSong) {
            renderableNotes = vsrg.getRenderableNotes(audioSong)
            refreshVsrg()
            return
        }
        refreshVsrg()
    }

    function onTempoChangerChange(newTempoChanger: number) {
        tempoChanger = newTempoChanger
    }

    function selectType(newSelectedType: VsrgHitObjectType) {
        selectedType = newSelectedType
        lastCreatedHitObject = null
    }

    function onBreakpointChange(remove: boolean) {
        const timestamp = findClosestSnapPoint(lastTimestamp)
        vsrg.setBreakpoint(timestamp, !remove)
        refreshVsrg()
    }

    function onBreakpointSelect(direction: -1 | 1) {
        const breakpoint = vsrg.getClosestBreakpoint(lastTimestamp, direction)
        if (isPlaying) {
            audioSong?.startPlayback(breakpoint)
            vsrg.startPlayback(breakpoint)
        }
        vsrgComposerStore.emitEvent('timestampChange', breakpoint)
    }
</script>

<PageMetadata
    text={`${t('home:vsrg_composer_name')} - ${vsrg.name ?? 'Unnamed'}`}
    description="Create new VSRG songs using existing background songs and create your own beatmap for it."
/>
<VsrgComposerMenu
    data={{
        settings,
        hasChanges: changes > 0,
        audioSong,
        trackModifiers: vsrg.trackModifiers,
    }}
    functions={{
        setAudioSong,
        handleSettingChange,
        onSave: saveSong,
        onSongOpen,
        onCreateSong: createNewSong,
        onTrackModifierChange,
    }}
/>
<div class="vsrg-page appear-on-mount">
    <VsrgTop
        vsrg={vsrg}
        onBreakpointSelect={onBreakpointSelect}
        onBreakpointChange={onBreakpointChange}
        selectedHitObject={selectedHitObject}
        isHorizontal={!settings.isVertical.value}
        selectedTrack={selectedTrack}
        lastCreatedHitObject={lastCreatedHitObject}
        onTrackAdd={addTrack}
        onTrackChange={onTrackChange}
        onTrackDelete={deleteTrack}
        onTrackSelect={selectTrack}
        onNoteSelect={onNoteSelect}
    >
        <DecoratedCard className="decorated-vsrg-canvas" size="1.2rem">
            <VsrgComposerCanvas
                vsrg={vsrg}
                renderableNotes={renderableNotes}
                onTimestampChange={onTimestampChange}
                selectedHitObject={selectedHitObject}
                isHorizontal={!settings.isVertical.value}
                tempoChanger={tempoChanger}
                scrollSnap={settings.scrollSnap.value}
                maxFps={settings.maxFps.value}
                scaling={scaling}
                audioSong={audioSong}
                snapPoint={snapPoint}
                snapPoints={snapPoints}
                isPlaying={isPlaying}
                onRemoveTime={removeTime}
                onAddTime={addTime}
                onKeyDown={startHitObjectTap}
                onKeyUp={endHitObjectTap}
                dragHitObject={dragHitObject}
                releaseHitObject={releaseHitObject}
                selectHitObject={selectHitObject}
                onSnapPointSelect={onSnapPointSelect}
            />
        </DecoratedCard>
    </VsrgTop>
    <VsrgBottom
        vsrg={vsrg}
        scaling={scaling}
        tempoChanger={tempoChanger}
        onTempoChangerChange={onTempoChangerChange}
        onScalingChange={onScalingChange}
        isPlaying={isPlaying}
        togglePlay={togglePlay}
        selectedSnapPoint={snapPoint}
        onSnapPointChange={onSnapPointChange}
        selectedHitObjectType={selectedType}
        onHitObjectTypeChange={selectType}
    />
</div>
