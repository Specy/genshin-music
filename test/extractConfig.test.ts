// TEMPORARY (ADR-0003 step 3): one-time extractor emitting the folder-based config
// (game.json / presets.json / instruments/<Name>/meta.json) from the current
// GameDefinition. Runs per game via PUBLIC_GAME like every test. Deleted after the
// conversion lands. EXTRACT_CONFIG=true writes files; otherwise it only verifies
// the conversion assumptions and prints the preset grouping.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { game } from '$game';
import { i18n_en } from '$i18n/locales/en';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.join(HERE, '..', 'src', 'lib', 'games', game.id);
const WRITE = process.env.EXTRACT_CONFIG === 'true';

const SHAPE_BY_COUNT: Record<string, Record<number, string>> = {
  genshin: { 21: 'genshin-3x7', 8: 'genshin-2x4' },
  sky: { 15: 'sky-3x5', 8: 'sky-2x4', 6: 'sky-2x3' },
};

// Preset names reviewed by hand from the printed grouping (deterministic given the
// current data): key = JSON of the group's member list.
const PRESET_NAMES: Record<string, Record<string, string>> = {
  genshin: {
    '["Lyre","Zither","Old-Zither","LeapingSpiritPiano","HarmonicKey"]': 'standard-21',
    '["Ukulele","LingeringEuphonia"]': 'ukulele-21',
    '["DunDun","DjemDjemDrum"]': 'drums-8',
  },
  sky: {
    '["Piano","GrandPiano","Contrabass","Guitar","LightGuitar","Harp","Horn","Trumpet","Pipa","WinterPiano","Xylophone","Flute","Panflute","Ocarina","MantaOcarina","Aurora","Kalimba","ToyUkulele","SFX_BirdCall","SFX_CrabCall","SFX_FishCall","SFX_SpiritMantaCall","SFX_JellyCall","SFX_MantaCall","SFX_MothCall"]':
      'standard-15',
    '["Drum","DunDun"]': 'drums-8',
    '["SFX_SineSynth","SFX_BassSynth","SFX_ChimeSynth","SFX_TR-909"]': 'synth-8',
  },
};

type NoteStruct = {
  midi: number;
  baseNote: string;
  icon: string;
  loop?: { start: number; end: number };
};

function noteStructs(name: string): NoteStruct[] {
  const data = game.instruments.data[name];
  const structs: NoteStruct[] = [];
  for (let i = 0; i < data.notes; i++) {
    const struct: NoteStruct = {
      midi: data.midiNotes[i],
      baseNote: data.baseNotes[i],
      icon: data.icons[i],
    };
    const loop = data.sustain?.noteLoops?.[i];
    if (loop) struct.loop = loop;
    structs.push(struct);
  }
  return structs;
}

