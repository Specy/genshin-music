// General MIDI Level 1 vocabulary as exposed by @tonejs/midi 2.x.
//
// Keep this local rather than importing the package's private InstrumentMaps module:
// the package does not export that module as public API, and the game registry must stay
// a small, DOM-free data dependency that is safe to evaluate during prerendering and in
// the service worker. The order of the patch names is their zero-based MIDI program number.
export const GENERAL_MIDI_PATCH_NAMES = [
  'acoustic grand piano',
  'bright acoustic piano',
  'electric grand piano',
  'honky-tonk piano',
  'electric piano 1',
  'electric piano 2',
  'harpsichord',
  'clavi',
  'celesta',
  'glockenspiel',
  'music box',
  'vibraphone',
  'marimba',
  'xylophone',
  'tubular bells',
  'dulcimer',
  'drawbar organ',
  'percussive organ',
  'rock organ',
  'church organ',
  'reed organ',
  'accordion',
  'harmonica',
  'tango accordion',
  'acoustic guitar (nylon)',
  'acoustic guitar (steel)',
  'electric guitar (jazz)',
  'electric guitar (clean)',
  'electric guitar (muted)',
  'overdriven guitar',
  'distortion guitar',
  'guitar harmonics',
  'acoustic bass',
  'electric bass (finger)',
  'electric bass (pick)',
  'fretless bass',
  'slap bass 1',
  'slap bass 2',
  'synth bass 1',
  'synth bass 2',
  'violin',
  'viola',
  'cello',
  'contrabass',
  'tremolo strings',
  'pizzicato strings',
  'orchestral harp',
  'timpani',
  'string ensemble 1',
  'string ensemble 2',
  'synthstrings 1',
  'synthstrings 2',
  'choir aahs',
  'voice oohs',
  'synth voice',
  'orchestra hit',
  'trumpet',
  'trombone',
  'tuba',
  'muted trumpet',
  'french horn',
  'brass section',
  'synthbrass 1',
  'synthbrass 2',
  'soprano sax',
  'alto sax',
  'tenor sax',
  'baritone sax',
  'oboe',
  'english horn',
  'bassoon',
  'clarinet',
  'piccolo',
  'flute',
  'recorder',
  'pan flute',
  'blown bottle',
  'shakuhachi',
  'whistle',
  'ocarina',
  'lead 1 (square)',
  'lead 2 (sawtooth)',
  'lead 3 (calliope)',
  'lead 4 (chiff)',
  'lead 5 (charang)',
  'lead 6 (voice)',
  'lead 7 (fifths)',
  'lead 8 (bass + lead)',
  'pad 1 (new age)',
  'pad 2 (warm)',
  'pad 3 (polysynth)',
  'pad 4 (choir)',
  'pad 5 (bowed)',
  'pad 6 (metallic)',
  'pad 7 (halo)',
  'pad 8 (sweep)',
  'fx 1 (rain)',
  'fx 2 (soundtrack)',
  'fx 3 (crystal)',
  'fx 4 (atmosphere)',
  'fx 5 (brightness)',
  'fx 6 (goblins)',
  'fx 7 (echoes)',
  'fx 8 (sci-fi)',
  'sitar',
  'banjo',
  'shamisen',
  'koto',
  'kalimba',
  'bag pipe',
  'fiddle',
  'shanai',
  'tinkle bell',
  'agogo',
  'steel drums',
  'woodblock',
  'taiko drum',
  'melodic tom',
  'synth drum',
  'reverse cymbal',
  'guitar fret noise',
  'breath noise',
  'seashore',
  'bird tweet',
  'telephone ring',
  'helicopter',
  'applause',
  'gunshot',
] as const;

export type GeneralMidiPatchName = (typeof GENERAL_MIDI_PATCH_NAMES)[number];

// The 16 families are the eight-program GM blocks. `@tonejs/midi` reports the
// separate value `drums` for channel 9, but that is a runtime track identity rather
// than an authored General MIDI family and deliberately does not belong here.
export const GENERAL_MIDI_FAMILIES = [
  'piano',
  'chromatic percussion',
  'organ',
  'guitar',
  'bass',
  'strings',
  'ensemble',
  'brass',
  'reed',
  'pipe',
  'synth lead',
  'synth pad',
  'synth effects',
  'world',
  'percussive',
  'sound effects',
] as const;

export type GeneralMidiFamily = (typeof GENERAL_MIDI_FAMILIES)[number];

/** Tone's melodic families plus its special channel-9 identity. */
export type GeneralMidiTrackFamily = GeneralMidiFamily | 'drums';

/**
 * Nearest useful authored families for each incoming General MIDI family. Every melodic row starts
 * with itself, so an exact family match and its fallbacks can share one ordered walk. `drums` is an
 * incoming track identity only; registry validation deliberately does not accept it as authored
 * instrument metadata.
 */
export const GENERAL_MIDI_FAMILY_ADJACENCY = {
  piano: ['piano', 'chromatic percussion', 'guitar', 'strings'],
  'chromatic percussion': ['chromatic percussion', 'piano', 'percussive'],
  organ: ['organ', 'piano', 'reed', 'ensemble'],
  guitar: ['guitar', 'strings', 'piano'],
  bass: ['bass', 'guitar', 'strings', 'piano'],
  strings: ['strings', 'ensemble', 'guitar', 'piano'],
  ensemble: ['ensemble', 'strings', 'pipe', 'piano'],
  brass: ['brass', 'reed', 'pipe', 'ensemble'],
  reed: ['reed', 'pipe', 'brass', 'ensemble'],
  pipe: ['pipe', 'reed', 'ensemble', 'brass'],
  'synth lead': ['synth lead', 'pipe', 'reed', 'piano'],
  'synth pad': ['synth pad', 'ensemble', 'strings', 'piano'],
  'synth effects': ['synth effects', 'synth pad', 'ensemble', 'piano'],
  world: ['world', 'guitar', 'strings', 'pipe', 'percussive'],
  percussive: ['percussive', 'chromatic percussion', 'piano'],
  'sound effects': ['sound effects', 'synth effects', 'percussive'],
  drums: ['percussive', 'sound effects', 'chromatic percussion'],
} as const satisfies Record<GeneralMidiTrackFamily, readonly GeneralMidiFamily[]>;

const PATCH_NAME_SET: ReadonlySet<string> = new Set(GENERAL_MIDI_PATCH_NAMES);
const FAMILY_SET: ReadonlySet<string> = new Set(GENERAL_MIDI_FAMILIES);

export function isGeneralMidiPatchName(value: unknown): value is GeneralMidiPatchName {
  return typeof value === 'string' && PATCH_NAME_SET.has(value);
}

export function isGeneralMidiFamily(value: unknown): value is GeneralMidiFamily {
  return typeof value === 'string' && FAMILY_SET.has(value);
}

export function isGeneralMidiTrackFamily(value: unknown): value is GeneralMidiTrackFamily {
  return value === 'drums' || isGeneralMidiFamily(value);
}
