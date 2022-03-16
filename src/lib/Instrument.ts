import { INSTRUMENTS_DATA, LAYOUT_DATA, INSTRUMENTS, AUDIO_CONTEXT } from "appConfig"
import { InstrumentKeys, NoteStatus } from "types/GeneralTypes"

export default class Instrument {
    instrumentName: InstrumentKeys
    layout: NoteData[]
    buffers: AudioBuffer[]
    loaded: boolean
    deleted: boolean
    volumeNode: GainNode
    keyboardLayout: string[]
    mobileLayout: string[]
    keyboardCodes: string[]

    constructor(instrumentName: InstrumentKeys = INSTRUMENTS[0]) {
        this.instrumentName = instrumentName
        //@ts-ignore
        if (!INSTRUMENTS.includes(this.instrumentName)) this.instrumentName = INSTRUMENTS[0]
        this.layout = []
        this.buffers = []
        this.loaded = false
        this.deleted = false
        this.volumeNode = AUDIO_CONTEXT.createGain()
        const instrumentData = INSTRUMENTS_DATA[this.instrumentName as keyof typeof INSTRUMENTS_DATA]
        this.keyboardLayout = LAYOUT_DATA[instrumentData.notes].keyboardLayout
        this.mobileLayout = LAYOUT_DATA[instrumentData.notes].mobileLayout
        this.keyboardCodes = LAYOUT_DATA[instrumentData.notes].keyboardCodes

        this.keyboardLayout.forEach((noteName, i) => {
            const noteNames = {
                keyboard: noteName,
                mobile: this.mobileLayout[i]
            }
            let url = `./assets/audio/${this.instrumentName}/${i}.mp3`
            this.layout.push(new NoteData(i, noteNames, url))
        })

        this.volumeNode.gain.value = 0.8
    }
    getNoteFromCode = (code: number | string) => {
        let index = this.keyboardLayout.findIndex(e => e === String(code))
        return index !== -1 ? index : null
    }

    changeVolume = (amount: number) => {
        let newVolume = Number((amount / 135).toFixed(2))
        if (amount < 5) newVolume = 0
        this.volumeNode.gain.value = newVolume
    }

    play = (note: number, pitch: number) => {
        if (this.deleted) return
        const player = AUDIO_CONTEXT.createBufferSource()
        player.buffer = this.buffers[note]
        player.connect(this.volumeNode)
        //player.detune.value = pitch * 100, pitch should be 0 indexed from C
        player.playbackRate.value = pitch
        player.start(0)
        function handleEnd(){
            player.stop()
            player.disconnect()
        }
        player.addEventListener('ended',handleEnd,{once: true})
    }
    load = async () => {
        let emptyBuffer = AUDIO_CONTEXT.createBuffer(2, AUDIO_CONTEXT.sampleRate, AUDIO_CONTEXT.sampleRate)
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
        this.loaded = true
        return true
    }
    disconnect = () => {
        this.volumeNode.disconnect()
    }
    connect = (node: AudioNode) => {
        this.volumeNode.connect(node)
    }
    delete = () => {
        this.disconnect()
        this.deleted = true
        this.buffers = []
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