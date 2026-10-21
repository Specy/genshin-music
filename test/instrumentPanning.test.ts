import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import {
  ComposedSong,
  INSTRUMENTS,
  InstrumentData,
  RecordedSong,
  VsrgSong,
} from './imports';
import { planSongRender } from '$lib/audio/OfflineSongRenderer';
import { decodeMidiMetadata, encodeMidiMetadata } from '$core/Songs/midiMetadata';
import InstrumentSettingsPopup from '$cmp/pages/Composer/InstrumentSettingsPopup.svelte';

describe('per-track pan', () => {
  it('keeps older songs centered without adding a field to their saved tracks', () => {
    const saved = new InstrumentData().serialize();
    expect(saved).not.toHaveProperty('pan');
    expect(InstrumentData.deserialize(saved).pan).toBe(0);
  });

  it.each([
    [-3, -1],
    [3, 1],
    [-0.42, -0.42],
    [NaN, 0],
    [Infinity, 0],
    [null, 0],
    ['left', 0],
  ])('normalizes imported pan %s to %s', (pan, expected) => {
    const saved = { ...new InstrumentData().serialize(), pan };
    expect(InstrumentData.deserialize(saved as never).pan).toBe(expected);
    expect(new InstrumentData().set({ pan: pan as number }).pan).toBe(expected);
    expect(new InstrumentData({ pan: pan as number }).pan).toBe(expected);
  });

  it('preserves independent positions through saving, copies, instrument swaps and conversion', () => {
    const song = new ComposedSong('stereo', Array(3).fill(INSTRUMENTS[0]));
    const pans = [-1, 0, 0.75];
    song.instruments = song.instruments.map((instrument, i) => instrument.set({ pan: pans[i] }));
    expect(ComposedSong.deserialize(song.serialize()).instruments.map((i) => i.pan)).toEqual(pans);
    expect(song.clone().instruments.map((i) => i.pan)).toEqual(pans);
    expect(song.instruments[0].withInstrument(INSTRUMENTS[1]).pan).toBe(-1);

    const recorded = song.toRecordedSong(0);
    expect(RecordedSong.deserialize(recorded.serialize()).instruments.map((i) => i.pan)).toEqual(pans);
    expect(recorded.toComposedSong().instruments.map((i) => i.pan)).toEqual(pans);
    expect(planSongRender(recorded).tracks.map((track) => track.pan)).toEqual(pans);

    const vsrg = new VsrgSong('stereo');
    vsrg.addTrack(INSTRUMENTS[0]);
    vsrg.tracks[0].instrument.set({ pan: -0.4 });
    expect(VsrgSong.deserialize(vsrg.serialize()).tracks[0].instrument.pan).toBe(-0.4);

    const text = encodeMidiMetadata({ instruments: song.instruments, pitch: 'C', reverb: false });
    const decoded = decodeMidiMetadata([{ type: 'text', text }]);
    expect(decoded?.instruments.map((i) => i.pan)).toEqual(pans);
  });
});

describe('the composer pan control', () => {
  function openPanel(song: ComposedSong, disabled = false) {
    const target = document.createElement('div');
    document.body.append(target);
    const history = song.attachHistory();
    const component = mount(InstrumentSettingsPopup, {
      target,
      props: {
        get instrument() { return song.instruments[0]; },
        get instruments() { return song.instruments; },
        currentLayer: 0,
        songPitch: song.pitch,
        songReverb: song.reverb,
        onChange: (instrument: InstrumentData) => song.setInstrument(0, instrument),
        onEditGroupStart: () => history.beginGroup(),
        onEditGroupEnd: () => history.endGroup(),
        onChangePosition: () => {},
        onMerge: () => {},
        onDelete: () => {},
        onClose: () => {},
        disabled,
      },
    });
    flushSync();
    return {
      target,
      history,
      slider: target.querySelector<HTMLInputElement>('#instrument-pan')!,
      async close() {
        await unmount(component);
        target.remove();
      },
    };
  }

  it('updates the live track, resets to center and undoes a whole drag in one step', async () => {
    const song = new ComposedSong('pan gesture', [INSTRUMENTS[0]]);
    const live = song.instruments[0];
    const panel = openPanel(song);
    try {
      expect(panel.slider.value).toBe('0');
      panel.slider.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      for (const value of [-25, -50, -100]) {
        panel.slider.value = String(value);
        panel.slider.dispatchEvent(new Event('input', { bubbles: true }));
        flushSync();
      }
      panel.slider.dispatchEvent(new Event('pointerup', { bubbles: true }));
      expect(song.instruments[0].pan).toBe(-1);
      expect(live.pan).toBe(0);
      expect(panel.slider.getAttribute('aria-valuetext')).toBe('Left 100%');
      song.undo();
      flushSync();
      expect(song.instruments[0].pan).toBe(0);
      expect(panel.history.canUndo).toBe(false);
      expect(panel.slider.value).toBe('0');
      song.redo();
      flushSync();
      expect(song.instruments[0].pan).toBe(-1);

      panel.target.querySelector<HTMLButtonElement>('.settings-pan-center')!.click();
      flushSync();
      expect(song.instruments[0].pan).toBe(0);
      expect(panel.slider.getAttribute('aria-valuetext')).toBe('Center');
      song.undo();
      expect(song.instruments[0].pan).toBe(-1);
    } finally {
      await panel.close();
    }
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'keyup'])(
    'ends a pan gesture on %s',
    async (endEvent) => {
      const song = new ComposedSong('interrupted pan', [INSTRUMENTS[0]]);
      const panel = openPanel(song);
      try {
        panel.slider.dispatchEvent(new Event(endEvent === 'keyup' ? 'keydown' : 'pointerdown', { bubbles: true }));
        panel.slider.value = '70';
        panel.slider.dispatchEvent(new Event('input', { bubbles: true }));
        flushSync();
        panel.slider.dispatchEvent(new Event(endEvent, { bubbles: true }));
        expect(panel.history.groupDepth).toBe(0);
        song.undo();
        expect(song.instruments[0].pan).toBe(0);
      } finally {
        await panel.close();
      }
    }
  );

  it('ends an active drag when the panel closes', async () => {
    const panel = openPanel(new ComposedSong('close pan', [INSTRUMENTS[0]]));
    panel.slider.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panel.history.groupDepth).toBe(1);
    await panel.close();
    expect(panel.history.groupDepth).toBe(0);
  });

  it('disables both pan controls while editing is locked', async () => {
    const panel = openPanel(new ComposedSong('locked pan', [INSTRUMENTS[0]]), true);
    try {
      expect(panel.slider.disabled).toBe(true);
      expect(panel.target.querySelector<HTMLButtonElement>('.settings-pan-center')!.disabled).toBe(true);
    } finally {
      await panel.close();
    }
  });
});
