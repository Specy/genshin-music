// old: src/lib/audio/Instrument.ts - minimal-diff port. The one reactive-model change (Phase-4a
// Task 2 brief): `ObservableNote.data` was `@observable readonly data: NoteDataState` (mobx,
// `makeObservable(this)` in the constructor) - now `data: NoteDataState = $state({...})`, mobx
// deleted outright (no mobx dependency in this tree). `readonly` semantics are preserved by
// convention (the field is never reassigned, only mutated in place via `setState`'s
// `Object.assign`, exactly like the old blob). Everything else is import-path swaps:
// `$config` -> `$core/legacyConfig` (only APP_NAME here is on legacyConfig's UI-tier identity
// allowlist; INSTRUMENTS/INSTRUMENTS_DATA/NOTE_SCALE/DO_RE_MI_NOTE_SCALE/PITCH_TO_INDEX are
// GAME-DATA values that allowlist forbids to UI code, and Pitch/NoteNameType are type-only so
// were never a value-import concern - this file is audio-engine tier, not UI code, so
// legacyConfig's header separately carves out this file and MIDIProvider.ts for exactly those
// GAME-DATA values (whole-branch final review, finding B); each stays a direct `game.*` alias
// below, so importing it here is behaviorally identical to reading `$game` directly),
// `$types/GeneralTypes` -> `$core/types` (InstrumentName, NoteStatus - both restored
// there by this task), `$cmp/shared/SvgNotes` -> `$lib/games/types` (NoteImage - type-only, same
// precedent as SvgNote.svelte), `../utils/Utilities` -> `$core/utils/Utilities`,
// `$lib/Providers/KeyboardProvider(/KeyboardTypes)` -> `$lib/providers/KeyboardProvider(/KeyboardTypes)`,
// `$stores/KeybindsStore` -> `$stores/KeybindsStore.svelte`, `BASE_PATH` (old `$config`, itself
// `NEXT_PUBLIC_BASE_PATH ?? ''`) -> `base` from `$app/paths` (same kit.paths.base contract, see
// svelte.config.js). The audio-URL/noteImage-default APP_NAME expressions are kept as the adapter
// ternary/`.toLowerCase()` form verbatim (byte-parity per brief - both are on the legacyConfig
// UI-tier identity allowlist).
import {base} from '$app/paths'
import {
    APP_NAME,
    DO_RE_MI_NOTE_SCALE,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    NOTE_SCALE,
    type NoteNameType,
    type Pitch,
    PITCH_TO_INDEX
} from "$core/legacyConfig"
import type {InstrumentName, NoteStatus} from "$core/types"
import {capitalize, getPitchChanger} from "$core/utils/Utilities"
import type {BaseNote, NoteImage} from "$lib/games/types"
import {KeyboardProvider} from "$lib/providers/KeyboardProvider"
import type {KeyboardCode} from "$lib/providers/KeyboardProvider/KeyboardTypes"
import {keyBinds} from "$stores/KeybindsStore.svelte"
import {DEFAULT_ENG_KEYBOARD_MAP} from "$i18n/i18n"

type Layouts = {
    keyboard: string[]
    abc: string[]
    number: string[]
    playstation: string[]
    switch: string[]
}
// plain non-reactive module-level cache (matches old: never @observable/wrapped in mobx either) -
// not UI-observed state, so a real Map (not SvelteMap) is correct here, not just lint-suppressed.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const INSTRUMENT_BUFFER_POOL = new Map<InstrumentName, AudioBuffer[]>()

//TODO refactor everything here


export class Instrument {
    name: InstrumentName
    volumeNode: GainNode | null = null
    instrumentData: typeof INSTRUMENTS_DATA[InstrumentName]
    notes: ObservableNote[] = []
    layouts: Layouts = {
        keyboard: [],
        abc: [],
        playstation: [],
        number: [],
        switch: []
    }
    buffers: AudioBuffer[] = []
    isDeleted: boolean = false
    isLoaded: boolean = false
    audioContext: AudioContext | null = null

    get endNode() {
        return this.volumeNode
    }

