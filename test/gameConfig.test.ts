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
import { gamesMeta } from '$lib/games/registry';
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
