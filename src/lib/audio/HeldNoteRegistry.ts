/**
 * Who is holding which Note Id, across every input a surface accepts (pointer, PC keyboard,
 * MIDI). One registry per surface; the surface decides what a first press and a last release
 * mean for audio, recording and visuals.
 *
 * THE LOAD-BEARING HALF IS HOLDER -> NOTE. A release must never re-resolve the note it is
 * releasing: every input resolves a physical key into a note through state that can change
 * while that key is still down — the Composer's selected layer, the Player's song/keyboard
 * swap, a MIDI preset edited live — so re-resolving on the up edge releases a DIFFERENT note
 * than the one pressed, or none at all. On a looping sustaining instrument that leaves a tone
 * sounding forever. Resolve once at press, hand back exactly that on release.
 *
 * Refcounted per Note Id, because two holders can legitimately hold one note at once (two keys
 * bound to the same note, a PC key and a MIDI key together, a finger and a key): the voice
 * starts on the FIRST holder and stops on the LAST, so neither release cuts the other's sound.
 *
 * Holder tokens are the PHYSICAL origin (`k:KeyD`, `m:60:0`, `p:12`), never the note — that is
 * what makes auto-repeat, a duplicate MIDI note-on and a double pointerdown idempotent: the
 * same holder pressing again is not a second press.
 */

export type HeldSource = 'keyboard' | 'midi' | 'pointer';

const SOURCE_PREFIX: Record<HeldSource, string> = {
  keyboard: 'k:',
  midi: 'm:',
  pointer: 'p:',
};

/** Stable token for one physical origin: a key code, a MIDI note (plus preset slot), a pointer id. */
export function holderToken(source: HeldSource, key: string | number): string {
  return SOURCE_PREFIX[source] + key;
}

/**
 * One MIDI key on one preset slot. Two slots mapped to the same MIDI note are two independent
 * holds, which is why the slot is part of the token. Shared because the press and release sides
 * must build it identically — a token that differs by one character is a hold that never ends.
 */
export function midiHolderToken(midi: number, slot: number): string {
  return holderToken('midi', `${midi}:${slot}`);
}

export interface HeldEntry<TMeta> {
  holder: string;
  id: number;
  meta: TMeta;
}

export class HeldNoteRegistry<TMeta = undefined> {
  // holder -> what it pressed. The reverse index that makes releases identity-safe.
  readonly #byHolder = new Map<string, HeldEntry<TMeta>>();
  // Note Id -> the holders currently on it, for the first/last refcount.
  readonly #holdersById = new Map<number, Set<string>>();

  /**
   * Register a hold. Returns `null` when this holder is ALREADY holding something — an
   * auto-repeat keydown, a duplicate note-on, a second pointerdown of the same pointer — so
   * callers can treat a null as "nothing new happened" and never double-press a voice.
   * `isFirstHolderOfId` is false when another holder already had this note sounding.
   */
  press(holder: string, id: number, meta: TMeta): { isFirstHolderOfId: boolean } | null {
    if (this.#byHolder.has(holder)) return null;
    this.#byHolder.set(holder, { holder, id, meta });
    let holders = this.#holdersById.get(id);
    if (!holders) {
      holders = new Set();
      this.#holdersById.set(id, holders);
    }
    const isFirstHolderOfId = holders.size === 0;
    holders.add(holder);
    return { isFirstHolderOfId };
  }

  /**
   * End a hold, returning what that holder was holding (`null` if it held nothing — a stray
   * key-up, a pointerleave from a pointer that never pressed, a release guard firing twice).
   * `isLastHolderOfId` is the signal to actually stop the sound.
   */
  release(holder: string): (HeldEntry<TMeta> & { isLastHolderOfId: boolean }) | null {
    const entry = this.#byHolder.get(holder);
    if (!entry) return null;
    this.#byHolder.delete(holder);
    const holders = this.#holdersById.get(entry.id);
    holders?.delete(holder);
    const isLastHolderOfId = !holders || holders.size === 0;
    if (isLastHolderOfId) this.#holdersById.delete(entry.id);
    return { ...entry, isLastHolderOfId };
  }

  /** Release every holder of one source — MIDI device loss must not cut a physically held PC key. */
  releaseSource(source: HeldSource): (HeldEntry<TMeta> & { isLastHolderOfId: boolean })[] {
    return this.#releaseMany(this.entriesOfSource(source).map((entry) => entry.holder));
  }

  /** Release everything — the blur / navigation / playback-stop panic path. */
  releaseAll(): (HeldEntry<TMeta> & { isLastHolderOfId: boolean })[] {
    return this.#releaseMany([...this.#byHolder.keys()]);
  }

  #releaseMany(holders: string[]) {
    const released = [];
    for (const holder of holders) {
      const entry = this.release(holder);
      if (entry) released.push(entry);
    }
    return released;
  }

  entries(): HeldEntry<TMeta>[] {
    return [...this.#byHolder.values()];
  }

  /** The holds of one source only — a MIDI device vanishing must not cut a held PC key. */
  entriesOfSource(source: HeldSource): HeldEntry<TMeta>[] {
    const prefix = SOURCE_PREFIX[source];
    return this.entries().filter((entry) => entry.holder.startsWith(prefix));
  }

  /** Is this physical origin already holding something — an auto-repeat, a duplicate note-on. */
  isHolding(holder: string): boolean {
    return this.#byHolder.has(holder);
  }

  get size(): number {
    return this.#byHolder.size;
  }
}