describe('folder config extraction', () => {
  it('conversion assumptions hold', () => {
    for (const name of game.instruments.list) {
      const data = game.instruments.data[name];
      expect(data, name).toBeDefined();
      // parallel arrays cover the note count exactly
      expect(data.baseNotes.length, `${name} baseNotes`).toBeGreaterThanOrEqual(data.notes);
      expect(data.icons.length, `${name} icons`).toBeGreaterThanOrEqual(data.notes);
      expect(data.midiNotes.length, `${name} midiNotes`).toBeGreaterThanOrEqual(data.notes);
      // every instrument maps to a Shape
      expect(SHAPE_BY_COUNT[game.id][data.notes], `${name} shape for ${data.notes}`).toBeTruthy();
      // display name exists in the en locale
      expect(
        (i18n_en.instruments as Record<string, string>)[name],
        `${name} displayName`
      ).toBeTruthy();
      // audio folder exists with every sample 0..notes-1 (post-move: the
      // instrument folder itself — static/ only holds the gitignored overlay)
      const audioDir = path.join(GAME_DIR, 'instruments', name);
      expect(fs.existsSync(audioDir), `${name} audio dir`).toBe(true);
      for (let i = 0; i < data.notes; i++) {
        expect(fs.existsSync(path.join(audioDir, `${i}.mp3`)), `${name}/${i}.mp3`).toBe(true);
      }
    }
    // Aurora_Short (sky): dropped — verify it is behaviorally inert first
    if (game.id === 'sky') {
      const short = game.instruments.data['Aurora_Short'];
      const dflt = game.instruments.data[game.instruments.list[0]];
      expect(short).toBeDefined();
      expect(game.instruments.list.includes('Aurora_Short')).toBe(false);
      expect(short.midiNotes).toEqual(dflt.midiNotes);
    }
  });

  it('extracts folder config', () => {
    // ---- group instruments by identical note structs (loop-free ones only) ----
    const groups = new Map<string, string[]>();
    for (const name of game.instruments.list) {
      const structs = noteStructs(name);
      if (structs.some((s) => s.loop)) continue; // per-note loops → always inline
      const key = JSON.stringify(structs);
      groups.set(key, [...(groups.get(key) ?? []), name]);
    }
    const presetByInstrument = new Map<string, string>();
    const presets: Record<string, NoteStruct[]> = {};
    for (const [key, members] of groups) {
      if (members.length < 2) continue;
      const presetName = PRESET_NAMES[game.id][JSON.stringify(members)];
      if (!presetName) {
        console.log(`[extract] UNNAMED preset group (${game.id}):`, JSON.stringify(members));
        continue;
      }
      presets[presetName] = JSON.parse(key);
      for (const m of members) presetByInstrument.set(m, presetName);
    }
    console.log(
      `[extract] ${game.id}: ${Object.keys(presets).length} presets, ` +
        `${game.instruments.list.length - presetByInstrument.size} inline instruments`
    );

    // every group of size >= 2 must have a reviewed name before writing
    const unnamed = [...groups.values()].filter(
      (m) => m.length >= 2 && !PRESET_NAMES[game.id][JSON.stringify(m)]
    );
    expect(unnamed, 'unnamed preset groups — add to PRESET_NAMES').toEqual([]);

    // ---- per-instrument meta.json ----
    const metas = new Map<string, object>();
    for (const name of game.instruments.list) {
      const data = game.instruments.data[name];
      const sustain = data.sustain
        ? {
            release: data.sustain.release,
            ...(data.sustain.crossfade !== undefined ? { crossfade: data.sustain.crossfade } : {}),
            loop: data.sustain.loop,
          }
        : undefined;
      metas.set(name, {
        displayName: (i18n_en.instruments as Record<string, string>)[name],
        family: data.family,
        midiName: data.midiName,
        ...(data.fill !== undefined ? { fill: data.fill } : {}),
        ...(data.clickColor !== undefined ? { clickColor: data.clickColor } : {}),
        shape: SHAPE_BY_COUNT[game.id][data.notes],
        ...(sustain !== undefined ? { sustain } : {}),
        notes: presetByInstrument.get(name) ?? noteStructs(name),
      });
    }

    // ---- game.json ----
    const gameJson = {
      id: game.id,
      storageId: game.storageId,
      display: game.display,
      meta: game.meta,
      notes: {
        perColumn: game.notes.perColumn,
        perRow: game.notes.perRow,
        cssClasses: game.notes.cssClasses,
        nameTypes: game.notes.nameTypes,
        composerPositions: game.notes.composerPositions,
        importPositions: game.notes.importPositions,
        animationDelayMs: game.notes.animationDelayMs,
        composerRowHeightScale: game.notes.composerRowHeightScale,
        defaultIcon: game.notes.defaultIcon,
        visualNameCasing: game.notes.visualNameCasing,
      },
      instruments: {
        list: game.instruments.list,
        defaultVolume: game.instruments.defaultVolume,
      },
      midi: game.midi,
      composer: game.composer,
      themes: game.themes,
      settings: game.settings,
      features: game.features,
      i18n: {
        updateMessage: game.i18n.updateMessage,
        ...(game.i18n.overrides !== undefined ? { overrides: game.i18n.overrides } : {}),
      },
    };

    if (!WRITE) return;
    const write = (file: string, value: unknown) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
    };
    write(path.join(GAME_DIR, 'game.json'), gameJson);
    write(path.join(GAME_DIR, 'presets.json'), presets);
    for (const [name, meta] of metas) {
      write(path.join(GAME_DIR, 'instruments', name, 'meta.json'), meta);
    }
    console.log(`[extract] ${game.id}: wrote game.json, presets.json, ${metas.size} meta.json`);
  });
});
