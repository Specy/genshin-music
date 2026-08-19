// Folder-config filesystem invariants (ADR-0003). Complements the validation that
// already runs at module eval: the registry throws on unknown presets / listed-but-
// missing folders, and defineGame throws on unknown Shapes, capacity overflows and
// missing glyphs. What ONLY a node context can check is the disk itself — that every
// note's sample file actually exists next to its meta.json (the overlay copies
// exactly these files to the URL-locked static paths, so a missing file here is a
// 404 in production).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gamesMeta, nearestChromaticMatch, normalizeNotes } from '$lib/games/registry';
import { BASE_NOTE_PITCH_CLASSES, BASE_NOTES } from '$lib/games/types';
import { baseNoteText, DO_RE_MI_NOTE_SCALE, NOTE_SCALE, PITCHES } from '$core/sharedConfig';
import type { NoteMetaJson } from '$lib/games/schema';
import { game } from '$game';

const GAMES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'games');

describe('game folders (all games, via the registry)', () => {
  it('registry discovered the active game', () => {
    expect(Object.keys(gamesMeta).length).toBeGreaterThanOrEqual(1);
    expect(gamesMeta[game.id]).toBeTruthy();
  });

  it('every normalized note has its sample file on disk', () => {
    for (const [gameId, meta] of Object.entries(gamesMeta)) {
      for (const instrument of Object.values(meta.instruments)) {
        const dir = path.join(GAMES_DIR, gameId, 'instruments', instrument.name);
        expect(fs.existsSync(dir), `${gameId}/${instrument.name} folder`).toBe(true);
        for (const note of instrument.notes) {
          expect(
            fs.existsSync(path.join(dir, note.file)),
            `${gameId}/${instrument.name}/${note.file}`
          ).toBe(true);
        }
      }
    }
  });

  it('every instrument folder with a meta.json is known to the registry', () => {
    // A folder the glob missed (bad meta.json name, nesting typo) would silently
    // drop an instrument; surface it here.
    for (const [gameId, meta] of Object.entries(gamesMeta)) {
      const instrumentsDir = path.join(GAMES_DIR, gameId, 'instruments');
      if (!fs.existsSync(instrumentsDir)) continue;
      for (const folder of fs.readdirSync(instrumentsDir)) {
        if (!fs.existsSync(path.join(instrumentsDir, folder, 'meta.json'))) continue;
        expect(meta.instruments[folder], `${gameId}/${folder} missing from registry`).toBeTruthy();
      }
    }
  });

  it('active game: every instrument Shape exists with sufficient capacity (defineGame contract)', () => {
    // defineGame would have thrown at import if this failed — this pins the
    // contract observably per game (npm test runs both PUBLIC_GAMEs).
    for (const instrument of Object.values(game.instruments.data)) {
      const shape = game.shapes[instrument.shape];
      expect(shape, `${instrument.name} shape ${instrument.shape}`).toBeTruthy();
      expect(instrument.notes.length).toBeLessThanOrEqual(shape.capacity);
      for (const labels of Object.values(shape.labels)) {
        expect(labels.length, `${shape.id} label set length`).toBe(shape.capacity);
      }
    }
  });
});

