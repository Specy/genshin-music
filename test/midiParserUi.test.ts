import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MidiParser from '../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte';
import NumericalInput from '../src/lib/components/pages/Composer/MidiParser/NumericalInput.svelte';
import TrackInfo from '../src/lib/components/pages/Composer/MidiParser/TrackInfo.svelte';
import type { CustomTrack } from '../src/lib/components/pages/Composer/MidiParser/midiTrackRoster';
import { InstrumentData } from './imports';
import { reactiveProps } from './signals.svelte';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  hidePill: vi.fn(),
  showPill: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  audioRuns: [] as Array<{
    output: (frames: number[][], onsets: number[][]) => void;
    progress: (progress: number) => void;
    resolve: () => void;
  }>,
}));

vi.mock('$stores/LoggerStore.svelte', () => ({
  logger: {
    error: mocks.error,
    hidePill: mocks.hidePill,
    log: vi.fn(),
    showPill: mocks.showPill,
    success: mocks.success,
    warn: mocks.warn,
  },
}));

vi.mock('$lib/audio/BasicPitchLoader', () => ({
  basicPitchLoader: vi.fn(async () => ({
    BasicPitch: class BasicPitch {
      async evaluateModel(
        _mono: Float32Array,
        output: (frames: number[][], onsets: number[][]) => void,
        progress: (progress: number) => void
      ) {
        await new Promise<void>((resolve) => mocks.audioRuns.push({ output, progress, resolve }));
      }
    },
    noteFramesToTime: () => [],
    outputToNotesPoly: () => [],
  })),
}));

type Mounted = ReturnType<typeof mount>;

function rawMidi(keyByte = 0, tonic = 60): ArrayBuffer {
  const track = [
    0x00, 0xff, 0x59, 0x02, keyByte & 0xff, 0x00,
    0x00, 0x90, tonic, 0x40,
    0x60, 0x80, tonic, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ];
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x00, 0x60,
    0x4d, 0x54, 0x72, 0x6b,
    0x00, 0x00, 0x00, track.length,
    ...track,
  ]).buffer as ArrayBuffer;
}

function fileWithBytes(name: string, bytes: ArrayBuffer | Promise<ArrayBuffer>): File {
  const file = new File([], name);
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: () => Promise.resolve(bytes),
  });
  return file;
}

function pick(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('MIDI parser file ownership', () => {
  let target: HTMLDivElement;
  let component: Mounted | null;
  let loadSong: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.error.mockReset();
    mocks.hidePill.mockReset();
    mocks.showPill.mockReset();
    mocks.success.mockReset();
    mocks.warn.mockReset();
    mocks.audioRuns.length = 0;
    vi.stubGlobal(
      'AudioContext',
      class AudioContext {
        decodeAudioData(_bytes: ArrayBuffer, resolve: (buffer: AudioBuffer) => void) {
          resolve({
            getChannelData: () => new Float32Array([0]),
          } as AudioBuffer);
        }
        close() {}
      }
    );
    loadSong = vi.fn();
    target = document.createElement('div');
    document.body.append(target);
    component = mount(MidiParser, {
      target,
      props: {
        data: { selectedColumn: 0 },
        functions: {
          changeMidiVisibility: vi.fn(),
          loadSong,
        },
      },
    });
    flushSync();
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    vi.unstubAllGlobals();
  });

  function picker(): HTMLInputElement {
    const input = target.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('MIDI FilePicker was not rendered');
    return input;
  }

  it('imports an F-sharp tonic at its enharmonic Basepoint without flattening the note', async () => {
    pick(picker(), fileWithBytes('f-sharp.mid', rawMidi(6, 66)));
    await vi.waitFor(() => expect(loadSong).toHaveBeenCalledTimes(1));

    const preview = loadSong.mock.calls[0][0];
    expect(preview.pitch).toBe('Gb');
    expect(preview.columns.flatMap((column) => column.notes.map((note) => note.id))).toContain(66);
  });

  it('orders ownership at selection time, not at ArrayBuffer completion time', async () => {
    let finishOldRead!: (bytes: ArrayBuffer) => void;
    const oldRead = new Promise<ArrayBuffer>((resolve) => (finishOldRead = resolve));

    pick(picker(), fileWithBytes('older.mid', oldRead));
    pick(picker(), fileWithBytes('newer.mid', rawMidi(0, 60)));

    await vi.waitFor(() => expect(loadSong).toHaveBeenCalledTimes(1));
    expect(loadSong.mock.calls[0][0].pitch).toBe('C');
    finishOldRead(rawMidi(1, 67));
    await Promise.resolve();
    await Promise.resolve();

    expect(loadSong).toHaveBeenCalledTimes(1);
    expect(mocks.hidePill).toHaveBeenCalledTimes(2);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('revokes stale Basic Pitch output, progress, cleanup, and preview publication', async () => {
    pick(picker(), fileWithBytes('older.mp3', new ArrayBuffer(1)));
    await vi.waitFor(() => expect(mocks.audioRuns).toHaveLength(1));
    const staleRun = mocks.audioRuns[0];
    const showsBeforeReplacement = mocks.showPill.mock.calls.length;

    pick(picker(), fileWithBytes('newer.mid', rawMidi(0, 60)));
    await vi.waitFor(() => expect(loadSong).toHaveBeenCalledTimes(1));
    expect(mocks.hidePill).toHaveBeenCalledTimes(2);

    staleRun.output([[1]], [[1]]);
    staleRun.progress(0.75);
    staleRun.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.showPill).toHaveBeenCalledTimes(showsBeforeReplacement);
    expect(mocks.hidePill).toHaveBeenCalledTimes(2);
    expect(loadSong).toHaveBeenCalledTimes(1);
  });
});

