import { INSTRUMENTS_DATA, LAYOUT_DATA, INSTRUMENTS, AUDIO_CONTEXT, Pitch } from "appConfig"
import { InstrumentName, NoteStatus } from "types/GeneralTypes"
import { getPitchChanger } from "./Tools"

type Layouts = {
    keyboard: string[]
    mobile: string[]
    keyCodes: string[]
}
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

    get endNode(){
        return this.volumeNode
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
            this.layout.push(new NoteData(i, noteNames, url))
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
        if(this.volumeNode) this.volumeNode.gain.value = newVolume
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
        function handleEnd(){
            player.stop()
            player.disconnect()
        }
        player.addEventListener('ended',handleEnd,{once: true})
    }
    load = async () => {
        const emptyBuffer = AUDIO_CONTEXT.createBuffer(2, AUDIO_CONTEXT.sampleRate, AUDIO_CONTEXT.sampleRate)
        const requests: Promise<AudioBuffer>[] = this.layout.map(note => {
            //dont change any of this, safari bug
            return new Promise(resolve => {
                fetch(note.url)
                    .then(result => result.arrayBuffer())
                    .then(buffer => {
                        AUDIO_CONTEXT.decodeAudioData(buffer, resolve, () => {
                            resolve(emptyBuffer)
                        })
                            .catch(e => { resolve(emptyBuffer) })
                    }).catch(e => { resolve(emptyBuffer) })
            })
        })
        this.buffers = await Promise.all(requests)
        this.isLoaded = true
        return true
    }
    disconnect = (node?: AudioNode) => {
        if(node) return this.volumeNode?.disconnect(node)
        this.volumeNode?.disconnect()
    }
    connect = (node: AudioNode) => {
        this.volumeNode?.connect(node)
    }
    delete = () => {
        this.disconnect()
        this.isDeleted = true
        this.buffers = []
        //TODO why was this not garbage collected?
        this.volumeNode = null
    }
}


interface NoteName {
    keyboard: string,
    mobile: string
}

export class NoteData {
    index: number
    noteNames: NoteName
    url: string
    buffer: ArrayBuffer
    data: {
        status: NoteStatus
        delay: number
    }

    constructor(index: number, noteNames: NoteName, url: string) {
        this.index = index
        this.noteNames = noteNames
        this.url = url
        this.buffer = new ArrayBuffer(8)
        this.data = {
            status: '',
            delay: 0
        }
    }
    get status(): NoteStatus{
        return this.data.status
    }

    setStatus(status: NoteStatus){
        return this.setState({status})
    }   
    setState(data: Partial<{
        status: NoteStatus
        delay: number
    }>){
        const clone = this.clone()
        clone.data = {...this.data, ...data}
        return clone
    }
    clone(){
        const obj = new NoteData(this.index, this.noteNames, this.url)
        obj.buffer = this.buffer
        obj.data = {...this.data}
        return obj
    }
}