    static clearPool() {
        INSTRUMENT_BUFFER_POOL.clear()
    }

    constructor(name: InstrumentName = INSTRUMENTS[0]) {
        this.name = name
        // old: `!INSTRUMENTS.includes(this.name as any)` - the `as any` cast is no longer needed
        // (InstrumentName widened to `string` in $core/types, Task 5 of P2; INSTRUMENTS is already
        // `readonly string[]`), so `.includes()` type-checks directly - dropped, not disabled.
        if (!INSTRUMENTS.includes(this.name)) this.name = INSTRUMENTS[0]
        this.instrumentData = {...INSTRUMENTS_DATA[this.name as keyof typeof INSTRUMENTS_DATA]}
        const layouts = this.instrumentData.layout
        this.layouts = {
            keyboard: [...layouts.keyboardLayout],
            abc: [...layouts.abcLayout],
            playstation: [...layouts.playstationLayout],
            // LayoutKeys.numberLayout is typed optional (some other LayoutKeys-shaped record could
            // omit it) but every INSTRUMENTS_DATA entry in both games' GameDefinitions always sets
            // it (verified: every `layout:` literal in genshin/index.ts and sky/index.ts includes
            // numberLayout) - old code assumed a plain string[] here, so `!` preserves that.
            number: [...layouts.numberLayout!],
            switch: [...layouts.switchLayout]
        }
        for (let i = 0; i < this.instrumentData.notes; i++) {
            const noteName = this.layouts.keyboard[i]
            const noteNames = {
                keyboard: noteName,
            }
            const url = `${base}/assets/audio/${APP_NAME.toLowerCase()}/${this.name}/${i}.mp3`
            const note = new ObservableNote(i, noteNames, url, this.instrumentData.baseNotes[i], this.instrumentData.midiNotes[i] ?? 0)
            note.instrument = this.name
            note.noteImage = this.instrumentData.icons[i]
            this.notes.push(note)
        }
    }

    getNoteFromCode = (code: string) => {
        const index = this.getNoteIndexFromCode(code)
        return index !== -1 ? this.notes[index] : null
    }
    getNoteFromIndex = (index: number) => {
        return this.notes[index] ?? null
    }
    getNoteIndexFromCode = (code: string) => {
        return this.layouts.keyboard.findIndex(e => e === code)
    }
    getNoteText = (index: number, type: NoteNameType, pitch: Pitch) => {
        const layout = this.layouts
        try {
            if (type === "Note name") {
                const baseNote = this.notes[index].baseNote
                return NOTE_SCALE[baseNote][PITCH_TO_INDEX.get(pitch) ?? 0]
            }
            if (type === "Your Keyboard layout") {
                const key = keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[index]) ?? layout.keyboard[index]
                const res = KeyboardProvider.getTextOfCode(key as KeyboardCode) ?? key.replace('Key', '')
                return capitalize(res)
            }
            if (type === "Keyboard layout") {
                const key = keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[index]) ?? layout.keyboard[index]
                const res = DEFAULT_ENG_KEYBOARD_MAP[key] ?? key.replace('Key', '')
                return capitalize(res)
            }
            if (type === "Do Re Mi") {
                const baseNote = this.notes[index].baseNote
                return DO_RE_MI_NOTE_SCALE[baseNote][PITCH_TO_INDEX.get(pitch) ?? 0]
            }
            if (type === "ABC") return layout.abc[index]
            if (type === "1 2 3") return layout.number[index]
            if (type === "No Text") return ''
            if (type === "Playstation") return layout.playstation[index]
            if (type === "Switch") return layout.switch[index]
        } catch {
            // old blob: silently swallow index/lookup errors here (byte-verbatim, no behavior change)
        }
        return ''
    }
    changeVolume = (amount: number) => {
        let newVolume = Number((amount / 135).toFixed(2))
        if (amount < 5) newVolume = 0
        if (this.volumeNode) this.volumeNode.gain.value = newVolume
    }

    play = (note: number, pitch: Pitch, delay?: number) => {
        if (this.isDeleted || !this.volumeNode || !this.audioContext) return
        const pitchChanger = getPitchChanger(pitch)
        const player = this.audioContext.createBufferSource()
        player.buffer = this.buffers[note]
        player.connect(this.volumeNode)
        //player.detune.value = pitch * 100, pitch should be 0 indexed from C
        player.playbackRate.value = pitchChanger
        if (delay) {
            player.start(this.audioContext.currentTime + delay)
        } else {
            player.start()
        }

        function handleEnd() {
            player.stop()
            player.disconnect()
        }

        player.addEventListener('ended', handleEnd, {once: true})
    }
    load = async (audioContext: AudioContext) => {
        this.audioContext = audioContext
        this.volumeNode = audioContext.createGain()
        this.volumeNode.gain.value = 0.8
        let loadedCorrectly = true
        if (!INSTRUMENT_BUFFER_POOL.has(this.name)) {
            const emptyBuffer = this.audioContext.createBuffer(2, this.audioContext.sampleRate, this.audioContext.sampleRate)
            const requests: Promise<AudioBuffer>[] = this.notes.map(note =>
                fetchAudioBuffer(note.url, audioContext)
                    .catch(() => {
                        loadedCorrectly = false
                        return emptyBuffer
                    })
            )
            this.buffers = await Promise.all(requests)
            if (loadedCorrectly) INSTRUMENT_BUFFER_POOL.set(this.name, this.buffers)
        } else {
            this.buffers = INSTRUMENT_BUFFER_POOL.get(this.name)!
        }
        this.isLoaded = true
        return loadedCorrectly
    }
    disconnect = (node?: AudioNode) => {
        if (node) return this.volumeNode?.disconnect(node)
        this.volumeNode?.disconnect()
    }
    connect = (node: AudioNode) => {
        this.volumeNode?.connect(node)
    }
    dispose = () => {
        this.disconnect()
        this.isDeleted = true
        this.buffers = []
        this.volumeNode = null
    }
}

