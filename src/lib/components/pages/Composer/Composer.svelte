<script lang="ts">
    import {onMount} from 'svelte'
    import {goto} from '$app/navigation'
    import {resolve} from '$app/paths'
    import {game} from '$game'
    import {APP_NAME} from '$core/legacyConfig'
    import type {Pitch} from '$lib/games/types'
    import {t} from '$i18n/binding.svelte'
    import {i18n} from '$i18n/i18n'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import MidiParser from './MidiParser/MidiParser.svelte'
    import ComposerTools from './ComposerTools.svelte'
    import ComposerKeyboard from './ComposerKeyboard.svelte'
    import ComposerCanvas from './ComposerCanvas.svelte'
    import ComposerMenu from './ComposerMenu.svelte'
    import CanvasTool from './CanvasTool.svelte'
    import InstrumentControls from './InstrumentControls.svelte'
    import {Instrument, type ObservableNote} from '$lib/audio/Instrument.svelte'
    import AudioRecorder from '$lib/audio/AudioRecorder'
    import Analytics from '$core/Analytics'
    import {homeStore} from '$stores/HomeStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {ComposedSong, type UnknownSerializedComposedSong} from '$core/Songs/ComposedSong'
    import {RecordedSong, type SerializedRecordedSong} from '$core/Songs/RecordedSong'
    import {VsrgSong} from '$core/Songs/VsrgSong'
    import {Song, type SerializedSong} from '$core/Songs/Song'
    import {NoteLayer} from '$core/Songs/Layer'
    import type {InstrumentData, NoteColumn} from '$core/Songs/SongClasses'
    import type {SettingUpdate, SettingVolumeUpdate} from '$core/types/SettingsPropriety'
    import type {ComposerSettingsDataType} from '$core/BaseSettings'
    import {MIDIProvider, type MIDIEvent} from '$lib/providers/MIDIProvider'
    import {KeyboardProvider} from '$lib/providers/KeyboardProvider'
    import type {KeyboardNumber} from '$lib/providers/KeyboardProvider/KeyboardTypes'
    import {AudioProvider} from '$lib/providers/AudioProvider'
    import {settingsService} from '$core/Services/SettingsService'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {songService} from '$core/Services/SongService'
    import {fileService} from '$core/Services/FileService'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {asyncConfirm, asyncPrompt} from '$stores/AsyncPromptStore.svelte'
    import {createKeyboardListener, createShortcutListener, type ShortcutListener} from '$stores/KeybindsStore.svelte'
    import {registerLeaveHandler} from '$stores/navigationGuard.svelte'
    import {calculateSongLength, delay, formatMs} from '$core/utils/Utilities'

    // Old: src/app/_client-pages/composer/index.tsx (991 lines) - the `Composer` class component
    // (the whole page's implementation) plus its thin default-export wrapper function
    // `ComposerPage` (searchParams -> songId/showMidi, useSetPageVisited, then
    // `<Composer .../>`). Per this task's brief, the split is KEPT (not collapsed the way
    // Player.svelte collapsed its own old wrapper): this file is the class-equivalent
    // (`songId`/`showMidi`/`inPreview` props, everything else below), and
    // `src/routes/composer/+page.svelte` is the thin wrapper (searchParams read +
    // `setPageVisited('composer')` + `<AppBackground page="Composer">`) - see that file's own
    // header comment. `navigation`/`registerLeaveHandler`/`t` prop-threading is dropped exactly
    // like every other Phase-4 page: `registerLeaveHandler` is imported directly
    // (`$stores/navigationGuard.svelte`, P4c Task 2), `t()` is the reactive i18n binding, and
    // `goto`/`resolve` (`$app/navigation`/`$app/paths`) replace the old React-Router-shaped
    // `navigation.push`.
    //
    // `theme: Theme` (old's constructor: `theme: ThemeProvider`) is DROPPED entirely - it is
    // never read anywhere in old's own `render()` or any other method (verified against the raw
    // blob); every descendant that actually needs theming (`ComposerCanvas.svelte`/
    // `ComposerKeyboard.svelte`/`InstrumentControls.svelte`/etc.) already imports `ThemeProvider`
    // directly, the established Phase-4 convention. A pure vestigial field, not ported.
    //
    // Two-tier (UI file, reads `$game` directly): old's `INSTRUMENTS[0]`/`INSTRUMENTS[1]` ->
    // `game.instruments.list[0]`/`[1]`, the same substitution Player.svelte/MidiSetup.svelte/
    // ZenKeyboardMenu.svelte already established. `TEMPO_CHANGERS`/`TempoChanger` ->
    // `game.composer.tempoChangers` / `(typeof game.composer.tempoChangers)[number]`, matching
    // this same directory's own `ComposerCache.ts` (P4c Task 1) and `ComposerKeyboard.svelte`
    // (P4c Task 4) precedent. `APP_NAME === 'Sky'` (old's `downloadSong`) ->
    // `game.features.downloadsSongsInOldFormat`, the substitution already established at
    // PlayerMenu.svelte's own `downloadSong`/`error/+page.svelte`'s `downloadSong`. `APP_NAME`
    // itself (the BroadcastChannel name, the download filename extension) stays a direct
    // `$core/legacyConfig` import - on the UI-tier identity allowlist.
    //
    // REQUIRED RENAMES (parameter/local shadowing a same-named outer `$state` field - old always
    // disambiguated via `this.state.X` vs a bare local/parameter of the identical name, which has
    // no equivalent disambiguator once the `this.state.` prefix is gone; same class of rename
    // already established by Player.svelte's `audioRecording`/PlayerKeyboard.svelte's
    // `approachingNotesRow`): `loadSong`'s `song` param -> `songToLoad`; `addSong`'s `song` param
    // -> `songToAdd`; `updateSong`'s `song` param -> `songToSave` (every real call site happens to
    // pass the same `song` reference, but old still threads it as a parameter - kept that way,
    // byte-parity, not simplified to a zero-arg function); `syncInstruments`'s `song?` param ->
    // `songToSync`; `downloadSong`'s `song` param -> `songToDownload` (this one genuinely differs
    // from the open `song` per-call, per its own `songToDownload.id === song.id` check);
    // `createNewSong`'s local `const song = new ComposedSong(...)` -> `newSong`; `init`'s
    // `settings` param -> `loadedSettings`; `changeLayer`'s `layer` param -> `newLayer`;
    // `changeVolume`'s locally-computed `layer` -> `layerIndex`; `playSound`/`selectColumn`'s own
    // `layer`/`delay` PARAMETERS are kept byte-identical to old (old itself shadows the
    // module-level `delay` utility import with a same-named parameter there too, and a plain
    // function parameter shadowing an outer binding is ordinary, hazard-free JS scoping - not the
    // same "assign X to X" self-reference risk `changeLayer`'s rename avoids); `copyColumns`/
    // `eraseColumns`'s `layer` param -> `targetLayer` (the callback TYPE names on
    // ComposerTools.svelte still say `layer`/parameter names are cosmetic in TS, no mismatch).
    //
    // PROMISE-WRAPPER FLATTENING (established `this.setState({field}, callback)` -> direct
    // assignment + inlined callback precedent, Player.svelte's own header comment): `togglePlay`/
    // `addColumns` drop their `new Promise(resolve => {...})` wrappers entirely (the function body
    // is already `async`/returns synchronously-enough that a bare `return`/fall-through gives the
    // identical resolved-Promise-timing contract to callers, none of whom rely on more than
    // "awaiting this settles when the work is done"). `updateSong`'s `else` branch specifically
    // used `new Promise(async resolve => {...})` - an async Promise executor, flagged by
    // `eslint:recommended`'s `no-async-promise-executor` rule (this project's
    // `js.configs.recommended`), which would fail the lint gate verbatim - REQUIRED to flatten,
    // not a style choice; the exact fire-and-forget-recursive-call-then-fall-through-to-`return
    // true` control flow (the "doesn't exist, rename to Untitled, recurse without awaiting, still
    // resolve true for THIS call" branch) is preserved precisely.
    //
    // REQUIRED ADAPTATION, LOAD-BEARING (a real bug caught + fixed via live testing, not a style
    // choice): `ComposedSong`/`NoteColumn`/etc. live in `src/lib/core/` and MUST stay
    // framework-agnostic (byte-verbatim old-model ports, zero runes, per the whole migration's
    // two-tier architecture) - their mutating methods (`addColumns`/`removeColumns`/
    // `toggleBreakpoint`/`deleteColumns`/etc.) are all arrow-function CLASS FIELDS, lexically bound
    // to whichever instance was alive when their constructor ran. Svelte 5's `$state()` runtime
    // proxy (`node_modules/svelte/src/internal/client/proxy.js`, `proxy()`) explicitly REFUSES to
    // deep-wrap any value whose prototype isn't `Object.prototype`/`Array.prototype` - a class
    // instance is stored by bare reference, completely unproxied. `PlayerStore.svelte.ts`'s own
    // header comment already documents this exact limitation for its `state.song` field, but
    // Player only ever REPLACES the whole song reference (`play`/`practice`/etc.) and never needs
    // fine-grained reactivity to a CONTINUOUSLY MUTATED song the way the composer does - old's own
    // `this.setState({song})` after nearly every mutating call is a React "please re-render, ANY
    // state object reference is enough for a class component" nudge that has NO working Svelte
    // equivalent via a plain in-place mutation (confirmed by live testing: clicking a note, adding
    // columns, etc. mutated the underlying `ComposedSong` data correctly but the DOM never updated,
    // since `song`'s own top-level signal never received a new value). The fix, applied at every
    // point old called `this.setState({song, ...})` after a mutation (NOT at points old omitted
    // it, e.g. `copyColumns`, which is a pure read/return): `refreshSong()` below, which does
    // `song = song.clone()` - `.clone()` (already used by `addToHistory`'s undo-snapshot, a
    // pre-existing, tested method every Song class implements) constructs a genuinely NEW instance
    // via `new ComposedSong(...)`, re-running its constructor and re-binding every arrow-function
    // field to the FRESH instance, which is both a real new top-level reference (satisfying
    // Svelte's signal equality check) and internally self-consistent for any further mutations
    // performed on it. This is a per-user-action cost (a redundant clone of ~100+ typically-small
    // objects), not a per-frame one, with one disclosed exception: `selectColumn` runs on every
    // playback tick, so playback pays one clone per beat - acceptable for realistic song sizes,
    // flagged here as a known trade-off rather than silently accepted. `undo`'s OWN extra
    // 100ms-delayed, mount-guarded EMPTY `setState({})` (comment: "not sure why this is needed but
    // it doesn't render") is UNRELATED to this fix (it's a SECOND, separate nudge on top of undo's
    // own already-real `this.setState({..., song})`, which DOES get its `refreshSong()` below) -
    // that second, mysterious empty nudge has no Svelte-reactivity analogue and is dropped in full,
    // not reinstated, per the same reasoning as before.
    //
    // `layers` (an ARRAY of `Instrument` instances) does NOT need this treatment: `Array.prototype`
    // passes the proxy's prototype check, so `$state([...])` deep-wraps the ARRAY itself correctly
    // (index writes/`splice`/reassignment are all already reactive, the established convention);
    // only bare (non-Array/Object) CLASS INSTANCES stored directly in `$state()` are affected.
    //
    // REAL PRESERVED INCONSISTENCY (flag, not fixed): old's `handleShortcut`'s `toggle_play`
    // branch broadcasts `this.broadcastChannel?.postMessage?.(isPlaying ? 'play' : 'stop')`, while
    // the play/pause `AppButton`'s own `onClick` in `render()` broadcasts the OPPOSITE ternary
    // order, `isPlaying ? 'stop' : 'play'` - two different code paths for the identical
    // "toggle playback + notify other tabs" gesture, each sending the stale (pre-toggle)
    // `isPlaying`'s OPPOSITE meaning. Verified directly against the raw blob (not a transcription
    // slip) - reproduced byte-for-byte below via two SEPARATE `wasPlaying`-captures (frozen at the
    // top of `handleShortcut`/inside the `onclick` closure respectively, matching old's own
    // per-call-site capture timing), not unified. This capture is itself a REQUIRED adaptation:
    // Svelte's `togglePlay` reassigns `isPlaying` SYNCHRONOUSLY as its first statement (before its
    // first `await`), so a live (non-frozen) read of `isPlaying` on the line AFTER calling
    // `togglePlay()` would observe the NEW value, not old's own frozen-at-destructure-time value -
    // capturing `wasPlaying` before calling `togglePlay()` is what actually reproduces old's
    // observed (React-batching-driven) behavior here, not a stylistic embellishment.
    //
    // REAL PRESERVED QUIRK: `removeInstrument`'s confirm-dialog interpolates ``i18n.t('instruments.'
    // + song.instruments[index].name)`` - a literal DOT, not the `:` namespace separator every
    // other instrument-label lookup in this codebase uses (e.g. `PitchSelect.svelte`'s
    // `t('instruments:'+ins)`) - the SAME pre-existing typo already flagged on
    // `zen-keyboard/+page.svelte`'s loading-pill text. Reproduced byte-for-byte (i18next resolves
    // it as a literal default-namespace key, not the `instruments` namespace), not corrected.
    //
    // REAL PRESERVED DEAD CODE (flag, not fixed): `changeVolume` (keyed `obj.key.split("layer")[1]`)
    // is unreachable in old too - `ComposerSettingsDataType`/`ComposerSettings.data` (both this
    // migration's port and the true old `src/lib/BaseSettings.ts`, diffed directly) declare
    // exactly `bpm`/`beatMarks`/`noteNameType`/`pitch`/`columnsPerCanvas`/`reverb`/`autosave`/
    // `syncTabs`/`useKeyboardSideButtons`/`lookaheadTime` - no `type: "instrument"`/`layerN` field
    // anything ever emits a `SettingVolumeUpdate` with a `layerN`-shaped key through
    // `ComposerMenu`'s `SettingsPane`. Ported verbatim anyway (the brief names it explicitly, and
    // it's harmless, never-invoked code both before and after this port).
    //
    // `changePage`'s ComposerMenu-side contract is `(page: string) => void` (a general runtime
    // string, only ever called with the literal `'theme'` today) - `resolve()` requires a
    // compile-time-literal route id, so a dynamic `` `/${page}` `` needs the same `as any` escape
    // hatch `AppLink.svelte`'s own `resolve(href as any)` already uses for the identical
    // "generic wrapper around an overloaded, literal-keyed function" situation (see that file's
    // header comment) - not a new pattern.
    //
    // Render: `Memoized`/`MemoizedIcon` dropped (Svelte 5 fine-grained reactivity, established
    // precedent); old's keyed `<ComposerCanvas key={settings.columnsPerCanvas.value}/>` (forcing a
    // full unmount+reconstruct on that ONE setting changing) -> `{#key settings.columnsPerCanvas
    // .value}` wrapping the call site, per `ComposerCanvas.svelte`'s own header comment. The four
    // `CanvasTool` icons (`AddColumn`/`RemoveColumn` - old local, non-react-icons SVG components;
    // `FaPlus`/`FaTools` - react-icons/fa, fetched fresh from unpkg.com/react-icons@5.6.0/fa/index
    // .mjs, byte-verified path data) are supplied here per `CanvasTool.svelte`'s own header comment
    // ("Task 6 supplies the icon snippets"). `FaPlay`/`FaPause` (the play/pause button) are the
    // same react-icons/fa source; old's `key='pause'`/`key='play'` React-list-reconciliation hints
    // have no DOM/Svelte equivalent, dropped.
    let {
        songId = null,
        showMidi = false,
        inPreview = false,
    }: {
        songId?: string | null
        showMidi?: boolean
        inPreview?: boolean
    } = $props()

    let settings: ComposerSettingsDataType = $state(settingsService.getDefaultComposerSettings())
    let layers: Instrument[] = $state([new Instrument(game.instruments.list[1])]) //TODO not sure if this is the best idea
    //it doesnt change the instrument because it is the same as the one in the base song
    let song: ComposedSong = $state(new ComposedSong('Untitled', [game.instruments.list[0], game.instruments.list[0], game.instruments.list[0]]))
    // Old: `this.state.song.bpm = settings.bpm.value` runs ONCE inside the constructor, a
    // deliberate one-time seed (matching old's constructor-only timing exactly) - it must NOT
    // become reactive to later `settings.bpm` edits (which mutate the SONG's own bpm through
    // `handleSettingChange`'s `songSetting` branch instead, a completely different code path).
    // svelte-ignore state_referenced_locally
    song.bpm = settings.bpm.value
    let layer = $state(0)
    let selectedColumns: number[] = $state([])
    let undoHistory: NoteColumn[][] = $state([])
    let copiedColumns: NoteColumn[] = $state([])
    let isToolsVisible = $state(false)
    // Old: `isMidiVisible: this.props.showMidi || false` is also a one-time constructor seed -
    // this page's own `showMidi` prop is only ever consulted at mount (matching old exactly;
    // later prop changes, which never happen in practice since callers don't reactively vary it,
    // are correctly not tracked here either).
    // svelte-ignore state_referenced_locally
    let isMidiVisible = $state(showMidi || false)
    let isRecordingAudio = $state(false)
    let isPlaying = $state(false)
    let changes = $state(0)

    let broadcastChannel: BroadcastChannel | null = null
    let mounted = false
    let cleanup: (() => void)[] = []

    const currentInstrument = $derived(layers[layer])
    const songLength = $derived(calculateSongLength(song.columns, settings.bpm.value, song.selected))

    // See the header comment's "REQUIRED ADAPTATION, LOAD-BEARING" note - called at every point
    // old called `this.setState({song, ...})` after a mutation, so template/child-prop reads of
    // `song`'s fields (columns/selected/instruments/name/breakpoints/...) reactively update.
    function refreshSong() {
        song = song.clone()
    }

    onMount(() => {
        mounted = true
        const loadedSettings = settingsService.getComposerSettings()
        const shortcutListener = createShortcutListener('composer', 'composer_shortcuts', handleShortcut)
        const shortcutKeyboardListener = createKeyboardListener('composer_shortcuts_keyboard', handleKeyboardShortcut)
        cleanup.push(shortcutKeyboardListener, shortcutListener)
        settings = loadedSettings
        init(loadedSettings)
        broadcastChannel = window.BroadcastChannel ? new BroadcastChannel(APP_NAME + '_composer') : null
        if (broadcastChannel) {
            broadcastChannel.addEventListener('message', (event) => {
                if (!settings.syncTabs.value) return
                if (!['play', 'stop'].includes(event?.data)) return
                togglePlay(event.data === 'play')
            })
        }
        cleanup.push(registerLeaveHandler(prepareToLeave))
        if (window.location.hostname !== 'localhost') {
            window.addEventListener('beforeunload', handleUnload)
        }
        return () => {
            mounted = false
            AudioProvider.clear()
            layers.forEach(instrument => instrument.dispose())
            broadcastChannel?.close?.()
            isPlaying = false
            cleanup.forEach(dispose => dispose())
            KeyboardProvider.unregisterById('composer')
            MIDIProvider.removeListener(handleMidi)
            if (AudioProvider.isRecording) AudioProvider.stopRecording()
            if (window.location.hostname !== 'localhost') {
                window.removeEventListener('beforeunload', handleUnload)
            }
        }
    })

    async function init(loadedSettings: ComposerSettingsDataType) {
        await syncInstruments()
        AudioProvider.setReverb(loadedSettings.reverb.value)
        MIDIProvider.addListener(handleMidi)
        game.composer.tempoChangers.forEach((tempoChanger, i) => {
            KeyboardProvider.registerNumber((i + 1) as KeyboardNumber, () => handleTempoChanger(tempoChanger), {id: 'composer_keyboard'})
        })
        try {
            if (!songId) return
            const loadedSong = await songService.getSongById(songId)
            if (!loadedSong) return
            loadSong(loadedSong)
        } catch (e) {
            console.error('Error loading song')
            console.error(e)
        }
    }

    const handleKeyboardShortcut: ShortcutListener<'keyboard'> = ({shortcut, event}) => {
        if (event.repeat) return
        const shouldEditKeyboard = isPlaying || event.shiftKey
        if (shouldEditKeyboard) {
            const note = currentInstrument.getNoteFromCode(shortcut.name)
            if (note !== null) handleClick(note)
        }
    }

    const handleShortcut: ShortcutListener<'composer'> = ({shortcut, event}) => {
        const wasPlaying = isPlaying
        const {name} = shortcut
        if (name === 'next_column' && !wasPlaying) selectColumn(song.selected + 1)
        if (name === 'previous_column' && !wasPlaying) selectColumn(song.selected - 1)
        if (name === 'remove_column' && !wasPlaying) removeColumns(1, song.selected)
        if (name === 'add_column' && !wasPlaying) addColumns(1, song.selected)
        if (name === 'previous_layer') {
            const previousLayer = layer - 1
            if (previousLayer >= 0) changeLayer(previousLayer)
        }
        if (name === 'next_layer') {
            const nextLayer = layer + 1
            if (nextLayer < layers.length) changeLayer(nextLayer)
        }
        if (name === 'toggle_play') {
            if (event.repeat) return
            // old: bare `//@ts-ignore` x2 on `event.target?.tagName`/`event.target?.blur()`
            // (`event.target` is the generic `EventTarget`, lacking DOM-element members) -
            // `event.target as HTMLElement | null` avoids the suppression comment entirely,
            // matching InstrumentControls.svelte's established `e.currentTarget as HTMLElement`
            // precedent for the identical situation.
            if ((event.target as HTMLElement | null)?.tagName === 'BUTTON') {
                (event.target as HTMLElement | null)?.blur()
            }
            event.preventDefault()
            togglePlay()
            if (settings.syncTabs.value) {
                broadcastChannel?.postMessage?.(wasPlaying ? 'play' : 'stop')
            }
        }
    }

    function handleUnload(event: BeforeUnloadEvent) {
        event.preventDefault()
        event.returnValue = ''
    }

    function handleAutoSave() {
        changes++
        if (changes > 5 && settings.autosave.value) {
            //TODO maybe add here that songs which arent saved dont get autosaved
            if (song.name !== 'Untitled') {
                updateSong(song)
            }
        }
    }

    function handleMidi([eventType, note, velocity]: MIDIEvent) {
        if (!mounted) return
        if (MIDIProvider.isDown(eventType) && velocity !== 0) {
            const keyboardNotes = MIDIProvider.getNotesOfMIDIevent(note)
            keyboardNotes.forEach(keyboardNote => {
                handleClick(currentInstrument.notes[keyboardNote.index])
            })
            const shortcut = MIDIProvider.settings.shortcuts.find(e => e.midi === note)
            if (!shortcut) return
            switch (shortcut.type) {
                case 'toggle_play':
                    togglePlay()
                    break
                case 'next_column':
                    selectColumn(song.selected + 1)
                    break
                case 'previous_column':
                    selectColumn(song.selected - 1)
                    break
                case 'add_column':
                    addColumns(1, song.selected)
                    break
                case 'remove_column':
                    removeColumns(1, song.selected)
                    break
                case 'change_layer': {
                    let nextLayer = layer + 1
                    if (nextLayer >= layers.length) nextLayer = 0
                    changeLayer(nextLayer)
                    break
                }
                default:
                    break
            }
        }
    }

    function updateSettings(override?: ComposerSettingsDataType) {
        settingsService.updateComposerSettings(override !== undefined ? override : settings)
    }

    function handleSettingChange({data, key}: SettingUpdate) {
        // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
        settings[key] = {...settings[key], value: data.value}
        if (data.songSetting) {
            // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
            song[key] = data.value
            refreshSong()
        }
        if (key === 'reverb') {
            AudioProvider.setReverb(data.value as boolean)
        }
        updateSettings()
    }

    function addInstrument() {
        const isUmaMode = globalConfigStore.get().IS_UMA_MODE
        if (song.instruments.length >= NoteLayer.MAX_LAYERS && !isUmaMode) return logger.error(t('composer:cant_add_more_than_n_layers', {max_layers: NoteLayer.MAX_LAYERS}))
        song.addInstrument(game.instruments.list[0])
        refreshSong()
        syncInstruments(song)
    }

    async function removeInstrument(index: number) {
        if (layers.length <= 1) return logger.warn(t('composer:cant_remove_all_layers'))
        const confirm = await asyncConfirm(t('composer:confirm_layer_remove', {
            layer_name: song.instruments[index].alias ?? i18n.t('instruments.' + song.instruments[index].name)
        }))
        if (confirm) {
            song.removeInstrument(index)
            syncInstruments(song)
            refreshSong()
            layer = Math.max(0, index - 1)
        }
    }

    function editInstrument(instrument: InstrumentData, index: number) {
        song.instruments[index] = instrument.clone()
        song.instruments = [...song.instruments]
        syncInstruments(song)
        refreshSong()
    }

    async function syncInstruments(songToSync?: ComposedSong) {
        if (!songToSync) songToSync = song
        //remove excess instruments
        const extraInstruments = layers.splice(songToSync.instruments.length)
        extraInstruments.forEach(ins => {
            AudioProvider.disconnect(ins.endNode)
            ins.dispose()
        })
        const promises = songToSync.instruments.map(async (ins, i) => {
            if (layers[i] === undefined) {
                //If it doesn't have a layer, create one
                const instrument = new Instrument(ins.name)
                layers[i] = instrument
                const loaded = await instrument.load(AudioProvider.getAudioContext())
                if (!loaded) logger.error(t('logs:error_loading_instrument'))
                if (!mounted) return instrument.dispose()
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            }
            if (layers[i].name === ins.name) {
                //if it has a layer and it's the same, just set the volume and reverb
                layers[i].changeVolume(ins.volume)
                AudioProvider.setReverbOfNode(layers[i].endNode, ins.reverbOverride)
                return layers[i]
            } else {
                //if it has a layer and it's different, delete the layer and create a new one
                const old = layers[i]
                AudioProvider.disconnect(old.endNode)
                old.dispose()
                const instrument = new Instrument(ins.name)
                layers[i] = instrument
                const loaded = await instrument.load(AudioProvider.getAudioContext())
                if (!loaded) logger.error(t('logs:error_loading_instrument'))
                if (!mounted) return instrument.dispose()
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            }
        })
        if (!mounted) return
        const newInstruments = (await Promise.all(promises)) as Instrument[]
        layers = newInstruments
    }

    function changeVolume(obj: SettingVolumeUpdate) {
        const layerIndex = Number(obj.key.split('layer')[1]) - 1
        // @ts-expect-error SettingUpdateKey spans all 4 settings families; narrower here by design
        settings[obj.key] = {...settings[obj.key], volume: obj.value}
        layers[layerIndex].changeVolume(obj.value)
        updateSettings()
    }

    async function startRecordingAudio(override?: boolean) {
        if (!mounted) return
        if (!override) {
            isRecordingAudio = false
            return togglePlay(false)
        }
        AudioProvider.startRecording()
        isRecordingAudio = true
        await delay(300)
        await togglePlay(true) //wait till song finishes
        //wait untill audio has finished playing
        await delay(settings.lookaheadTime.value + 1000)
        if (!mounted) return
        isRecordingAudio = false
        const recording = await AudioProvider.stopRecording()
        if (!recording) return
        const fileName = await asyncPrompt(t('question:ask_song_name_cancellable'))
        try {
            if (fileName) await AudioRecorder.downloadBlob(recording.data, fileName + '.wav')
        } catch (e) {
            console.error(e)
            logger.error(t('logs:error_downloading_audio'))
        }
    }

    function playSound(layer: number, index: number, delay?: number) {
        const instrument = layers[layer]
        const note = instrument?.notes[index]
        if (note === undefined) return
        if (song.instruments[layer].muted) return
        const pitch = song.instruments[layer].pitch || settings.pitch.value
        instrument.play(note.index, pitch, delay)
    }

    function changePitch(value: Pitch) {
        settings.pitch = {...settings.pitch, value}
        updateSettings()
    }

    function handleClick(note: ObservableNote) {
        const column = song.selectedColumn
        const index = column.getNoteIndex(note.index)
        if (index === null) { //if it doesn't exist, create a new one
            const columnNote = column.addNote(note.index)
            columnNote.setLayer(layer, true)
        } else { //if it exists, toggle the current layer and if it's 000 delete it
            const currentNote = column.notes[index]
            currentNote.toggleLayer(layer)
            if (currentNote.layer.isEmpty()) column.removeAtIndex(index)
        }
        refreshSong()
        handleAutoSave()
        playSound(layer, note.index)
    }

    async function renameSong(newName: string, id: string) {
        await songsStore.renameSong(id, newName)
        if (song.id === id) {
            song.name = newName
            refreshSong()
        }
    }

    async function addSong(songToAdd: ComposedSong | RecordedSong) {
        const id = await songsStore.addSong(songToAdd)
        songToAdd.id = id
        return songToAdd
    }

    async function updateSong(songToSave: ComposedSong): Promise<boolean> {
        //if it is the default song, ask for name and add it
        if (songToSave.name === 'Untitled') {
            const name = await asyncPrompt(t('question:ask_song_name_cancellable'))
            if (name === null || !mounted) return false
            songToSave.name = name
            changes = 0
            await addSong(songToSave)
            return true
        }
        //if it exists, update it
        const existingSong = await songService.getSongById(songToSave.id!)
        if (existingSong) {
            songToSave.folderId = existingSong.folderId
            await songsStore.updateSong(songToSave)
            console.log('song saved:', songToSave.name)
            changes = 0
        } else {
            //if it doesn't exist, add it
            if (songToSave.name.includes('- Composed')) {
                const name = await asyncPrompt(t('composer:ask_song_name_for_composed_song_version'))
                if (name === null) return false
                songToSave.name = name
                addSong(songToSave)
                return true
            }
            console.warn("song doesn't exist")
            songToSave.name = 'Untitled'
            updateSong(songToSave)
        }
        return true
    }

    async function updateThisSong() {
        updateSong(song)
    }

    async function askForSongUpdate() {
        return await asyncConfirm(t('question:unsaved_song_save', {song_name: song.name}), true)
    }

    async function createNewSong() {
        if (song.name !== 'Untitled' && changes > 0) {
            const promptResult = await askForSongUpdate()
            if (promptResult === null) return
            if (promptResult) {
                await updateSong(song)
            }
        }
        const name = await asyncPrompt(t('question:ask_song_name_cancellable'))
        if (name === null) return
        const newSong = new ComposedSong(name, [game.instruments.list[0], game.instruments.list[0], game.instruments.list[0]])
        changes = 0
        if (!mounted) return
        const added = await addSong(newSong) as ComposedSong
        if (!mounted) return
        song = added
        layer = 0
        Analytics.songEvent({type: 'create'})
    }

    async function loadSong(songToLoad: SerializedSong | ComposedSong) {
        try {
            let parsed: ComposedSong | null = null
            if (songToLoad instanceof ComposedSong) {
                //TODO not sure if i should clone the song here
                parsed = songToLoad
            } else {
                if (songToLoad.type === 'recorded') {
                    const parsedRecorded = RecordedSong.deserialize(songToLoad as SerializedRecordedSong)
                    parsedRecorded.bpm = 400
                    parsed = parsedRecorded.toComposedSong(4)
                    parsed.name += ' - Composed'
                }
                if (songToLoad.type === 'composed') {
                    parsed = ComposedSong.deserialize(songToLoad as UnknownSerializedComposedSong)
                }
            }
            if (!parsed) return
            if (changes !== 0) {
                let confirm = settings.autosave.value && song.name !== 'Untitled'
                if (!confirm && song.columns.length > 0) {
                    //TODO is there a reason why this was not cancellable before?
                    const promptResult = await asyncConfirm(t('question:unsaved_song_save', {song_name: song.name}), true)
                    if (promptResult === null) return
                    confirm = promptResult
                }
                if (confirm) {
                    await updateSong(song)
                }
            }
            settings.bpm = {...settings.bpm, value: parsed.bpm}
            settings.pitch = {...settings.pitch, value: parsed.pitch}
            settings.reverb = {...settings.reverb, value: parsed.reverb}
            AudioProvider.setReverb(parsed.reverb)
            if (!mounted) return
            if (songToLoad.id && song.id === null) {
                isMidiVisible = false
            }
            changes = 0
            console.log('song loaded')
            layer = 0
            song = parsed
            selectedColumns = []
            syncInstruments()
        } catch (e) {
            console.error(e)
            logger.error(t('logs:error_loading_song'))
        }
    }

    function addColumns(amount = 1, position: number | 'end' = 'end') {
        song.addColumns(amount, position)
        if (amount === 1) selectColumn(song.selected + 1)
        handleAutoSave()
        refreshSong()
    }

    function removeColumns(amount: number, position: number) {
        if (song.columns.length < settings.beatMarks.value * 4) return
        song.removeColumns(amount, position)
        if (song.columns.length <= song.selected) selectColumn(song.selected - 1)
        handleAutoSave()
        refreshSong()
    }

    async function togglePlay(override?: boolean): Promise<void> {
        const newState = typeof override === 'boolean' ? override : !isPlaying
        isPlaying = newState
        if (isPlaying) selectColumn(song.selected, false, settings.lookaheadTime.value / 1000)
        let delayOffset = 0
        // old: `let previousTime = Date.now()` initialized here too, but that initial value is
        // never read (the loop's own first statement always reassigns it before the one place
        // that reads it, below) - a real pre-existing useless-assignment in old, harmless there
        // (old's toolchain had no equivalent lint rule) but flagged as an error by this project's
        // `no-useless-assignment` (new tooling, not an old behavior change) - the initializer is
        // dropped, TS control-flow analysis confirms `previousTime` is always assigned before its
        // one read.
        let previousTime: number
        while (isPlaying) {
            const tempoChanger = song.selectedColumn.getTempoChanger().changer
            const msPerBeat = (60000 / settings.bpm.value * tempoChanger) + delayOffset
            previousTime = Date.now()
            await delay(Song.roundTime(msPerBeat))
            if (!isPlaying || !mounted) break
            delayOffset = previousTime + msPerBeat - Date.now()
            const lookaheadTime = settings.lookaheadTime.value / 1000
            //this schedules the next column counting for the error delay so that timing is more accurate
            handlePlaybackTick(Math.max(0, lookaheadTime + delayOffset / 1000))
        }
    }

    function handlePlaybackTick(errorDelay: number) {
        const newIndex = song.selected + 1
        if (isPlaying && newIndex > song.columns.length - 1) {
            return togglePlay(false)
        }
        selectColumn(newIndex, false, errorDelay)
    }

    function toggleBreakpoint(override?: number) {
        song.toggleBreakpoint(override)
        validateBreakpoints()
    }

    function handleTempoChanger(changer: (typeof game.composer.tempoChangers)[number]) {
        if (selectedColumns.length) {
            addToHistory()
            selectedColumns.forEach(column => {
                song.columns[column]?.setTempoChanger(changer)
            })
        } else {
            song.selectedColumn.setTempoChanger(changer)
        }
        handleAutoSave()
        refreshSong()
    }

    async function prepareToLeave(): Promise<boolean> {
        if (changes === 0) return true
        if (settings.autosave.value) return updateSong(song)
        const shouldSave = await asyncConfirm(t('question:unsaved_song_save', {song_name: song.name}), true)
        if (shouldSave === null) return false
        if (!shouldSave) return true
        return updateSong(song)
    }

    async function changePage(pageName: string) {
        if (pageName === 'Home') return homeStore.open()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see AppLink.svelte's identical resolve(href as any) note; pageName is a general runtime string, not a literal route id
        await goto(resolve(`/${pageName}` as any))
    }

    function selectColumn(index: number, ignoreAudio?: boolean, delay?: number) {
        if (index < 0 || index > song.columns.length - 1) return
        song.selected = index
        if (isToolsVisible && copiedColumns.length === 0) {
            selectedColumns.push(index)
            const min = Math.min(...selectedColumns)
            const max = Math.max(...selectedColumns)
            selectedColumns = new Array(max - min + 1).fill(0).map((_, i) => min + i)
        }
        refreshSong()
        //add a bit of delay if recording audio to imrove the recording quality
        delay = delay
            ? delay + (isRecordingAudio ? 0.5 : 0)
            : 0
        if (ignoreAudio) return
        song.selectedColumn.notes.forEach(note => {
            layers.forEach((_, i) => {
                if (note.isLayerToggled(i)) playSound(i, note.index, delay)
            })
        })
    }

    function selectColumnFromDirection(direction: number) {
        selectColumn(song.selected + direction)
    }

    function changeLayer(newLayer: number) {
        layer = newLayer
    }

    function toggleTools() {
        const wasVisible = isToolsVisible
        isToolsVisible = !wasVisible
        selectedColumns = wasVisible ? [] : [song.selected]
        copiedColumns = []
        undoHistory = []
    }

    function resetSelection() {
        copiedColumns = []
        selectedColumns = [song.selected]
    }

    function addToHistory() {
        if (!isToolsVisible) return
        undoHistory = [...undoHistory, song.clone().columns]
    }

    function undo() {
        const history = undoHistory.pop()
        if (!history) return
        song.columns = history
        song.selected = (song.columns.length > song.selected) ? song.selected : song.columns.length - 1
        refreshSong()
    }

    function copyColumns(targetLayer: number | 'all') {
        copiedColumns = song.copyColumns(selectedColumns, targetLayer)
        changes++
        selectedColumns = []
    }

    function pasteColumns(insert: boolean, targetLayer: number | 'all') {
        addToHistory()
        if (targetLayer === 'all') song.pasteColumns(copiedColumns, insert)
        else if (Number.isFinite(targetLayer)) song.pasteLayer(copiedColumns, insert, targetLayer)
        syncInstruments()
        changes++
        refreshSong()
    }

    function eraseColumns(targetLayer: number | 'all') {
        addToHistory()
        song.eraseColumns(selectedColumns, targetLayer)
        changes++
        selectedColumns = [song.selected]
        refreshSong()
    }

    function moveNotesBy(amount: number, position: number | 'all') {
        addToHistory()
        song.moveNotesBy(selectedColumns, amount, position)
        changes++
        refreshSong()
    }

    function switchLayerPosition(direction: 1 | -1) {
        const toSwap = layer + direction
        if (toSwap < 0 || toSwap > song.instruments.length - 1) return
        song.swapLayer(song.columns.length, 0, layer, toSwap)
        const tmp = song.instruments[layer]
        song.instruments[layer] = song.instruments[toSwap]
        song.instruments[toSwap] = tmp
        song.instruments = [...song.instruments]
        changes++
        syncInstruments()
        refreshSong()
        layer = toSwap
    }

    function deleteColumns() {
        addToHistory()
        song.deleteColumns(selectedColumns)
        changes++
        selectedColumns = [song.selected]
        refreshSong()
        validateBreakpoints()
    }

    function validateBreakpoints() {
        song.validateBreakpoints()
        refreshSong()
    }

    function changeMidiVisibility(visible: boolean) {
        isMidiVisible = visible
        if (visible) Analytics.songEvent({type: 'create_MIDI'})
    }

    async function downloadSong(songToDownload: SerializedSong, as: 'song' | 'midi') {
        try {
            if (songToDownload.id === song.id) {
                if (settings.autosave.value) {
                    await updateSong(song)
                    songToDownload = song.serialize()
                } else {
                    if (await asyncConfirm(t('composer:ask_download_of_current_song', {song_name: songToDownload.name}))) {
                        await updateSong(song)
                        songToDownload = song.serialize()
                    }
                }
            }
            if (as === 'song') {
                const parsed = songService.parseSong(songToDownload)
                songToDownload.data.appName = APP_NAME
                const songName = songToDownload.name
                const converted = [game.features.downloadsSongsInOldFormat && (parsed instanceof ComposedSong || parsed instanceof RecordedSong)
                    ? parsed.toOldFormat()
                    : parsed.serialize()
                ]
                fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`)
                logger.success(t('logs:song_downloaded'))
                Analytics.userSongs('download', {page: 'composer'})
            } else if (as === 'midi') {
                const agrees = await asyncConfirm(t('menu:midi_download_warning'))
                const parsed = songService.parseSong(songToDownload)
                if (parsed instanceof VsrgSong) throw new Error("Can't convert Vsrg to MIDI")
                const midi = parsed.toMidi()
                if (!agrees) return
                fileService.downloadMidi(midi)
                logger.success(t('logs:song_downloaded'))
            }
        } catch (e) {
            console.error(e)
            logger.error(t('logs:error_downloading_song'))
        }
    }
</script>

{#snippet playIcon()}
    <!-- react-icons/fa's FaPlay (unpkg.com/react-icons@5.6.0/fa/index.mjs); old passed size={18}
         + color='var(--icon-color)' via <FaPlay key='play' .../> (the `key` prop is a
         React-list-reconciliation hint with no Svelte/DOM equivalent, dropped). -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="18" width="18" xmlns="http://www.w3.org/2000/svg" style="color:var(--icon-color)"><path d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z"/></svg>
{/snippet}

{#snippet pauseIcon()}
    <!-- react-icons/fa's FaPause, same sourcing; old passed size={18} + color='var(--icon-color)'
         via <FaPause key='pause' .../>. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="18" width="18" xmlns="http://www.w3.org/2000/svg" style="color:var(--icon-color)"><path d="M144 479H48c-26.5 0-48-21.5-48-48V79c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v352c0 26.5-21.5 48-48 48zm304-48V79c0-26.5-21.5-48-48-48h-96c-26.5 0-48 21.5-48 48v352c0 26.5 21.5 48 48 48h96c26.5 0 48-21.5 48-48z"/></svg>
{/snippet}

{#snippet addColumnIcon()}
    <!-- old: src/components/shared/icons/AddColumn.tsx, a local (non-react-icons) SVG. Rendered
         via <MemoizedIcon icon={AddColumn} className={'tool-icon'}/> -> MemoizedIcon is a bare
         pass-through (dropped, established precedent), so this is just <AddColumn
         className="tool-icon"/> inlined directly, byte-verbatim geometry. -->
    <svg width="194.40327mm" height="290.853mm" viewBox="0 0 194.40327 290.85299" xmlns="http://www.w3.org/2000/svg" class="tool-icon" style="fill:currentcolor">
        <g>
            <rect width="50.962246" height="290.853" x="143.44104" y="2.4868996e-14" rx="15.05095" ry="17.061689"/>
            <path d="m 42.968955,90.42652 c -2.198688,0 -3.96875,1.770063 -3.96875,3.96875 v 35.03145 H 3.9687499 C 1.7700625,129.42672 0,131.19678 0,133.39547 v 24.0621 c 0,2.19869 1.7700625,3.96875 3.9687499,3.96875 H 39.000205 v 35.03145 c 0,2.19869 1.770062,3.96875 3.96875,3.96875 h 24.062613 c 2.198687,0 3.968749,-1.77006 3.968749,-3.96875 v -35.03145 h 35.030933 c 2.19869,0 3.96875,-1.77006 3.96875,-3.96875 v -24.0621 c 0,-2.19869 -1.77006,-3.96875 -3.96875,-3.96875 H 71.000317 V 94.39527 c 0,-2.198687 -1.770062,-3.96875 -3.968749,-3.96875 z"/>
            <rect width="7.8557625" height="1.5711526" x="57.085205" y="139.30885" rx="3.96875"/>
        </g>
    </svg>
{/snippet}

{#snippet removeColumnIcon()}
    <!-- old: src/components/shared/icons/RemoveColumn.tsx, same local-SVG treatment as
         AddColumn above; old wrapped it identically via <MemoizedIcon icon={RemoveColumn}
         className={'tool-icon'}/>. -->
    <svg width="194.40327mm" height="290.853mm" viewBox="0 0 194.40327 290.85299" xmlns="http://www.w3.org/2000/svg" class="tool-icon" style="fill:currentcolor">
        <g>
            <rect width="50.962246" height="290.853" x="143.44104" y="2.4868996e-14" rx="15.05095" ry="17.061689"/>
            <rect width="110.35661" height="35.805271" x="0" y="127.52386" rx="3.96875"/>
        </g>
    </svg>
{/snippet}

{#snippet addPageIcon()}
    <!-- react-icons/fa's FaPlus, same sourcing as playIcon above; old's <MemoizedIcon
         icon={FaPlus} size={16}/> passed no className (unlike the two local icons above), so no
         class attribute is rendered here either. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
{/snippet}

{#snippet toolsIcon()}
    <!-- react-icons/fa's FaTools, same sourcing; old's <MemoizedIcon icon={FaTools} size={16}/>
         also passed no className. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M501.1 395.7L384 278.6c-23.1-23.1-57.6-27.6-85.4-13.9L192 158.1V96L64 0 0 64l96 128h62.1l106.6 106.6c-13.6 27.8-9.2 62.3 13.9 85.4l117.1 117.1c14.6 14.6 38.2 14.6 52.7 0l52.7-52.7c14.5-14.6 14.5-38.2 0-52.7zM331.7 225c28.3 0 54.9 11 74.9 31l19.4 19.4c15.8-6.9 30.8-16.5 43.8-29.5 37.1-37.1 49.7-89.3 37.9-136.7-2.2-9-13.5-12.1-20.1-5.5l-74.4 74.4-67.9-11.3L334 98.9l74.4-74.4c6.6-6.6 3.4-17.9-5.7-20.2-47.4-11.7-99.6.9-136.6 37.9-28.5 28.5-41.9 66.1-41.2 103.6l82.1 82.1c8.1-1.9 16.5-2.9 24.7-2.9zm-103.9 82l-56.7-56.7L18.7 402.8c-25 25-25 65.5 0 90.5s65.5 25 90.5 0l123.6-123.6c-7.6-19.9-9.9-41.6-5-62.7zM64 472c-13.2 0-24-10.8-24-24 0-13.3 10.7-24 24-24s24 10.7 24 24c0 13.2-10.7 24-24 24z"/></svg>
{/snippet}

<PageMetadata
    text={`${t('home:composer_name')} - ${song.name}`}
    description="Create or edit songs with the composer, using up to 52 layers, tempo changers, multiple instruments and pitches. You can also convert a MIDI, video or audio into a sheet."
/>
{#if isMidiVisible}
    <MidiParser
        data={{
            instruments: song.instruments,
            selectedColumn: song.selected,
        }}
        functions={{
            changeMidiVisibility,
            changePitch,
            loadSong,
        }}
    />
{/if}
<div class="composer-grid appear-on-mount">
    <div class="column composer-left-control">
        <AppButton
            className="flex-centered"
            style="height:3rem;min-height:3rem;border-radius:0.3rem;background-color:var(--primary-darken-10)"
            onclick={() => {
                const wasPlaying = isPlaying
                togglePlay()
                if (settings.syncTabs.value) {
                    broadcastChannel?.postMessage?.(wasPlaying ? 'stop' : 'play')
                }
            }}
            ariaLabel={isPlaying ? t('common:pause') : t('common:play')}
        >
            {#if isPlaying}
                {@render pauseIcon()}
            {:else}
                {@render playIcon()}
            {/if}
        </AppButton>
        <InstrumentControls
            instruments={song.instruments}
            selected={layer}
            onLayerSelect={changeLayer}
            onInstrumentAdd={addInstrument}
            onInstrumentChange={editInstrument}
            onInstrumentDelete={removeInstrument}
            onChangePosition={switchLayerPosition}
        />
    </div>
    <div class="top-panel-composer" style="grid-area:b">
        <div class="row" style="height:fit-content;width:100%">
            {#key settings.columnsPerCanvas.value}
                <ComposerCanvas
                    columns={song.columns}
                    isPlaying={isPlaying}
                    isRecordingAudio={isRecordingAudio}
                    song={song}
                    selected={song.selected}
                    currentLayer={layer}
                    inPreview={inPreview}
                    settings={settings}
                    breakpoints={song.breakpoints}
                    selectedColumns={selectedColumns}
                    selectColumn={selectColumn}
                    toggleBreakpoint={toggleBreakpoint}
                />
            {/key}
            <div class="buttons-composer-wrapper-right">
                <CanvasTool
                    onclick={() => addColumns(1, song.selected)}
                    tooltip={t('composer:add_column')}
                    ariaLabel={t('composer:add_column')}
                >
                    {@render addColumnIcon()}
                </CanvasTool>
                <CanvasTool
                    onclick={() => removeColumns(1, song.selected)}
                    tooltip={t('composer:remove_column')}
                    ariaLabel={t('composer:remove_column')}
                >
                    {@render removeColumnIcon()}
                </CanvasTool>
                <CanvasTool
                    onclick={() => addColumns(Number(settings.beatMarks.value) * 4, 'end')}
                    tooltip={t('composer:add_new_page')}
                    ariaLabel={t('composer:add_new_page')}
                >
                    {@render addPageIcon()}
                </CanvasTool>
                <CanvasTool
                    onclick={toggleTools}
                    tooltip={t('composer:open_tools')}
                    ariaLabel={t('composer:open_tools')}
                >
                    {@render toolsIcon()}
                </CanvasTool>
            </div>
        </div>
    </div>
    <ComposerKeyboard
        functions={{
            handleClick,
            startRecordingAudio,
            selectColumnFromDirection,
            handleTempoChanger,
        }}
        data={{
            isPlaying,
            settings,
            isRecordingAudio,
            currentLayer: layer,
            instruments: song.instruments,
            keyboard: layers[layer],
            currentColumn: song.selectedColumn,
            pitch: song.instruments[layer]?.pitch || settings.pitch.value,
            noteNameType: settings.noteNameType.value,
        }}
    />
</div>
<ComposerMenu
    data={{
        isRecordingAudio,
        settings,
        hasChanges: changes > 0,
    }}
    functions={{
        loadSong,
        renameSong,
        downloadSong,
        createNewSong,
        changePage,
        updateThisSong,
        handleSettingChange,
        changeVolume,
        changeMidiVisibility,
        startRecordingAudio,
    }}
    inPreview={inPreview}
/>
<ComposerTools
    data={{
        isToolsVisible,
        layer,
        hasCopiedColumns: copiedColumns.length > 0,
        selectedColumns,
        undoHistory,
    }}
    functions={{
        toggleTools,
        copyColumns,
        eraseColumns,
        moveNotesBy,
        pasteColumns,
        deleteColumns,
        resetSelection,
        undo,
    }}
/>
<div class="song-info">
    <div class="text-ellipsis">
        {song.name}
    </div>
    <div>
        {formatMs(songLength.current)}
        /
        {formatMs(songLength.total)}
    </div>
</div>
