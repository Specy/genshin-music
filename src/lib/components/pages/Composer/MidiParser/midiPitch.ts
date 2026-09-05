import { PITCHES } from '$core/sharedConfig';
import { BASE_NOTE_PITCH_CLASSES, type Pitch } from '$lib/games/types';

/**
 * Convert any standard MIDI key spelling to the app's canonical, flat-spelled Basepoint.
 * Tone preserves the spelling carried by the key-signature event (`F#`, `C#`, `Cb`, ...), while
 * the song model deliberately exposes only the twelve spellings in PITCHES. Comparing the strings
 * directly therefore loses three valid major keys and makes the importer fall back to C.
 */
export function canonicalMidiPitch(key: string | undefined): Pitch | undefined {
  if (key === undefined) return undefined;
  const pitchClass = BASE_NOTE_PITCH_CLASSES.get(key);
  return pitchClass === undefined ? undefined : PITCHES[pitchClass];
}