export function fetchAudioBuffer(url: string, audioContext: AudioContext): Promise<AudioBuffer> {
    //dont change any of this, safari bug
    return new Promise((res, rej) => {
        fetch(url)
            .then(result => result.arrayBuffer())
            .then(buffer => {
                audioContext.decodeAudioData(buffer, res, (e) => {
                    console.error(e)
                    rej()
                }).catch(e => {
                    console.error(e)
                    rej()
                })
            })
    })
}

interface NoteName {
    keyboard: string,
}

export type NoteDataState = {
    status: NoteStatus,
    delay: number
    animationId: number
}

export class ObservableNote {
    index: number
    noteImage: NoteImage = APP_NAME === "Genshin" ? "do" : "cr"
    midiNote: number
    instrument: InstrumentName = INSTRUMENTS[0]
    noteNames: NoteName
    url: string
    baseNote: BaseNote = "C"
    buffer: ArrayBuffer = new ArrayBuffer(8)
    // old: `@observable readonly data: NoteDataState = {...}` + `makeObservable(this)` in the
    // constructor (mobx). Now a Svelte 5 rune: `readonly` is preserved by convention only (never
    // reassigned below - `setState` mutates in place via `Object.assign`, same as old).
    data: NoteDataState = $state({
        status: '',
        delay: 0,
        animationId: 0
    })

    constructor(index: number, noteNames: NoteName, url: string, baseNote: BaseNote, midiNote: number) {
        this.index = index
        this.noteNames = noteNames
        this.url = url
        this.baseNote = baseNote
        this.midiNote = midiNote
    }

    get status(): NoteStatus {
        return this.data.status
    }

    setStatus(status: NoteStatus) {
        return this.setState({status})
    }

    triggerAnimation(status?: NoteStatus) {
        this.setState({
            animationId: this.data.animationId + 1,
            status
        })
    }

    setState(data: Partial<NoteDataState>) {
        Object.assign(this.data, data)
    }

    clone() {
        const obj = new ObservableNote(this.index, this.noteNames, this.url, this.baseNote, this.midiNote)
        obj.buffer = this.buffer
        obj.noteImage = this.noteImage
        obj.instrument = this.instrument
        obj.setState(this.data)
        return obj
    }
}
