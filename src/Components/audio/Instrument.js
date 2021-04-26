class Instrument {
    constructor(instrumentName) {
        this.instrumentName = instrumentName
        this.layout = []
        this.keyboardLayout =
            ("Q W E R T Y U " +
                "A S D F G H J " +
                "Z X C V B N M").split(" ")

        this.mobileLayout =
            ("do re mi fa so la ti " +
                "do re mi fa so la ti " +
                "do re mi fa so la ti").split(" ")
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
    setBuffers = (bufferArray) => {
        bufferArray.forEach((buffer, i) => {
            this.layout[i].buffer = buffer
        })
    }
    load = async (audioContext) => {
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