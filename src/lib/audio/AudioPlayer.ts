// old: src/lib/audio/AudioPlayer.ts - minimal-diff port; imports only. `$config` -> `$core/legacyConfig`
// (Pitch, type-only); `$lib/audio/Instrument` -> `$lib/audio/Instrument.svelte`; `../Providers/AudioProvider`
// -> `../providers/AudioProvider` (lowercase, same relative depth); `../Songs/SongClasses` ->
// `$core/Songs/SongClasses` (SongClasses.ts relocated under `core/` - alias avoids relative-depth math).
import type {Pitch} from "$core/legacyConfig";
import {Instrument} from '$lib/audio/Instrument.svelte'
import {AudioProvider} from "../providers/AudioProvider";
import {InstrumentData} from "$core/Songs/SongClasses";


export class AudioPlayer {
    instruments: InstrumentData[] = []
    audioInstruments: Instrument[] = []
    basePitch: Pitch = "C"

    constructor(basePitch: Pitch) {
        this.basePitch = basePitch
    }


    setBasePitch(pitch: Pitch) {
        this.basePitch = pitch
    }

    destroy() {
        this.audioInstruments.forEach(ins => {
            AudioProvider.disconnect(ins.endNode)
            ins.dispose()
        })
    }

    syncInstruments(instruments: InstrumentData[]) {
        this.instruments = instruments
        return this.loadInstruments()
    }

    async loadInstruments() {
        const {instruments, audioInstruments} = this
        //remove excess instruments
        const extraInstruments = audioInstruments.splice(instruments.length)
        extraInstruments.forEach(ins => {
            AudioProvider.disconnect(ins.endNode)
            ins.dispose()
        })
        const promises = instruments.map(async (ins, i) => {
            if (audioInstruments[i] === undefined) {
                //If it doesn't have the instrument, create it
                const instrument = new Instrument(ins.name)
                audioInstruments[i] = instrument
                await instrument.load(AudioProvider.getAudioContext())
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            }
            if (audioInstruments[i].name === ins.name) {
                //if it has the instrument and it's the same, just set the volume and reverb
                audioInstruments[i].changeVolume(ins.volume)
                AudioProvider.setReverbOfNode(audioInstruments[i].endNode, ins.reverbOverride)
                return audioInstruments[i]
            } else {
                //if it has a instrument but it's different, delete the layer and create a new one
                const old = audioInstruments[i]
                AudioProvider.disconnect(old.endNode)
                old.dispose()
                const instrument = new Instrument(ins.name)
                audioInstruments[i] = instrument
                await instrument.load(AudioProvider.getAudioContext())
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            }
        })
        return Promise.all(promises)
    }

    playNoteOfInstrument(instrumentIndex: number, note: number, pitch?: Pitch) {
        const instrumentData = this.instruments[instrumentIndex]
        this.audioInstruments[instrumentIndex].play(note, pitch ?? (instrumentData.pitch || this.basePitch))
    }

    playNotesOfInstrument(instrumentIndex: number, notes: number[], pitch?: Pitch) {
        notes.forEach(note => this.playNoteOfInstrument(instrumentIndex, note, pitch))
    }

}
