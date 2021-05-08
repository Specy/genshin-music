class Instrument {
    constructor(instrumentName) {
        this.instrumentName = instrumentName
        this.layout = []
        this.gain = GainNode
        this.keyboardLayout =
            ("Q W E R T Y U " +
            "A S D F G H J " +
            "Z X C V B N M").split(" ")

        this.mobileLayout =
            ("do re mi fa so la ti " +
            "do re mi fa so la ti " +
            "do re mi fa so la ti").split(" ")
        this.keyboardCodes = 
            ("81 87 69 82 84 89 85 " +
            "65 83 68 70 71 72 74 " +
            "90 88 67 86 66 78 77").split(" ")
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
        const requests = this.layout.map(e => fetch(e.url)
            .then(result => result.arrayBuffer())
            .then(buffer => {
                return new Promise((resolve, reject) => {
                    audioContext.decodeAudioData(buffer, resolve, reject)
                })
            }))
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