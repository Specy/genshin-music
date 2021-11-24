import { instrumentsData, layoutData, instruments } from "../appConfig"
import * as Tone from 'tone'
class Instrument {
    constructor(instrumentName) {
        this.instrumentName = instrumentName
        let instrumentNameTemp = instrumentName === undefined ? instruments[0] : instrumentName
        this.layout = []

        let instrumentData = instrumentsData[instrumentNameTemp]
        this.keyboardLayout = layoutData[instrumentData.notes].keyboardLayout
        this.mobileLayout = layoutData[instrumentData.notes].mobileLayout
        this.keyboardCodes = layoutData[instrumentData.notes].keyboardCodes
        this.players = []
        this.reverbGain = new Tone.Gain(2.5)
        this.reverb = new Tone.Convolver("./assets/audio/reverb4.wav")
        this.volumeGain = new Tone.Gain(1).toDestination()
        if (instrumentName === undefined) return
        this.keyboardLayout.forEach((noteName, i) => {
            let noteNames = {
                keyboard: noteName,
                mobile: this.mobileLayout[i]
            }
            let url = `./assets/audio/${instrumentName}/${i}.mp3`
            let note = new NoteData(i, noteNames, url)
            this.layout.push(note)
        })
        this.load()
    }
    getNoteFromCode = (code) => {
        let index = this.keyboardLayout.findIndex(e => e === String(code))
        return index !== -1 ? index : null
    }
    changeVolume = (amount) => {
        let newVolume = Number((amount / 100).toFixed(2))
        if (amount < 5) newVolume = 0
        this.volumeGain.gain(newVolume)
    }
    load = async () => {
        let promises = []
        this.players = []
        this.layout.forEach((note) => {
            promises.push(new Promise(resolve => {
                this.players.push(new Tone.Player(note.url,() => resolve()))
            }))
        })
        await Promise.all(promises)
        this.setReverb(false)
    }
    connectNotes = (node) => {
        this.players.forEach(player => {
            player.disconnect()
            player.connect(node)
        })
    }
    setReverb = (hasReverb) => {
        this.reverb.disconnect()
        this.reverbGain.disconnect()
        if (hasReverb) {
            this.connectNotes(this.reverb)
            this.reverb.connect(this.reverbGain)
            this.reverbGain.connect(this.volumeGain)
        } else {
            this.connectNotes(this.volumeGain)
        }
    }
    play = (index, pitch = 1) => {
        let player = this.players[index]
        player.playbackRate = pitch
        player.start()
    }   
    delete = () => {
        this.reverb.dispose()
        this.reverbGain.dispose()
        this.volumeGain.dispose()
        this.players.forEach(player => {
            player.dispose()
        })
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
