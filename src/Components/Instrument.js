import { instrumentsData, layoutData, instruments } from "../appConfig"
class Instrument {
    constructor(instrumentName) {
        this.instrumentName = instrumentName
        let instrumentNameTemp = instrumentName === undefined ? instruments[0] : instrumentName
        this.layout = []
        this.gain = GainNode
        let instrumentData = instrumentsData[instrumentNameTemp]
        this.keyboardLayout = layoutData[instrumentData.notes].keyboardLayout

        this.mobileLayout = layoutData[instrumentData.notes].mobileLayout
        this.keyboardCodes = layoutData[instrumentData.notes].keyboardCodes
        let i = 0
        if (instrumentName === undefined) return
        for (const noteName of this.keyboardLayout) {
            let noteNames = {
                keyboard: noteName,
                mobile: this.mobileLayout[i]
            }
            let url = `./assets/audio/${instrumentName}/${i}.mp3`
            let note = new NoteData(i, noteNames, url)
            this.layout.push(note)
            i++
        }

    }
    getNoteFromCode = (code) => {
        let index = this.keyboardCodes.findIndex(e => e === String(code))
        return index !== -1 ? index : null
    }
    setBuffers = (bufferArray) => {
        bufferArray.forEach((buffer, i) => {
            this.layout[i].buffer = buffer
        })
    }
    changeVolume = (amount) => {
        this.gain.gain.value = amount / 100
    }
    load = async (audioContext) => {
        this.gain = audioContext.createGain()
        this.gain.gain.value = 1
        let emptyBuffer = audioContext.createBuffer(2, audioContext.sampleRate, audioContext.sampleRate)
        //thanks safari, i have to do this ugly thing
        const requests = this.layout.map(e => {
            return new Promise(resolve => {
                fetch(e.url)
                    .then(result => result.arrayBuffer())
                    .then(buffer => {
                        audioContext.decodeAudioData(buffer, resolve, () => {
                            resolve(emptyBuffer)
                        })
                            .catch(e => {
                                resolve(emptyBuffer)
                            })
                    }).catch(e => {
                        resolve(emptyBuffer)
                    })
            })
        })
        let buffers = await Promise.all(requests)
        this.setBuffers(buffers)
        return true
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
export default Instrument
