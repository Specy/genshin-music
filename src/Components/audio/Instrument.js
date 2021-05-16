import { instrumentsData, layoutData, instruments } from "../../appConfig"
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
        let index = this.keyboardCodes.findIndex(e => e == code)
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

        //thanks safari, i have to do this ugly thing
        const requests = this.layout.map(e => fetch(e.url)
            .then(result => result.arrayBuffer())
            .then(buffer => new Promise(resolve => {
                try {
                    audioContext.decodeAudioData(buffer, resolve)
                        .catch(e => {
                            resolve(new AudioBuffer({
                                length: 1,
                                sampleRate: 48000
                            }))
                        })
                } catch (e) {
                    resolve(new AudioBuffer({
                        length: 1,
                        sampleRate: 48000
                    }))
                }
            })
        ))
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