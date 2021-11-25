import { instrumentsData, layoutData, instruments,audioContext } from "../appConfig"
class Instrument3 {
    constructor(instrumentName) {
        this.instrumentName = instrumentName === undefined ? instruments[0] : instrumentName
        this.layout = []
        this.buffers = []
        this.volumeNode = audioContext.createGain()
        let instrumentData = instrumentsData[this.instrumentName]

        this.keyboardLayout = layoutData[instrumentData.notes].keyboardLayout
        this.mobileLayout = layoutData[instrumentData.notes].mobileLayout
        this.keyboardCodes = layoutData[instrumentData.notes].keyboardCodes
        
        this.keyboardLayout.forEach((noteName, i) => {
            let noteNames = {
                keyboard: noteName,
                mobile: this.mobileLayout[i]
            }
            let url = `./assets/audio/${instrumentName}/${i}.mp3`
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
        //thanks safari, i have to do this ugly thing
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
        return true
    }
    disconnect = () =>{
        this.volumeNode.disconnect()
    }
    connect = (node) => {
        this.volumeNode.connect(node)
    }
    delete = () => {
        //TODO Disconnect all nodes and notes etc
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
export default Instrument3