// ADR-0007 Phase A. Everything here reads `gamesMeta`, which globs EVERY game folder, so
// both games' data is checked under either PUBLIC_GAME.
describe('Sounding Pitch derivation (ADR-0007)', () => {
  const notesOf = (gameId: 'genshin' | 'sky', instrument: string) =>
    gamesMeta[gameId].instruments[instrument].notes;

  it('every base-note spelling but the empty label names a semitone class', () => {
    // The two tables are authored side by side in games/types.ts precisely because a
    // spelling missing here silently becomes "not a bare pitch class" and rejects an
    // instrument that used it.
    for (const spelling of BASE_NOTES) {
      const pitchClass = BASE_NOTE_PITCH_CLASSES.get(spelling);
      if (spelling === '') {
        expect(pitchClass, "'' names no pitch, so it can only label an Assigned Button").toBe(
          undefined
        );
        continue;
      }
      expect(pitchClass, `no semitone class for "${spelling}"`).toBeTypeOf('number');
    }
  });

  it('nearestChromaticMatch takes the nearer neighbour in either direction', () => {
    expect(nearestChromaticMatch(72, 0)).toBe(72); // C on 72: already there
    expect(nearestChromaticMatch(74, 1)).toBe(73); // Db on 74: down one
    expect(nearestChromaticMatch(83, 10)).toBe(82); // Bb on 83: down one
    expect(nearestChromaticMatch(71, 0)).toBe(72); // C on 71: up one, across the octave
    expect(nearestChromaticMatch(72, 11)).toBe(71); // B on 72: down one, across the octave
    expect(nearestChromaticMatch(60, 7)).toBe(55); // G on 60: down five beats up seven
  });

  it('a tritone label is ambiguous, and nothing else can be farther than five semitones', () => {
    expect(nearestChromaticMatch(72, 6)).toBe(null); // Gb/F# on C
    expect(nearestChromaticMatch(67, 1)).toBe(null); // Db on G
    // A semitone class repeats every 12 semitones, so a match within 6 of ANY nominal always
    // exists: the ">6 apart" failure the design lists cannot occur, and the ±6 tie is the
    // whole of the rule. Exhaustive over every (nominal class, label class) pair.
    for (let nominal = 60; nominal < 72; nominal++) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        const match = nearestChromaticMatch(nominal, pitchClass);
        if (match === null) {
          expect((((pitchClass - nominal) % 12) + 12) % 12).toBe(6);
          continue;
        }
        expect(Math.abs(match - nominal), `${nominal} -> class ${pitchClass}`).toBeLessThanOrEqual(
          5
        );
        expect(((match % 12) + 12) % 12).toBe(pitchClass);
      }
    }
  });

  it("Vintage-Lyre's flats sound a semitone under their Nominal Ids", () => {
    // The instrument the whole design turns on: its buttons are named for grid rows it does
    // not actually play, and the flat rows are what a song must record honestly.
    for (const note of notesOf('genshin', 'Vintage-Lyre')) {
      expect(note.pitched, `${note.baseNote}@${note.midi}`).toBe(true);
      expect(note.sounding, `${note.baseNote}@${note.midi}`).toBe(
        note.baseNote.endsWith('b') ? note.midi - 1 : note.midi
      );
    }
  });

  it("the ukulele-21 top row is a chord row: Assigned, named, and sounding its Nominal Ids", () => {
    // In-game those seven buttons strum chords (capture 2026-08-19); both instruments that
    // share the preset must show it.
    for (const instrument of ['Ukulele', 'LingeringEuphonia']) {
      const chordRow = notesOf('genshin', instrument).slice(0, 7);
      expect(chordRow.map((note) => note.baseNote), instrument).toEqual([
        'C',
        'Dm',
        'Em',
        'F',
        'G',
        'Am',
        'G7',
      ]);
      for (const note of chordRow) {
        expect(note.pitched, `${instrument} ${note.baseNote}`).toBe(false);
        expect(note.sounding, `${instrument} ${note.baseNote}`).toBe(note.midi);
      }
      // and the two rows below it are ordinary tuned buttons, untouched by the reclassification
      for (const note of notesOf('genshin', instrument).slice(7)) {
        expect(note.pitched, `${instrument} ${note.baseNote}@${note.midi}`).toBe(true);
      }
    }
  });

  it('every shipped button derives an identity consistent with its class', () => {
    for (const [gameId, meta] of Object.entries(gamesMeta)) {
      for (const instrument of Object.values(meta.instruments)) {
        for (const note of instrument.notes) {
          const where = `${gameId}/${instrument.name} ${note.baseNote}@${note.midi}`;
          if (!note.pitched) {
            expect(note.sounding, where).toBe(note.midi);
            continue;
          }
          // a Pitched Button's Sounding Pitch spells its own label, within the ±6 window
          expect(((note.sounding % 12) + 12) % 12, where).toBe(
            BASE_NOTE_PITCH_CLASSES.get(note.baseNote)
          );
          expect(Math.abs(note.sounding - note.midi), where).toBeLessThanOrEqual(5);
        }
      }
    }
  });
});

