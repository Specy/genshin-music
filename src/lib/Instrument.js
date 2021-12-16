import { instrumentsData, layoutData, instruments,audioContext } from "appConfig"

export default class Instrument {
    constructor(instrumentName) {
        this.instrumentName = instrumentName === undefined ? instruments[0] : instrumentName
        if (!instruments.includes(this.instrumentName)) this.instrumentName = instruments[0] 
        this.layout = []
        this.buffers = []
        this.loaded = false
        this.deleted = false
        this.volumeNode = audioContext.createGain()
        const instrumentData = instrumentsData[this.instrumentName]
        this.keyboardLayout = layoutData[instrumentData.notes].keyboardLayout
        this.mobileLayout = layoutData[instrumentData.notes].mobileLayout
        this.keyboardCodes = layoutData[instrumentData.notes].keyboardCodes
        
        this.keyboardLayout.forEach((noteName, i) => {
            let noteNames = {
                keyboard: noteName,
                mobile: this.mobileLayout[i]
            }
            let url = `./assets/audio/${this.instrumentName}/${i}.mp3`
            this.layout.push(new NoteData(i, noteNames, url))
        })

        this.volumeNode.gain.value = 0.8
    }
    getNoteFromCode = (code) => {
        let index = this.keyboardLayout.findIndex(e => e === String(code))
        return index !== -1 ? index : null
    }

    changeVolume = (amount) => {
        let newVolume = Number((amount / 135).toFixed(2))
        if(amount < 5) newVolume = 0
        this.volumeNode.gain.value = newVolume
    }

    play = (note, pitch) => {
        if(this.deleted) return
        let player = audioContext.createBufferSource()
        player.buffer = this.buffers[note]
        player.connect(this.volumeNode)
        player.playbackRate.value = pitch
        player.start(0)
        player.onended = () => {
            player.stop()
            player.disconnect()
        }
    }
    load = async () => {
        let emptyBuffer = audioContext.createBuffer(2, audioContext.sampleRate, audioContext.sampleRate)
        const requests = this.layout.map(note => {
            return new Promise(resolve => {
                fetch(note.url)
                    .then(result => result.arrayBuffer())
                    .then(buffer => {
                        audioContext.decodeAudioData(buffer, resolve, () => {
                            resolve(emptyBuffer)
                        })
                        .catch(e => {resolve(emptyBuffer)})
                    }).catch(e => {resolve(emptyBuffer)})
            })
        })
        this.buffers = await Promise.all(requests)
        this.loaded = true
        return true
    }
    disconnect = () =>{
        this.volumeNode.disconnect()
    }
    connect = (node) => {
        this.volumeNode.connect(node)
    }
    delete = () => {
        this.disconnect()
        this.deleted = true
        this.buffers = null
    }
}

class NoteData {
    constructor(index, noteNames, url) {
        this.index = index
        this.noteNames = noteNames
        this.url = url
        this.buffer = new ArrayBuffer(8)
    }
}