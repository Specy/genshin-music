import { describe, expect, it } from 'vitest';
import { Midi } from '../src/lib/core/Songs/midiConstructor';
import {
  GENERAL_MIDI_FAMILIES,
  GENERAL_MIDI_PATCH_NAMES,
  isGeneralMidiFamily,
  isGeneralMidiPatchName,
} from '../src/lib/games/generalMidi';
import { gamesMeta } from '../src/lib/games/registry';

describe('General MIDI vocabulary', () => {
  it('matches every @tonejs/midi patch name and program number', () => {
    expect(GENERAL_MIDI_PATCH_NAMES).toHaveLength(128);
    expect(new Set(GENERAL_MIDI_PATCH_NAMES).size).toBe(128);

    const track = new Midi().addTrack();
    for (const [program, name] of GENERAL_MIDI_PATCH_NAMES.entries()) {
      track.instrument.name = name;
      expect(track.instrument.number, name).toBe(program);
      expect(track.instrument.name, `program ${program}`).toBe(name);
    }
  });

  it('matches every @tonejs/midi melodic family block', () => {
    expect(GENERAL_MIDI_FAMILIES).toHaveLength(16);
    expect(new Set(GENERAL_MIDI_FAMILIES).size).toBe(16);

    const track = new Midi().addTrack();
    for (const [block, family] of GENERAL_MIDI_FAMILIES.entries()) {
      track.instrument.number = block * 8;
      expect(track.instrument.family, `program ${block * 8}`).toBe(family);
    }
  });

  it('validates patch names and authored families exactly and independently', () => {
    expect(isGeneralMidiPatchName('acoustic grand piano')).toBe(true);
    expect(isGeneralMidiPatchName('Acoustic Grand Piano')).toBe(false);
    expect(isGeneralMidiPatchName('drums')).toBe(false);

    expect(isGeneralMidiFamily('piano')).toBe(true);
    expect(isGeneralMidiFamily('Piano')).toBe(false);
    expect(isGeneralMidiFamily('drums')).toBe(false);

    // Both are valid even though this patch belongs to a different GM block. The
    // registry intentionally validates the two authored fields without correlating them.
    expect(isGeneralMidiPatchName('contrabass')).toBe(true);
    expect(isGeneralMidiFamily('guitar')).toBe(true);
  });

  it('accepts every shipped instrument through the registry vocabulary', () => {
    for (const { instruments } of Object.values(gamesMeta)) {
      for (const instrument of Object.values(instruments)) {
        expect(isGeneralMidiPatchName(instrument.midiName), instrument.name).toBe(true);
        expect(isGeneralMidiFamily(instrument.family), instrument.name).toBe(true);
      }
    }
  });
});
