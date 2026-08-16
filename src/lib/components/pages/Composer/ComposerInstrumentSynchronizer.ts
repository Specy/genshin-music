import type { InstrumentData } from '$core/Songs/SongClasses';
import { Instrument } from '$lib/audio/Instrument.svelte';
import { AudioProvider } from '$lib/providers/AudioProvider';

type ComposerInstrumentSynchronizerDependencies = {
  getLayers: () => Instrument[];
  setLayers: (layers: Instrument[]) => void;
  isMounted: () => boolean;
  onLoadError: () => void;
  onSynced: () => void;
};

/**
 * Keeps the Composer's loaded audio engines aligned with the latest requested roster.
 *
 * Requests deliberately run concurrently: replacing a song must start loading its instruments
 * immediately rather than wait behind a cold sample fetch for the song being replaced. Ownership
 * is instead decided by a monotonic request id. An older request may finish, but it may neither
 * connect/configure an engine nor publish its completed array once a newer request exists.
 *
 * A pending engine can be reused when the newer roster asks for the same name. Its load promise is
 * tracked so the newer owner, rather than the stale creator, performs the eventual connect and
 * applies the newer volume/reverb values.
 */
export class ComposerInstrumentSynchronizer {
  private requestId = 0;
  private pendingLoads = new WeakMap<Instrument, Promise<boolean>>();

  constructor(private dependencies: ComposerInstrumentSynchronizerDependencies) {}

  async sync(toLoad: readonly InstrumentData[]): Promise<void> {
    const requestId = ++this.requestId;
    const layers = this.dependencies.getLayers();

    const extraInstruments = layers.splice(toLoad.length);
    extraInstruments.forEach((instrument) => this.dispose(instrument));

    const nextLayers = await Promise.all(
      toLoad.map((instrumentData, index) => this.syncSlot(layers, instrumentData, index, requestId))
    );

    if (!this.owns(requestId)) return;
    this.dependencies.setLayers(nextLayers);
    this.dependencies.onSynced();
  }

  private async syncSlot(
    layers: Instrument[],
    instrumentData: InstrumentData,
    index: number,
    requestId: number
  ): Promise<Instrument> {
    const existing = layers[index];
    if (existing?.name === instrumentData.name) {
      const pendingLoad = this.pendingLoads.get(existing);
      if (pendingLoad) {
        const loaded = await pendingLoad;
        if (!this.ownsSlot(requestId, index, existing)) return existing;
        if (!loaded) this.dependencies.onLoadError();
        // The request which created this engine may now be stale. The latest same-name owner is
        // therefore responsible for making the freshly-loaded node live.
        AudioProvider.connect(existing.endNode, instrumentData.reverbOverride);
      } else {
        if (!this.ownsSlot(requestId, index, existing)) return existing;
        AudioProvider.setReverbOfNode(existing.endNode, instrumentData.reverbOverride);
      }
      existing.changeVolume(instrumentData.volume);
      return existing;
    }

    if (existing) this.dispose(existing);
    const replacement = new Instrument(instrumentData.name);
    layers[index] = replacement;
    const loaded = await this.load(replacement);
    if (!this.ownsSlot(requestId, index, replacement)) return replacement;
    if (!loaded) this.dependencies.onLoadError();
    AudioProvider.connect(replacement.endNode, instrumentData.reverbOverride);
    replacement.changeVolume(instrumentData.volume);
    return replacement;
  }

  private load(instrument: Instrument): Promise<boolean> {
    const existing = this.pendingLoads.get(instrument);
    if (existing) return existing;

    const pending = instrument.load(AudioProvider.getAudioContext());
    this.pendingLoads.set(instrument, pending);
    // Do not use an ignored `finally()` here: if load rejects, the promise returned by finally
    // would itself reject without an observer even though the sync caller handles the original.
    void pending.then(
      () => this.forgetPendingLoad(instrument, pending),
      () => this.forgetPendingLoad(instrument, pending)
    );
    return pending;
  }

  private forgetPendingLoad(instrument: Instrument, pending: Promise<boolean>) {
    if (this.pendingLoads.get(instrument) === pending) this.pendingLoads.delete(instrument);
  }

  private owns(requestId: number): boolean {
    return this.dependencies.isMounted() && requestId === this.requestId;
  }

  private ownsSlot(requestId: number, index: number, instrument: Instrument): boolean {
    return this.owns(requestId) && this.dependencies.getLayers()[index] === instrument;
  }

  private dispose(instrument: Instrument) {
    AudioProvider.disconnect(instrument.endNode);
    instrument.dispose();
  }
}
