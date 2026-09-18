import { describe, expect, it } from 'vitest';
import { game } from '$game';
import {
  GENERAL_MIDI_FAMILIES,
  GENERAL_MIDI_FAMILY_ADJACENCY,
  type GeneralMidiFamily,
} from '../src/lib/games/generalMidi';
import { suggestMidiInstrument } from '../src/lib/games/midiInstrumentSuggestion';

type SuggestionFamily = GeneralMidiFamily | 'drums';

const EXPECTED_ADJACENCY: Readonly<Record<SuggestionFamily, readonly GeneralMidiFamily[]>> = {
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
};

const EXPECTED_FAMILY_OUTCOMES: Readonly<
  Record<'sky' | 'genshin', Readonly<Record<SuggestionFamily, string>>>
> = {
  sky: {
    piano: 'Piano',
    'chromatic percussion': 'Xylophone',
    organ: 'Piano',
    guitar: 'Contrabass',
    bass: 'SFX_BassSynth',
    strings: 'Cello',
    ensemble: 'Aurora',
    brass: 'Horn',
    reed: 'Saxophone',
    pipe: 'Flute',
    'synth lead': 'SFX_SineSynth',
    'synth pad': 'Aurora',
    'synth effects': 'Aurora',
    world: 'Contrabass',
    percussive: 'Drum',
    'sound effects': 'Drum',
    drums: 'Drum',
  },
  genshin: {
    piano: 'LeapingSpiritPiano',
    'chromatic percussion': 'LeapingSpiritPiano',
    organ: 'LeapingSpiritPiano',
    guitar: 'Lyre',
    bass: 'Lyre',
    strings: 'Lyre',
    ensemble: 'Lyre',
    brass: 'NightwindHorn',
    reed: 'NightwindHorn',
    pipe: 'NightwindHorn',
    'synth lead': 'LeapingSpiritPiano',
    'synth pad': 'Lyre',
    'synth effects': 'LeapingSpiritPiano',
    world: 'Lyre',
    percussive: 'DunDun',
    'sound effects': 'DunDun',
    drums: 'DunDun',
  },
};

const roster = game.instruments.list;
const definitions = game.instruments.data;
const defaultInstrument = roster[0];
const sentinelPatch = '__not_a_general_midi_patch__';

describe('MIDI instrument suggestion', () => {
  it('keeps the published General MIDI adjacency table game-independent', () => {
    expect(GENERAL_MIDI_FAMILY_ADJACENCY).toEqual(EXPECTED_ADJACENCY);
  });

  it('prefers an exact patch name case-insensitively over a conflicting family', () => {
    const patchCounts = new Map<string, number>();
    for (const name of roster) {
      const patch = definitions[name].midiName;
      patchCounts.set(patch, (patchCounts.get(patch) ?? 0) + 1);
    }

    const target = roster.find(
      (name) => name !== defaultInstrument && patchCounts.get(definitions[name].midiName) === 1
    );
    expect(target).toBeDefined();

    expect(
      suggestMidiInstrument({
        name: definitions[target!].midiName.toUpperCase(),
        family: definitions[defaultInstrument].family,
      })
    ).toBe(target);
  });

  it('breaks duplicate patch-name ties in authored roster order', () => {
    const candidatesByPatch = new Map<string, string[]>();
    for (const name of roster) {
      const patch = definitions[name].midiName;
      const candidates = candidatesByPatch.get(patch) ?? [];
      candidates.push(name);
      candidatesByPatch.set(patch, candidates);
    }
    const duplicate = [...candidatesByPatch].find(([, candidates]) => candidates.length > 1);
    expect(duplicate).toBeDefined();

    const [patch, candidates] = duplicate!;
    expect(suggestMidiInstrument({ name: patch.toUpperCase(), family: 'unknown' })).toBe(
      candidates[0]
    );
  });

  it('uses the first exact family match in authored roster order when the patch misses', () => {
    const defaultFamily = definitions[defaultInstrument].family;
    const family = definitions[
      roster.find((name) => definitions[name].family !== defaultFamily)!
    ].family;
    const firstMatch = roster.find((name) => definitions[name].family === family);

    expect(firstMatch).not.toBe(defaultInstrument);
    expect(suggestMidiInstrument({ name: sentinelPatch, family })).toBe(firstMatch);
  });

  it('falls through an absent family to its first available adjacent family', () => {
    expect(roster.some((name) => definitions[name].family === 'organ')).toBe(false);
    expect(suggestMidiInstrument({ name: sentinelPatch, family: 'organ' })).toBe(
      EXPECTED_FAMILY_OUTCOMES[game.id].organ
    );
  });

  it('uses the roster default when neither the patch nor family is known', () => {
    expect(suggestMidiInstrument({ name: sentinelPatch, family: 'unknown' })).toBe(
      defaultInstrument
    );
  });

  it('accepts an undefined percussion patch and routes the drums identity by adjacency', () => {
    expect(suggestMidiInstrument({ name: undefined, family: 'drums' })).toBe(
      EXPECTED_FAMILY_OUTCOMES[game.id].drums
    );
  });

  it('does not inspect notes while choosing a preselection', () => {
    const identity = Object.defineProperty(
      { name: sentinelPatch, family: 'organ' },
      'notes',
      {
        get(): never {
          throw new Error('instrument suggestion must not inspect notes');
        },
      }
    );

    expect(suggestMidiInstrument(identity)).toBe(EXPECTED_FAMILY_OUTCOMES[game.id].organ);
  });

  it.each([...GENERAL_MIDI_FAMILIES, 'drums'] as const)(
    'resolves the published %s family outcome for the selected game',
    (family) => {
      expect(
        suggestMidiInstrument({
          name: family === 'drums' ? undefined : sentinelPatch,
          family,
        })
      ).toBe(EXPECTED_FAMILY_OUTCOMES[game.id][family]);
    }
  );
});
