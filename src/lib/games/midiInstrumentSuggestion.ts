// Suggested Instrument for a foreign MIDI track (ADR-0012). The current game's authored roster is
// the complete search space: unlisted registry folders are loadable by saved songs but are not
// choices this game offers, and roster order is the deliberate melody-first/SFX-last tie-break.
import { game } from '$game';
import { GENERAL_MIDI_FAMILY_ADJACENCY, isGeneralMidiTrackFamily } from './generalMidi';

/** The two identity fields @tonejs/midi exposes; percussion patch names may be absent. */
export type MidiInstrumentIdentity = {
  name?: string;
  family?: string;
};

/**
 * Choose a current-game instrument without inspecting the track's notes:
 * exact patch (case-insensitive), then exact/adjacent family, then roster default.
 */
export function suggestMidiInstrument(identity: MidiInstrumentIdentity): string {
  const roster = game.instruments.list;
  const definitions = game.instruments.data;
  const patchName = typeof identity.name === 'string' ? identity.name.toLowerCase() : null;

  if (patchName) {
    const patchMatch = roster.find(
      (instrumentName) => definitions[instrumentName]?.midiName.toLowerCase() === patchName
    );
    if (patchMatch) return patchMatch;
  }

  if (typeof identity.family === 'string') {
    const familyMatch = roster.find(
      (instrumentName) => definitions[instrumentName]?.family === identity.family
    );
    if (familyMatch) return familyMatch;
  }

  if (isGeneralMidiTrackFamily(identity.family)) {
    for (const family of GENERAL_MIDI_FAMILY_ADJACENCY[identity.family]) {
      const adjacentMatch = roster.find(
        (instrumentName) => definitions[instrumentName]?.family === family
      );
      if (adjacentMatch) return adjacentMatch;
    }
  }

  return roster[0];
}
