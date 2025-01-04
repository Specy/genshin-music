import {
    APP_NAME,
    BASE_PATH,
    BaseNote,
    DO_RE_MI_NOTE_SCALE,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    NOTE_SCALE,
    NoteNameType,
    Pitch,
    PITCH_TO_INDEX
} from "$config"
import {makeObservable, observable} from "mobx"
import {InstrumentName, NoteStatus} from "$types/GeneralTypes"
import {capitalize, getPitchChanger} from "../utils/Utilities"
import {NoteImage} from "$cmp/shared/SvgNotes"
import {KeyboardProvider} from "$lib/Providers/KeyboardProvider";
import {KeyboardCode} from "$lib/Providers/KeyboardProvider/KeyboardTypes";
import {keyBinds} from "$stores/KeybindsStore";
import {DEFAULT_ENG_KEYBOARD_MAP} from "$i18n/i18n";

type Layouts = {
    keyboard: string[]
    mobile: string[]
    abc: string[]
    playstation: string[]
    switch: string[]
}
const INSTRUMENT_BUFFER_POOL = new Map<InstrumentName, AudioBuffer[]>()

//TODO refactor everything here


export class Instrument {
    name: InstrumentName
    volumeNode: GainNode | null = null
    instrumentData: typeof INSTRUMENTS_DATA[InstrumentName]
    notes: ObservableNote[] = []
    layouts: Layouts = {
        keyboard: [],
        mobile: [],
        abc: [],
        playstation: [],
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
        if (!INSTRUMENTS.includes(this.name as any)) this.name = INSTRUMENTS[0]
        this.instrumentData = {...INSTRUMENTS_DATA[this.name as keyof typeof INSTRUMENTS_DATA]}
        const layouts = this.instrumentData.layout
        this.layouts = {
            keyboard: [...layouts.keyboardLayout],
            mobile: [...layouts.mobileLayout],
            abc: [...layouts.abcLayout],
            playstation: [...layouts.playstationLayout],
            switch: [...layouts.switchLayout]
        }
        for (let i = 0; i < this.instrumentData.notes; i++) {
            const noteName = this.layouts.keyboard[i]
            const noteNames = {
                keyboard: noteName,
                mobile: this.layouts.mobile[i]
            }
            const url = `${BASE_PATH}/assets/audio/${APP_NAME.toLowerCase()}/${this.name}/${i}.mp3`
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
            if(type === "Keyboard layout"){
                const key = keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[index]) ?? layout.keyboard[index]
                const res = DEFAULT_ENG_KEYBOARD_MAP[key] ?? key.replace('Key', '')
                return capitalize(res)
            }
            if (type === "Do Re Mi") {
                const baseNote = this.notes[index].baseNote
                return DO_RE_MI_NOTE_SCALE[baseNote][PITCH_TO_INDEX.get(pitch) ?? 0]
            }
            if (type === "ABC") return layout.abc[index]
            if (type === "No Text") return ''
            if (type === "Playstation") return layout.playstation[index]
            if (type === "Switch") return layout.switch[index]
        } catch (e) {
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
    mobile: string
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
    @observable
    readonly data: NoteDataState = {
        status: '',
        delay: 0,
        animationId: 0
    }

    constructor(index: number, noteNames: NoteName, url: string, baseNote: BaseNote, midiNote: number) {
        this.index = index
        this.noteNames = noteNames
        this.url = url
        this.baseNote = baseNote
        this.midiNote = midiNote
        makeObservable(this)
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