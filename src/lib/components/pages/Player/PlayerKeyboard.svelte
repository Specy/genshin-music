<script lang="ts">
    import {onMount} from 'svelte'
    import {game} from '$game'
    import {SPEED_CHANGERS, type NoteNameType, type Pitch} from '$core/legacyConfig'
    import PlayerNote from './PlayerNote.svelte'
    import {playerStore} from '$stores/PlayerStore.svelte'
    import {playerControlsStore} from '$stores/PlayerControlsStore.svelte'
    import {Array2d, clamp, delay, groupArrayEvery, type Timer} from '$core/utils/Utilities'
    import Analytics from '$core/Analytics'
    import {ApproachingNote, type RecordedNote} from '$core/Songs/SongClasses'
    import type {Instrument, ObservableNote} from '$lib/audio/Instrument.svelte'
    import {RecordedSong, type Chunk} from '$core/Songs/RecordedSong'
    import {MIDIProvider, type MIDIEvent} from '$lib/providers/MIDIProvider'
    import type {NoteLayer} from '$core/Songs/Layer'
    import {createKeyboardListener, createShortcutListener, type ShortcutListener} from '$stores/KeybindsStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import {Song} from '$core/Songs/Song'

    // Old: src/components/pages/Player/PlayerKeyboard.tsx (468 lines, the single most complex file
    // this wave) - the play/practice/approaching engine, class component -> component conversion.
    // Class fields become `$state` (only where the render/template genuinely depends on the value -
    // see below) or plain `let`/`const` closure locals (everything else - internal bookkeeping never
    // read by the template has no reactivity need, same reasoning already used across this
    // migration); `componentDidMount`+`componentWillUnmount` collapse into one `onMount` whose
    // returned function is the unmount cleanup (React's split lifecycle -> Svelte's single hook).
    // Every method (`playSong`/`practiceSong`/`approachingSong`/`tick`/`handleClick`/etc.) becomes a
    // plain function/const in this script block - none of them run during the top-to-bottom synchronous
    // setup (all are only invoked later from onMount's deferred effect, DOM event handlers, or
    // setInterval/setTimeout callbacks), so declaration order relative to `onMount` doesn't matter.
    //
    // WHICH fields became `$state`: only `mode` and `approachRate` and `approachingNotes` are read by
    // the render output (`hideNotes`/the `data` prop passed to each PlayerNote/the approach-circle
    // list) - old could get away with `this.mode`/`this.approachRate` being plain (non-`this.state`)
    // instance fields because React re-renders the WHOLE render() function fresh whenever ANY
    // `setState` fires anywhere nearby (even for an unrelated field), so by the time render() re-ran
    // it always picked up the current values. Svelte's reactivity is fine-grained per-expression, not
    // whole-component, so anything the template reads must itself be reactive to update correctly -
    // promoted here, not a behavior change (the rendered values still change at exactly the same
    // points old's did).
    //
    // The local `state.keyboard` field is DROPPED ENTIRELY (brief: "the subscribeObservableArray
    // (playerStore.keyboard) -> read playerStore.keyboard"). Old kept a synced copy purely because
    // mobx needs an explicit resubscribe to know a plain instance array's splice should re-render;
    // `playerStore.keyboard` is itself `$state([])`-backed now, so every old `const {keyboard} =
    // this.state` site below just reads `playerStore.keyboard` directly and is automatically
    // reactive wherever that read happens inside a derived/template expression - `subscribeObservableArray`
    // has no Svelte equivalent needed at all.
    //
    // The `subscribeObeservableObject(playerStore.state, cb)` mobx subscription (batched via a 4ms
    // `setTimeout` debounce, comment: "mobx calls for each prop changed while i want to batch it")
    // becomes an `$effect` inside `onMount` that reads `playerStore.state.key`/`.playId` at its
    // synchronous top (Global §: "the porting effect MUST read playerStore.state.key/playId so it
    // re-runs even when the song object is reference-equal") then keeps the EXACT SAME manual
    // setTimeout(...,4) debounce body old had. KEPT rather than dropped: even though a Svelte effect
    // scoped to only `state.key`/`state.playId` would already fire once per logical
    // play/practice/approaching/restartSong/resetSong call (mobx's raw `observe()` fires once per
    // individual `Object.assign` property write even inside PlayerStore's `@action`-decorated
    // `setState` - action batching covers autorun/reaction/observer components, not observe()
    // listeners - so old's subscription really did fire several times per call, which is what the
    // comment describes), the debounce does a SECOND job independent of coalescing: it defers past
    // the CURRENT synchronous call stack, so `stopSong()` + the mode dispatch always run after
    // whatever triggered the change (e.g. `playerStore.play(...)`) has fully returned. That ordering
    // guarantee is worth keeping regardless of which reactivity system drives it, and this component
    // isn't mounted until Task 7 (no live smoke of play/practice/approaching mode switches possible
    // from this task alone) - too risky to drop without one. Flagged for Task 7's live smoke to
    // re-confirm mode switches behave identically; the debounce can be revisited then with real
    // evidence if it turns out to be provably redundant under Svelte's own effect batching.
    //
    // Two-tier (UI file, reads $game per the P4b plan's mapping table):
    //   APP_NAME === 'Sky' ? 15 : 21 (approach-array height, x4 call sites) -> game.notes.perColumn
    //   APP_NAME === 'Genshin' ? 100 : 200 / the inverted `APP_NAME === 'Sky' ? 200 : 100` (same value
    //     set, x2 call sites: practice-click delay, click-timeout duration) -> game.notes.animationDelayMs
    //   The render() keyboard-length -> keyboard-5/-4/-3 class logic uses NO APP_NAME check in old (it
    //     switches on the rendered keyboard's actual note COUNT: 15/14/8/6) - preserved verbatim, not
    //     part of the two-tier table.
    //
    // i18n: old called the raw `i18n.t("common:loading")` directly (bypassing the
    // `useTranslation()` hook this file's class component never received `t` through) - in a plain,
    // non-reactive way old's own author likely didn't intend as a deliberate choice (KeyboardPlayer's
    // parent chain would still occasionally re-render it via other props, papering over the gap).
    // `t()` from `$i18n/binding.svelte` (the project's established reactive-translation wrapper for
    // .svelte components, P3 Task 3) is used here instead so the loading text genuinely re-renders on
    // a language switch - the correct idiomatic port, not a deviation.
    //
    // Other disclosed simplifications (all mechanical, zero behavior change):
    //  - `stopSong` dropped old's `new Promise(res => { ...; this.setState({...}, res) })` wrapper -
    //    that existed only to delay the returned promise until React's setState commit callback
    //    fired; Svelte's $state writes are synchronously visible immediately, so the mutations just
    //    happen directly and the function stays `async` only so `await stopSong()` call sites keep
    //    working unchanged.
    //  - `handlePracticeClick`'s trailing `this.setState({songToPractice})` is dropped - `songToPractice`
    //    is plain (not $state, see below) and was already mutated in place via splice/shift; the old
    //    setState call existed purely to trigger a React re-render for a field render() never reads.
    //  - `tick()`'s renamed forEach parameter (`approachingNotesRow` instead of reusing the outer
    //    `approachingNotes` name) avoids shadowing the module-level `$state` field of the same name -
    //    naming only, not a behavior change (old's JS scoping allowed the shadow; TS/eslint here would
    //    rather it not).
    //  - `tickInterval`/`debouncedStateUpdate`/`timeouts` use the project's `Timer` type
    //    (`$core/utils/Utilities`, `ReturnType<typeof setTimeout> | 0`) instead of old's
    //    `setInterval(...) as unknown as number` cast - same underlying ambiguity, already-established
    //    idiom (`MediaRecorderPolyfill.ts`'s `slicing: Timer | undefined`).
    //
    // PRESERVED QUIRKS (flagged, not fixed): the "not sure why i even save the song, i dont use it
    // anywhere" comment in `approachingSong` (progress-ledger carry-forward, kept verbatim incl. the
    // commented-out `playerControlsStore.setSong(song)` line below it); `nextChunkDelay` is set once
    // in `practiceSong` and never read anywhere else in the old file (verified via a whole-branch
    // grep) - dead write, preserved as a plain field; old also carried a `playTimestamp: Date.now()`
    // state field set once at construction and never read again anywhere - preserved below as a
    // (non-reactive - nothing depends on it) plain field for parity.
    let {
        data,
        functions,
    }: {
        data: {
            isLoading: boolean
            instrument: Instrument
            pitch: Pitch
            keyboardSize: number
            noteNameType: NoteNameType
            hasSong: boolean
            hasAnimation: boolean
            approachRate: number
            keyboardYPosition: number
            speedChanger: typeof SPEED_CHANGERS[number]
            visualSheetSize: number
            hideNotesInPracticeMode: boolean
        }
        functions: {
            playSound: (index: number, layer?: NoteLayer) => void
            setHasSong: (override: boolean) => void
            onSongFinished: () => void
        }
    } = $props()

    let approachRate = $state(1500)
    let approachingNotesList: ApproachingNote[] = []
    // dead write, preserved from old (see header comment); old's class-field version wasn't
    // lint-checked for this the same way a top-level let is here.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let nextChunkDelay = 0
    const tickTime = 50
    let tickInterval: Timer = 0
    let mounted = true
    let songTimestamp = 0
    let cleanup: (() => void)[] = []
    let timeouts: Timer[] = []
    let debouncedStateUpdate: Timer = 0
    let mode: 'play' | 'practice' | 'approaching' | undefined = $state('play')
    let songToPractice: Chunk[] = []
    let approachingNotes: ApproachingNote[][] = $state(Array2d.from(game.notes.perColumn))
    // dead field, preserved from old (see header comment); old's class-field version wasn't
    // lint-checked for this the same way a top-level let is here.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let playTimestamp = Date.now()

    function setTicker(enabled: boolean) {
        if (enabled) {
            clearInterval(tickInterval)
            tickInterval = setInterval(tick, tickTime)
        } else {
            clearInterval(tickInterval)
        }
    }

    function handleMidi([eventType, note, velocity]: MIDIEvent) {
        if (!mounted) return
        const instrument = data.instrument
        if (MIDIProvider.isDown(eventType) && velocity !== 0) {
            const keyboardNotes = MIDIProvider.getNotesOfMIDIevent(note)
            keyboardNotes.forEach(keyboardNote => {
                handleClick(instrument.notes[keyboardNote.index])
            })
        }
    }

    const handleKeyboard: ShortcutListener<"keyboard"> = async ({event, shortcut}) => {
        if (event.repeat) return
        if (!event.shiftKey) {
            const note = data.instrument.getNoteFromCode(shortcut.name)
            if (note !== null) handleClick(note)
        }
    }

    async function approachingSong(song: RecordedSong, start = 0, end?: number) {
        mode = 'approaching'
        setTicker(true)
        end = end ? end : song.notes.length
        const {speedChanger} = data
        const notes: ApproachingNote[] = []
        approachRate = data.approachRate || 1500
        const startDelay = approachRate
        const startOffset = song.notes[start] !== undefined ? song.notes[start].time : 0
        for (let i = start; i < end && i < song.notes.length; i++) {
            const note = song.notes[i]
            const obj = new ApproachingNote({
                time: Song.roundTime((note.time - startOffset) / speedChanger.value + startDelay),
                index: note.index
            })
            notes.push(obj)
        }
        await delay(2000) //add an initial delay to let the user prepare
        //not sure why i even save the song, i dont use it anywhere
        //playerControlsStore.setSong(song)
        playerControlsStore.clearPages()
        playerControlsStore.resetScore()
        approachingNotes = Array2d.from(game.notes.perColumn)
        approachingNotesList = notes
    }

    function tick() {
        if (!data.hasSong || mode !== "approaching") return
        const stateNotes = approachingNotes
        const notes = approachingNotesList
        const {speedChanger} = data
        notes.forEach(note => {
            note.time -= tickTime
        })
        let hasChanges = false
        for (let i = 0; i < notes.length; i++) {
            if (notes[i].time < approachRate) {
                const newNote = new ApproachingNote({
                    time: approachRate,
                    index: notes[i].index,
                    id: Math.floor(Math.random() * 10000)
                })
                stateNotes[notes[i].index].push(newNote)
                notes.splice(i, 1)
                i--
                hasChanges = true
            } else {
                break
            }
        }
        let removed = 0
        stateNotes.forEach(approachingNotesRow => {
            for (let i = 0; i < approachingNotesRow.length; i++) {
                const note = approachingNotesRow[i]
                note.time -= tickTime
                if (note.clicked) {
                    if (note.time < approachRate / 3) {
                        playerControlsStore.increaseScore(true, speedChanger.value)
                    } else {
                        playerControlsStore.increaseScore(false)
                    }
                    note.time = -1 //so that it can be removed after
                }
                if (note.time < 0) {
                    if (!note.clicked) {
                        playerControlsStore.increaseScore(false)
                    }
                    approachingNotesRow.splice(i, 1)
                    i--
                    hasChanges = true
                    removed++
                }
            }
        })
        if (!hasChanges) return
        if (playerControlsStore.current + removed === playerControlsStore.size) {
            setTicker(false)
            functions.onSongFinished()
        }
        playerControlsStore.setCurrent(playerControlsStore.current + removed)
        // Svelte's $state deep-proxies nested arrays, so the in-place .push/.splice mutations above
        // are already reactively visible without this reassignment (unlike React, which needed a
        // fresh top-level reference via .map(arr => arr.slice()) to detect the change) - kept anyway
        // for exact parity with old and because it's harmless (same defensive-clone cost every tick).
        approachingNotes = stateNotes.map(arr => arr.slice())
    }

    function applySpeedChange(notes: RecordedNote[]) {
        const {speedChanger} = data
        return notes.map(note => {
            note.time = note.time / speedChanger.value
            return note
        })
    }

    async function playSong(song: RecordedSong, start = 0, end?: number) {
        mode = 'play'
        end = end ? end : song.notes.length
        songTimestamp = song.timestamp
        const keyboard = playerStore.keyboard
        const {visualSheetSize} = data
        const notes = applySpeedChange(song.notes).slice(start, end)
        const mergedNotes = RecordedSong.mergeNotesIntoChunks(notes.map(n => n.clone()))
        playerControlsStore.setPages(groupArrayEvery(mergedNotes, visualSheetSize))
        await delay(200) //add small start offset
        const startOffset = notes[0].time
        let previous = startOffset
        let delayOffset = 0
        let startTime = Date.now()
        let chunkPlayedNotes = 0
        for (let i = 0; i < notes.length; i++) {
            const delayTime = notes[i].time - previous
            previous = notes[i].time
            if (delayTime > 16) await delay(delayTime + delayOffset)
            if (!mounted || songTimestamp !== song.timestamp) return
            handleClick(keyboard[notes[i].index], notes[i].layer)
            if (chunkPlayedNotes >= (playerControlsStore.currentChunk?.notes.length ?? 0)) {
                chunkPlayedNotes = 1
                playerControlsStore.incrementChunkPositionAndSetCurrent(start + i + 1)
            } else {
                chunkPlayedNotes++
                playerControlsStore.setCurrent(start + i + 1)
            }
            delayOffset = startTime + previous - startOffset - Date.now()
        }
        functions.onSongFinished()
    }

    function practiceSong(song: RecordedSong, start = 0, end?: number) {
        mode = 'practice'
        //TODO move this to the song class
        end = end ? end : song.notes.length
        const keyboard = playerStore.keyboard
        const {visualSheetSize} = data
        const notes = applySpeedChange(song.notes).slice(start, end)
        const chunks = RecordedSong.mergeNotesIntoChunks(notes.map(n => n.clone()))
        if (chunks.length === 0) return
        nextChunkDelay = 0
        const firstChunk = chunks[0]
        firstChunk.notes.forEach(note => {
            playerStore.setNoteState(note.index, {
                status: 'toClick',
                delay: game.notes.animationDelayMs
            })
        })
        const secondChunk = chunks[1]
        secondChunk?.notes.forEach(note => {
            const keyboardNote = keyboard[note.index]
            if (keyboardNote.status === 'toClick') return keyboardNote.setStatus('toClickAndNext')
            keyboardNote.setStatus('toClickNext')
        })
        functions.setHasSong(true)
        playerControlsStore.setPages(groupArrayEvery(chunks, visualSheetSize))
        songToPractice = chunks
    }

    async function restartSong(override?: number) {
        await stopSong()
        if (!mounted) return
        playerStore.restartSong((typeof override === 'number') ? override : playerControlsStore.position, playerControlsStore.end)
    }

    async function stopSong(): Promise<void> {
        songTimestamp = 0
        playerStore.resetKeyboardLayout()
        approachingNotesList = []
        songToPractice = []
        approachingNotes = Array2d.from(game.notes.perColumn)
        functions.setHasSong(false)
    }

    function stopAndClear() {
        stopSong()
        playerStore.resetSong()
    }

    function handleApproachClick(note: ObservableNote) {
        const approachingNote = approachingNotes[note.index][0]
        if (approachingNote) {
            approachingNote.clicked = true
            if (approachingNote.time < approachRate / 3) return "approach-correct"
        }
        return "approach-wrong"
    }

    function handlePracticeClick(note: ObservableNote) {
        const keyboard = playerStore.keyboard
        if (songToPractice.length > 0) {
            const clickedNoteIndex = songToPractice[0]?.notes.findIndex(e => e.index === note.index)
            if (clickedNoteIndex !== -1) {
                songToPractice[0].notes.splice(clickedNoteIndex, 1)
                if (songToPractice[0].notes.length === 0) {
                    songToPractice.shift()
                    playerControlsStore.incrementChunkPositionAndSetCurrent()
                }
                if (songToPractice.length === 0) {
                    functions.onSongFinished()
                }
                if (songToPractice.length > 0) {
                    const nextChunk = songToPractice[0]
                    const nextNextChunk = songToPractice[1]
                    nextChunk.notes.forEach(note => {
                        playerStore.setNoteState(note.index, {
                            status: 'toClick',
                            delay: nextChunk.delay
                        })
                    })
                    if (nextNextChunk) {
                        nextNextChunk?.notes.forEach(note => {
                            const keyboardNote = keyboard[note.index]
                            if (keyboardNote.status === 'toClick') return keyboardNote.setStatus('toClickAndNext')
                            keyboardNote.setStatus('toClickNext')
                        })
                    }
                }
                playerControlsStore.incrementCurrent()
            }
        }
    }

    function handleClick(note: ObservableNote, layers?: NoteLayer) {
        const keyboard = playerStore.keyboard
        const hasAnimation = data.hasAnimation
        if (!note) return
        const prevStatus = keyboard[note.index].status
        playerStore.setNoteState(note.index, {
            status: 'clicked',
            delay: playerStore.eventType !== 'play'
                ? game.notes.animationDelayMs
                : 0,
            animationId: (hasAnimation && playerStore.eventType !== 'approaching')
                ? Math.floor(Math.random() * 10000) + Date.now()
                : 0
        })
        handlePracticeClick(note)
        functions.playSound(note.index, layers)
        const status = handleApproachClick(note)
        if (playerStore.eventType === 'approaching') {
            playerStore.setNoteState(note.index, {status})
            if (status === 'approach-wrong') playerControlsStore.increaseScore(false)
        }
        //TODO could add this to the player store
        if (timeouts[note.index] as number > 0 && playerStore.eventType === 'play') clearTimeout(timeouts[note.index])
        timeouts[note.index] = setTimeout(() => {
            timeouts[note.index] = 0
            if (!['clicked', 'approach-wrong', 'approach-correct'].includes(keyboard[note.index].status)) return
            if (prevStatus === 'toClickNext') return playerStore.setNoteState(note.index, {status: prevStatus})
            playerStore.setNoteState(note.index, {status: ''})
        }, game.notes.animationDelayMs)
    }

    onMount(() => {
        const disposeShortcuts = createShortcutListener("player", "player_keyboard", ({shortcut}) => {
            const {name} = shortcut
            if (name === "restart") {
                if (!data.hasSong) return
                if (['practice', 'play', 'approaching'].includes(playerStore.eventType)) {
                    restartSong(0)
                }
            }
            if (name === "stop") {
                if (data.hasSong) stopAndClear()
            }
        })
        const disposeKeyboard = createKeyboardListener("player_keyboard_keys", handleKeyboard)
        cleanup.push(disposeShortcuts, disposeKeyboard)

        $effect(() => {
            void playerStore.state.key
            void playerStore.state.playId
            if (debouncedStateUpdate) clearTimeout(debouncedStateUpdate)
            debouncedStateUpdate = setTimeout(async () => {
                const state = playerStore.state
                const song = playerStore.song
                const type = playerStore.eventType
                await stopSong()
                if (!mounted) return
                if (type === 'stop') {
                    functions.setHasSong(false)
                } else {
                    if (!song) return
                    const lostReference = song.isComposed
                        ? song.toRecordedSong().clone()
                        : song.clone()

                    lostReference.timestamp = Date.now()
                    const end = state.end || lostReference?.notes?.length || 0
                    if (type === 'play') {
                        playSong(lostReference, state.start, end)
                    }
                    if (type === 'practice') {
                        practiceSong(lostReference, state.start, end)
                    }
                    if (type === 'approaching') {
                        approachingSong(lostReference, state.start, end)
                    }
                    functions.setHasSong(true)
                    Analytics.songEvent({type})
                    playerControlsStore.setState({
                        size: lostReference?.notes?.length || 1,
                        position: state.start,
                        end,
                        current: state.start
                    })
                }
            }, 4)
        })

        MIDIProvider.addListener(handleMidi)
        cleanup.push(() => MIDIProvider.removeListener(handleMidi))

        return () => {
            cleanup.forEach(d => d())
            songTimestamp = 0
            playerStore.resetSong()
            mounted = false
            clearInterval(tickInterval)
        }
    })

    const size = $derived(clamp(data.keyboardSize / 100, 0.5, 1.5))
    const keyboardClass = $derived.by(() => {
        let cls = "keyboard" + (playerStore.eventType === 'play' ? " keyboard-playback" : "")
        const len = playerStore.keyboard.length
        if (len === 15) cls += " keyboard-5"
        if (len === 14) cls += " keyboard-5"
        if (len === 8) cls += " keyboard-4"
        if (len === 6) cls += " keyboard-3"
        return cls
    })
    // $derived.by(...) (not the bare $derived(expr) sugar) is required here: TypeScript's control
    // flow analysis narrows `mode` to its initializer literal ('play') when the comparison is
    // inlined directly as $derived's argument (a false positive - it can't see that mode/etc. are
    // reassigned later by reactive effects, not by any code that runs before this line in the
    // synchronous setup); wrapping the same expression in its own arrow-function body (exactly like
    // keyboardClass above) gives TS a fresh, unnarrowed read of `mode`'s declared type.
    const hideNotes = $derived.by(() => data.hideNotesInPracticeMode && mode === 'practice')
    const wrapperStyle = $derived(`${size !== 1 ? `transform:scale(${size});` : ''}z-index:2;margin-bottom:${size * 6 + (data.keyboardYPosition / 10)}vh`)
</script>

<div class={keyboardClass} style={wrapperStyle}>
    {#if data.isLoading}
        <div class="loading">{t('common:loading')}...</div>
    {:else}
        {#each playerStore.keyboard as note (note.index)}
            <PlayerNote
                {note}
                data={{approachRate, instrument: data.instrument.name}}
                hideNote={hideNotes}
                approachingNotes={approachingNotes[note.index]}
                handleClick={handleClick}
                noteText={data.instrument.getNoteText(note.index, data.noteNameType, data.pitch)}
            />
        {/each}
    {/if}
</div>