describe('MIDI track numerical controls', () => {
  let targets: HTMLDivElement[];
  let components: Mounted[];

  beforeEach(() => {
    vi.useFakeTimers();
    targets = [];
    components = [];
  });

  afterEach(() => {
    for (const component of components) unmount(component);
    for (const target of targets) target.remove();
    vi.useRealTimers();
  });

  function track(index: number): CustomTrack {
    return {
      track: {
        notes: [{ midi: 60, time: 0, duration: 0.1 }],
        instrument: { family: 'piano', name: '' },
      } as unknown as CustomTrack['track'],
      originalIndex: index,
      selected: true,
      rawName: '',
      name: `Track ${index}`,
      instrument: new InstrumentData(),
      numberOfAccidentals: 0,
      outOfRange: 0,
      localOffset: null,
      maxScaling: 0,
      outOfRangeBounds: { lower: 0, upper: 0 },
    };
  }

  it('does not replay stale text when a controlled value changes externally', () => {
    const onChange = vi.fn();
    const props = reactiveProps({ value: 7, onChange, delay: 100 });
    const target = document.createElement('div');
    document.body.append(target);
    targets.push(target);
    components.push(mount(NumericalInput, { target, props }));
    flushSync();

    expect(onChange).not.toHaveBeenCalled();
    props.value = 9;
    flushSync();
    // If `value` is accidentally tracked by the debounce consumer, it immediately reports the
    // old debounced 7 back to the parent here, before the new display value reaches the timer.
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    flushSync();
    expect(onChange).not.toHaveBeenCalled();
    expect(target.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('9');
  });

  it('does not emit two unchanged settings for every mounted track', () => {
    const onChange = vi.fn();
    const count = 6;
    for (let index = 0; index < count; index++) {
      const target = document.createElement('div');
      document.body.append(target);
      targets.push(target);
      components.push(
        mount(TrackInfo, {
          target,
          props: { data: track(index), index, onChange },
        })
      );
    }
    flushSync();
    vi.advanceTimersByTime(1_000);
    flushSync();

    // Before the no-op gate this was exactly count * 2, each callback rebuilding every track.
    expect(onChange).not.toHaveBeenCalled();

    const localOffset = targets[0].querySelector<HTMLInputElement>('input[type="text"]');
    if (!localOffset) throw new Error('local-offset input was not rendered');
    localOffset.value = '3';
    localOffset.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    vi.advanceTimersByTime(600);
    flushSync();

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(0, { localOffset: 3 });
  });
});
