import { INSTRUMENTS_DATA, LAYOUT_DATA, INSTRUMENTS, AUDIO_CONTEXT, Pitch, LAYOUT_IMAGES, APP_NAME, BaseNote } from "$/appConfig"
import { makeObservable, observable } from "mobx"
import { InstrumentName, NoteStatus } from "$types/GeneralTypes"
import { NoteImage } from "$types/Keyboard"
import { getPitchChanger } from "./Utilities"

type Layouts = {
    keyboard: string[]
    mobile: string[]
    keyCodes: string[]
}
const INSTRUMENT_BUFFER_POOL = new Map<InstrumentName, AudioBuffer[]>()

//TODO refactor everything here


export default class Instrument {
    name: InstrumentName
    volumeNode: GainNode | null
    layout: NoteData[] = []
    layouts: Layouts = {
        keyboard: [],
        mobile: [],
        keyCodes: []
    }
    buffers: AudioBuffer[] = []
    isDeleted: boolean = false
    isLoaded: boolean = false

    get endNode() {
        return this.volumeNode
    }
    static clearPool() {
        INSTRUMENT_BUFFER_POOL.clear()
    }
    constructor(name: InstrumentName = INSTRUMENTS[0]) {
        this.name = name
        if (!INSTRUMENTS.includes(this.name as any)) this.name = INSTRUMENTS[0]
        this.volumeNode = AUDIO_CONTEXT.createGain()
        const instrumentData = INSTRUMENTS_DATA[this.name as keyof typeof INSTRUMENTS_DATA]
        const layouts = LAYOUT_DATA[instrumentData.notes]
        this.layouts = {
            keyboard: layouts.keyboardLayout,
            mobile: layouts.mobileLayout,
            keyCodes: layouts.keyboardCodes
        }
        this.layouts.keyboard.forEach((noteName, i) => {
            const noteNames = {
                keyboard: noteName,
                mobile: this.layouts.mobile[i]
            }
            const url = `./assets/audio/${this.name}/${i}.mp3`
            const note = new NoteData(i, noteNames, url, instrumentData.baseNotes[i])
            note.instrument = this.name
            //@ts-ignore
            note.noteImage = LAYOUT_IMAGES[this.layouts.keyboard.length][i]
            this.layout.push(note)
        })

        this.volumeNode.gain.value = 0.8
    }
    getNoteFromCode = (code: number | string) => {
        const index = this.layouts.keyboard.findIndex(e => e === String(code))
        return index !== -1 ? index : null
    }

    changeVolume = (amount: number) => {
        let newVolume = Number((amount / 135).toFixed(2))
        if (amount < 5) newVolume = 0
        if (this.volumeNode) this.volumeNode.gain.value = newVolume
    }

    play = (note: number, pitch: Pitch) => {
        if (this.isDeleted || !this.volumeNode) return
        const pitchChanger = getPitchChanger(pitch)
        const player = AUDIO_CONTEXT.createBufferSource()
        player.buffer = this.buffers[note]
        player.connect(this.volumeNode)
        //player.detune.value = pitch * 100, pitch should be 0 indexed from C
        player.playbackRate.value = pitchChanger
        player.start(0)
        function handleEnd() {
            player.stop()
            player.disconnect()
        }
        player.addEventListener('ended', handleEnd, { once: true })
    }
    load = async () => {
        let loadedCorrectly = true
        if (!INSTRUMENT_BUFFER_POOL.has(this.name)) {
            const emptyBuffer = AUDIO_CONTEXT.createBuffer(2, AUDIO_CONTEXT.sampleRate, AUDIO_CONTEXT.sampleRate)
            const requests: Promise<AudioBuffer>[] = this.layout.map(note => {
                //dont change any of this, safari bug
                return new Promise(resolve => {
                    fetch(note.url)
                        .then(result => result.arrayBuffer())
                        .then(buffer => {
                            AUDIO_CONTEXT.decodeAudioData(buffer, resolve, (e) => {
                                console.error(e)
                                loadedCorrectly = false
                                resolve(emptyBuffer)
                            }).catch(e => {
                                console.error(e)
                                loadedCorrectly = false
                                resolve(emptyBuffer)
                            })
                        }).catch(e => {
                            console.error(e)
                            loadedCorrectly = false
                            resolve(emptyBuffer)
                        })
                })
            })
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
    delete = () => {
        this.disconnect()
        this.isDeleted = true
        this.buffers = []
        this.volumeNode = null
    }
}
export function fetchAudioBuffer(url: string): Promise<AudioBuffer>{
    return new Promise((res,rej) => {
        fetch(url)
        .then(result => result.arrayBuffer())
        .then(buffer => {
            AUDIO_CONTEXT.decodeAudioData(buffer, res, (e) => {
                console.error(e)
                rej()
            }).catch(e => {
                console.error(e)
                return rej()
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
export class NoteData {
    index: number
    noteImage: NoteImage = APP_NAME === "Genshin" ? "do" : "cr"
    instrument: InstrumentName = INSTRUMENTS[0]
    noteNames: NoteName
    url: string
    baseNote: BaseNote = "C"
    buffer: ArrayBuffer = new ArrayBuffer(8)
    @observable
    data: NoteDataState = {
        status: '',
        delay: 0,
        animationId: 0
    }
    constructor(index: number, noteNames: NoteName, url: string, baseNote: BaseNote) {
        this.index = index
        this.noteNames = noteNames
        this.url = url
        this.baseNote = baseNote
        makeObservable(this)
    }
    get status(): NoteStatus {
        return this.data.status
    }

    setStatus(status: NoteStatus) {
        return this.setState({ status })
    }
    setState(data: Partial<NoteDataState>) {
        Object.assign(this.data, data)
    }
    clone() {
        const obj = new NoteData(this.index, this.noteNames, this.url, this.baseNote)
        obj.buffer = this.buffer
        obj.noteImage = this.noteImage
        obj.instrument = this.instrument
        obj.setState(this.data)
        return obj
    }
}