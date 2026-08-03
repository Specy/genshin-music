import type { Pitch } from '$core/legacyConfig';
import { Instrument } from '$lib/audio/Instrument.svelte';
import { AudioProvider } from '../providers/AudioProvider';
import { InstrumentData } from '$core/Songs/SongClasses';

export class AudioPlayer {
  instruments: InstrumentData[] = [];
  audioInstruments: Instrument[] = [];
  basePitch: Pitch = 'C';

  constructor(basePitch: Pitch) {
    this.basePitch = basePitch;
  }

  setBasePitch(pitch: Pitch) {
    this.basePitch = pitch;
  }

  destroy() {
    this.audioInstruments.forEach((ins) => {
      AudioProvider.disconnect(ins.endNode);
      ins.dispose();
    });
  }

  syncInstruments(instruments: InstrumentData[]) {
    this.instruments = instruments;
    return this.loadInstruments();
  }

  async loadInstruments() {
    const { instruments, audioInstruments } = this;
    //remove excess instruments
    const extraInstruments = audioInstruments.splice(instruments.length);
    extraInstruments.forEach((ins) => {
      AudioProvider.disconnect(ins.endNode);
      ins.dispose();
    });
    const promises = instruments.map(async (ins, i) => {
      if (audioInstruments[i] === undefined) {
        //If it doesn't have the instrument, create it
        const instrument = new Instrument(ins.name);
        audioInstruments[i] = instrument;
        await instrument.load(AudioProvider.getAudioContext());
        AudioProvider.connect(instrument.endNode, ins.reverbOverride);
        instrument.changeVolume(ins.volume);
        return instrument;
      }
      if (audioInstruments[i].name === ins.name) {
        //if it has the instrument and it's the same, just set the volume and reverb
        audioInstruments[i].changeVolume(ins.volume);
        AudioProvider.setReverbOfNode(audioInstruments[i].endNode, ins.reverbOverride);
        return audioInstruments[i];
      } else {
        //if it has a instrument but it's different, delete the layer and create a new one
        const old = audioInstruments[i];
        AudioProvider.disconnect(old.endNode);
        old.dispose();
        const instrument = new Instrument(ins.name);
        audioInstruments[i] = instrument;
        await instrument.load(AudioProvider.getAudioContext());
        AudioProvider.connect(instrument.endNode, ins.reverbOverride);
        instrument.changeVolume(ins.volume);
        return instrument;
      }
    });
    return Promise.all(promises);
  }

  /** Play a Note Id on one instrument — resolves the id to that instrument's button (stranded = silent). */
  playNoteOfInstrument(instrumentIndex: number, id: number, pitch?: Pitch) {
    const instrumentData = this.instruments[instrumentIndex];
    const audioInstrument = this.audioInstruments[instrumentIndex];
    if (!audioInstrument || !instrumentData) return;
    const button = audioInstrument.getButtonFromId(id);
    if (button === -1) return;
    audioInstrument.play(button, pitch ?? (instrumentData.pitch || this.basePitch));
  }

  playNotesOfInstrument(instrumentIndex: number, ids: number[], pitch?: Pitch) {
    ids.forEach((id) => this.playNoteOfInstrument(instrumentIndex, id, pitch));
  }

  /** Play a raw BUTTON position on one instrument (UI surfaces that are button-addressed, e.g. MIDI setup). */
  playButtonOfInstrument(instrumentIndex: number, button: number, pitch?: Pitch) {
    const instrumentData = this.instruments[instrumentIndex];
    const audioInstrument = this.audioInstruments[instrumentIndex];
    if (!audioInstrument || !instrumentData) return;
    audioInstrument.play(button, pitch ?? (instrumentData.pitch || this.basePitch));
  }

  /** Like playNoteOfInstrument, but holds for `durationMs` when the instrument sustains (VSRG hold notes); one-shot otherwise. */
  pressNoteOfInstrument(instrumentIndex: number, id: number, durationMs?: number, pitch?: Pitch) {
    const instrumentData = this.instruments[instrumentIndex];
    const audioInstrument = this.audioInstruments[instrumentIndex];
    if (!audioInstrument || !instrumentData) return;
    const button = audioInstrument.getButtonFromId(id);
    if (button === -1) return;
    const resolvedPitch = pitch ?? (instrumentData.pitch || this.basePitch);
    if (durationMs !== undefined && durationMs > 0 && audioInstrument.supportsSustain) {
      audioInstrument.pressNote(button, resolvedPitch, { durationMs });
    } else {
      audioInstrument.play(button, resolvedPitch);
    }
  }

  /** Release every held/scheduled voice on every instrument (playback stop). */
  releaseAllNotes() {
    this.audioInstruments.forEach((instrument) => instrument.releaseAllNotes());
  }
}
