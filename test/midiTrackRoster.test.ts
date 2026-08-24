import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Midi } from '$core/Songs/midiConstructor';
import { InstrumentData } from '$core/Songs/SongClasses';
import { BASE_LAYER_LIMIT } from '$core/sharedConfig';
import { INSTRUMENTS } from './imports';
import {
  buildMidiTrackRoster,
  parseMidiTrackName,
} from '$cmp/pages/Composer/MidiParser/midiTrackRoster';

function addNote(track: ReturnType<Midi['addTrack']>, midi = 60) {
  track.addNote({ midi, time: 0, duration: 0.1, velocity: 1 });
  return track;
}

describe('MIDI track roster construction', () => {
  it('uses original MIDI indexes for metadata even when a silent middle track is filtered out', () => {
    const midi = new Midi();
    addNote(midi.addTrack(), 60);
    midi.addTrack();
    addNote(midi.addTrack(), 64);

    const first = new InstrumentData({ name: INSTRUMENTS[0], alias: 'first' });
    const silent = new InstrumentData({ name: INSTRUMENTS[0], alias: 'silent' });
    const last = new InstrumentData({
      name: INSTRUMENTS.at(-1) ?? INSTRUMENTS[0],
      volume: 37,
      pitch: 'Eb',
      visible: false,
      icon: 'line',
      alias: 'last',
      muted: true,
      solo: true,
      reverbOverride: true,
    });

    const roster = buildMidiTrackRoster(midi.tracks, [first, silent, last]);

    expect(roster.map((track) => track.originalIndex)).toEqual([0, 2]);
    expect(roster[0].instrument.alias).toBe('first');
    expect(roster[1].instrument.serialize()).toEqual(last.serialize());
    expect(roster[1].instrument).not.toBe(last);
  });

  it('keeps every metadata field and lets metadata alias/Basepoint override the track label', () => {
    const midi = new Midi();
    const track = addNote(midi.addTrack());
    track.name = 'Db | label from MIDI';
    const metadata = new InstrumentData({
      name: INSTRUMENTS.at(-1) ?? INSTRUMENTS[0],
      volume: 23,
      pitch: 'G',
      visible: false,
      icon: 'border',
      alias: 'metadata alias',
      muted: true,
      solo: true,
      reverbOverride: false,
    });

    const [candidate] = buildMidiTrackRoster(midi.tracks, [metadata]);

    expect(candidate.rawName).toBe('Db | label from MIDI');
    expect(candidate.instrument.serialize()).toEqual(metadata.serialize());
    expect(candidate.instrument.alias).toBe('metadata alias');
    expect(candidate.instrument.pitch).toBe('G');
    expect(candidate.instrument).not.toBe(metadata);
  });

  it('does not backfill deliberately empty metadata alias/Basepoint from the MIDI label', () => {
    const midi = new Midi();
    const track = addNote(midi.addTrack());
    track.name = 'Db | label from MIDI';
    const metadata = new InstrumentData({ alias: '', pitch: '' });

    const [candidate] = buildMidiTrackRoster(midi.tracks, [metadata]);

    expect(candidate.instrument.alias).toBe('');
    expect(candidate.instrument.pitch).toBe('');
  });

  it('falls back per uncovered track and seeds alias/Basepoint from a stripped export label', () => {
    const midi = new Midi();
    const covered = addNote(midi.addTrack());
    covered.name = 'covered';
    const uncovered = addNote(midi.addTrack());
    uncovered.name = 'Db | My | Bass';

    const [first, second] = buildMidiTrackRoster(midi.tracks, [
      new InstrumentData({ alias: 'from metadata' }),
    ]);

    expect(first.instrument.alias).toBe('from metadata');
    expect(second.instrument.alias).toBe('My | Bass');
    expect(second.instrument.pitch).toBe('Db');
    expect(INSTRUMENTS).toContain(second.instrument.name);
  });

  it('selects only the first BASE_LAYER_LIMIT note-bearing tracks', () => {
    const midi = new Midi();
    for (let index = 0; index < BASE_LAYER_LIMIT + 2; index++) {
      addNote(midi.addTrack(), 60 + (index % 12));
    }

    const roster = buildMidiTrackRoster(midi.tracks, null);

    expect(roster).toHaveLength(BASE_LAYER_LIMIT + 2);
    expect(roster.filter((track) => track.selected)).toHaveLength(BASE_LAYER_LIMIT);
    expect(roster.slice(0, BASE_LAYER_LIMIT).every((track) => track.selected)).toBe(true);
    expect(roster.slice(BASE_LAYER_LIMIT).every((track) => !track.selected)).toBe(true);
  });
});

describe('MIDI track labels', () => {
  it('consumes only the first valid Basepoint prefix and preserves the rest exactly', () => {
    expect(parseMidiTrackName('C | Db | My  Bass ', 0)).toEqual({
      rawName: 'C | Db | My  Bass ',
      name: 'C | Db | My  Bass ',
      alias: 'Db | My  Bass ',
      pitch: 'C',
    });
  });

  it('accepts a real GM patch name as an alias', () => {
    expect(parseMidiTrackName('pizzicato strings', 0).alias).toBe('pizzicato strings');
  });

  it('keeps synthesised Track n.N text out of the alias', () => {
    expect(parseMidiTrackName('', 2)).toEqual({
      rawName: '',
      name: 'Track n.3',
      alias: '',
      pitch: '',
    });
  });

  it('keeps a genuine file-authored Track n.N label as an alias', () => {
    expect(parseMidiTrackName('Track n.3', 2).alias).toBe('Track n.3');
  });

  it('does not consume an invalid pitch prefix', () => {
    expect(parseMidiTrackName('H | untouched', 0)).toMatchObject({
      alias: 'H | untouched',
      pitch: '',
    });
  });
});

describe('MidiParser roster guards', () => {
  const source = readFileSync(
    'src/lib/components/pages/Composer/MidiParser/MidiParser.svelte',
    'utf8'
  );

  it('zeros an empty selection and returns before installing a preview song', () => {
    const guard = source.indexOf('if (selectedTracks.length === 0)');
    const preview = source.indexOf('functions.loadSong(song, { preview: true })');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(preview);
    const guardBody = source.slice(guard, source.indexOf('\n    }', guard));
    expect(guardBody).toContain('totalNotes = 0');
    expect(guardBody).toContain("logger.warn(t('composer:midi_parser.there_are_no_notes'))");
  });

  it('uses the same cap warning on parse and when refusing a selection past the cap', () => {
    expect(source).toContain('if (tracks.length > BASE_LAYER_LIMIT) warnTrackLimit();');
    expect(source).toContain(
      'tracks.filter((candidate) => candidate.selected).length >= BASE_LAYER_LIMIT'
    );
    expect(source.match(/warnTrackLimit\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