describe('registry rejections around note identity (ADR-0007)', () => {
  // Drives the very validator buildGameMeta runs, on authored note lists the shipped games
  // must never contain — the shipped data can only ever prove the passing half.
  const note = (fields: Partial<NoteMetaJson>): NoteMetaJson => ({
    midi: 72,
    baseNote: 'C',
    icon: 'do',
    ...fields,
  });
  const normalize = (notes: NoteMetaJson[]) => () => normalizeNotes('test', notes, {});

  it('a Pitched Button whose label is not a bare pitch class', () => {
    expect(normalize([note({ baseNote: 'Dm' })])).toThrow(/bare pitch class/);
    expect(normalize([note({ baseNote: '' })])).toThrow(/bare pitch class/);
  });

  it('...but the same label on an Assigned Button is fine, and sounds its Nominal Id', () => {
    expect(normalize([note({ baseNote: 'G7', pitched: false })])()[0]).toMatchObject({
      baseNote: 'G7',
      pitched: false,
      sounding: 72,
    });
    expect(normalize([note({ baseNote: '', pitched: false })])()[0].sounding).toBe(72);
  });

  it('a tritone between label and Nominal Id (two equally near Sounding Pitches)', () => {
    expect(normalize([note({ midi: 72, baseNote: 'Gb' })])).toThrow(/tritone/);
    expect(normalize([note({ midi: 72, baseNote: 'F#' })])).toThrow(/tritone/);
  });

  it('two Pitched Buttons that would sound the same pitch', () => {
    // distinct Nominal Ids, one Sounding Pitch: both labels resolve to 72
    expect(normalize([note({ midi: 72, baseNote: 'C' }), note({ midi: 73, baseNote: 'C' })])).toThrow(
      /duplicate Sounding Pitches/
    );
    // Assigned Buttons are exempt: they keep their Nominal Ids exactly so alike-sounding
    // buttons stay distinct
    expect(
      normalize([
        note({ midi: 72, baseNote: 'C', pitched: false }),
        note({ midi: 73, baseNote: 'C', pitched: false }),
      ])
    ).not.toThrow();
  });
});

describe('chord-label fallback (design 2026-08-19 §6)', () => {
  it('a label no spelling table lists renders verbatim at every Basepoint', () => {
    for (const [index] of PITCHES.entries()) {
      expect(baseNoteText(NOTE_SCALE, 'G7', index)).toBe('G7');
      expect(baseNoteText(DO_RE_MI_NOTE_SCALE, 'Dm', index)).toBe('Dm');
    }
  });

  it('a label the tables DO list still transposes with the Basepoint', () => {
    expect(baseNoteText(NOTE_SCALE, 'C', 0)).toBe('C');
    expect(baseNoteText(NOTE_SCALE, 'C', 2)).toBe('D');
    expect(baseNoteText(NOTE_SCALE, 'Db', 1)).toBe('Ebb');
    expect(baseNoteText(DO_RE_MI_NOTE_SCALE, 'C', 2)).toBe('re');
    // '' is a listed spelling with an all-empty row: silent SFX buttons stay blank rather
    // than falling through to the verbatim branch
    expect(baseNoteText(NOTE_SCALE, '', 5)).toBe('');
  });

  it('every shipped button either spells a scale row or is an Assigned Button', () => {
    // What the fallback is FOR: only a free label may miss the tables, and only an Assigned
    // Button may carry one. A Pitched Button reaching the verbatim branch would mean a
    // tuned instrument silently stopped transposing.
    for (const [gameId, meta] of Object.entries(gamesMeta)) {
      for (const instrument of Object.values(meta.instruments)) {
        for (const note of instrument.notes) {
          if (note.baseNote in NOTE_SCALE) continue;
          expect(note.pitched, `${gameId}/${instrument.name} "${note.baseNote}"`).toBe(false);
          expect(baseNoteText(NOTE_SCALE, note.baseNote, 7)).toBe(note.baseNote);
        }
      }
    }
  });
});
