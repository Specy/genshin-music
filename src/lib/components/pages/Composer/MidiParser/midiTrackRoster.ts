import type { Track } from '@tonejs/midi';
import { InstrumentData } from '$core/Songs/SongClasses';
import { BASE_LAYER_LIMIT, PITCHES } from '$core/sharedConfig';
import type { Pitch } from '$lib/games/types';
import { suggestMidiInstrument } from '$lib/games/midiInstrumentSuggestion';

export type CustomTrack = {
  track: Track;
  /** The track's position in the unfiltered MIDI file. */
  originalIndex: number;
  selected: boolean;
  /** Raw name carried by the file; empty when the row's name was synthesised. */
  rawName: string;
  /** Display name, including the generated `Track n.N` fallback. */
  name: string;
  /** The complete layer configuration this track will contribute to the generated roster. */
  instrument: InstrumentData;
  numberOfAccidentals: number;
  /** Notes the chosen instrument cannot voice, including directionless gaps and invalid values. */
  outOfRange: number;
  localOffset: number | null;
  maxScaling: number;
  outOfRangeBounds: {
    lower: number;
    upper: number;
  };
};

export type MidiTrackName = {
  rawName: string;
  name: string;
  alias: string;
  pitch: Pitch | '';
};

/**
 * Split the Basepoint prefix written by ComposedSong.toMidi without treating display fallback
 * text as file metadata. Only the first prefix is consumed, so the label after it is preserved
 * byte-for-byte even when it contains another ` | ` delimiter.
 */
export function parseMidiTrackName(rawName: string, originalIndex: number): MidiTrackName {
  const name = rawName || `Track n.${originalIndex + 1}`;
  if (!rawName) return { rawName, name, alias: '', pitch: '' };

  for (const pitch of PITCHES) {
    const prefix = `${pitch} | `;
    if (rawName.startsWith(prefix)) {
      return {
        rawName,
        name,
        alias: rawName.slice(prefix.length),
        pitch,
      };
    }
  }

  return { rawName, name, alias: rawName, pitch: '' };
}

/**
 * Build one editable layer candidate for every note-bearing MIDI track.
 *
 * Metadata is indexed by the ORIGINAL MIDI track index, before silent tracks are removed. Our
 * exporter writes one MIDI track per layer including silent ones, so compacting this lookup would
 * apply every layer configuration after a silent track to the wrong notes. The generated roster
 * itself is compacted later, from the selected candidates only.
 */
export function buildMidiTrackRoster(
  midiTracks: readonly Track[],
  metadataInstruments: readonly InstrumentData[] | null
): CustomTrack[] {
  return midiTracks
    .map((track, originalIndex) => ({ track, originalIndex }))
    .filter(({ track }) => track.notes.length > 0)
    .map(({ track, originalIndex }, noteBearingIndex) => {
      const rawName = typeof track.name === 'string' ? track.name : '';
      const parsedName = parseMidiTrackName(rawName, originalIndex);
      const metadataInstrument = metadataInstruments?.[originalIndex];
      const instrument = metadataInstrument
        ? metadataInstrument.clone()
        : new InstrumentData({
            name: suggestMidiInstrument(track.instrument),
            alias: parsedName.alias,
            pitch: parsedName.pitch,
          });

      return {
        track,
        originalIndex,
        selected: noteBearingIndex < BASE_LAYER_LIMIT,
        rawName: parsedName.rawName,
        name: parsedName.name,
        instrument,
        numberOfAccidentals: 0,
        outOfRange: 0,
        maxScaling: 0,
        outOfRangeBounds: {
          lower: 0,
          upper: 0,
        },
        localOffset: null,
      };
    });
}
