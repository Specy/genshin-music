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
    const availableByName = this.poolByName(layers);

    // Claim the entire destination roster before disposing anything. A track removal or reorder
    // shifts every later slot, so disposing slot-by-slot would throw away engines which a later
    // destination can still reuse. Each pool is FIFO to keep duplicate-name reuse deterministic.
    const claims = toLoad.map((instrumentData) => {
      const available = availableByName.get(instrumentData.name);
      const existing = available?.shift();
      if (available?.length === 0) availableByName.delete(instrumentData.name);
      return {
        instrumentData,
        instrument: existing ?? new Instrument(instrumentData.name),
        isNew: existing === undefined,
      };
    });

    // Publish the provisional ownership into the live array synchronously, before any load can
    // yield. A newer request can then adopt an in-flight engine by name from its new slot, while
    // ownsSlot keeps the stale request from connecting or configuring it when the load resolves.
    layers.splice(0, layers.length, ...claims.map(({ instrument }) => instrument));

    availableByName.forEach((available) => {
      available.forEach((instrument) => this.dispose(instrument));
    });

    const nextLayers = await Promise.all(
      claims.map(({ instrumentData, instrument, isNew }, index) =>
        this.syncClaim(instrument, instrumentData, index, requestId, isNew)
      )
    );

    if (!this.owns(requestId)) return;
    this.dependencies.setLayers(nextLayers);
    this.dependencies.onSynced();
  }

  private poolByName(layers: readonly Instrument[]): Map<Instrument['name'], Instrument[]> {
    const availableByName = new Map<Instrument['name'], Instrument[]>();
    layers.forEach((instrument) => {
      const available = availableByName.get(instrument.name);
      if (available) available.push(instrument);
      else availableByName.set(instrument.name, [instrument]);
    });
    return availableByName;
  }

  private async syncClaim(
    instrument: Instrument,
    instrumentData: InstrumentData,
    index: number,
    requestId: number,
    isNew: boolean
  ): Promise<Instrument> {
    const pendingLoad = isNew ? this.load(instrument) : this.pendingLoads.get(instrument);
    if (pendingLoad) {
      const loaded = await pendingLoad;
      if (!this.ownsSlot(requestId, index, instrument)) return instrument;
      if (!loaded) this.dependencies.onLoadError();
      // The request which created this engine may now be stale. The latest same-name owner is
      // therefore responsible for making the freshly-loaded node live at its new destination.
      AudioProvider.connect(instrument.endNode, instrumentData.reverbOverride);
    } else {
      if (!this.ownsSlot(requestId, index, instrument)) return instrument;
      AudioProvider.setReverbOfNode(instrument.endNode, instrumentData.reverbOverride);
    }
    instrument.changeVolume(instrumentData.volume);
    return instrument;
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
