/**
 * The OTHER half of the serialize() contract (2026-08-06 reactive-model plan): a persisted payload
 * must be a SNAPSHOT, not a view onto the live song. Plus the same question asked between two
 * models, which is what gates clone() (see assertNoSharedState at the bottom).
 *
 * test/noProxies.ts checks that a payload is structured-cloneable. That catches a deep-`$state`
 * array escaping, and nothing else - in particular it is blind to plain ALIASING, which is the
 * half the plan actually states as a rule ("Return [...this.array] / .map(), never a reactive
 * array reference"). Proven blind by a reviewer: changing ComposedSong.serialize() to
 * `breakpoints: this.breakpoints` - handing IndexedDB the live array by reference - passed the
 * whole suite, every golden fixture included, because `breakpoints` is `$state.raw` and a raw
 * array is a perfectly cloneable plain array.
 *
 * Aliasing is not a style point on these paths. The payload outlives the call: it is what the
 * autosave writes, what the download blob is built from, and what the backup page holds while the
 * user keeps editing. A shared array means a later edit rewrites a snapshot someone else is still
 * holding, and (for `data`) that toOtherGame's appName rewrite edits the saved copy from
 * underneath it.
 *
 * WHAT IT CHECKS: no object or array in the payload is REACHABLE from the model. That is stronger
 * than comparing the arrays it happens to know about, and it is what makes "mutating the payload
 * cannot write back into the song" true rather than merely tested at a few spots - with no shared
 * reference there is no write to share.
 *
 * WHAT IT DOES NOT CATCH, so it never becomes a false reassurance:
 * - aliasing to anything other than the model it is HANDED. A payload sharing a module-level
 *   mutable constant, or another song's array, walks straight past this.
 * - payload-to-payload sharing, which is deliberate: a payload built on top of another one (the
 *   retired `ComposedSong.toOldFormat()` reused the arrays of the `serialize()` result it was
 *   built on) holds two snapshots of the same instant. Only the model -> payload direction is
 *   examined.
 * - FROZEN shared references, exempted on purpose (see findAlias).
 * - the model's own internal aliasing (a note object shared between two columns).
 * - whether the payload's VALUES are right - that is the golden fixtures' job.
 */
export function assertNoLiveAliasing(label: string, model: object, payload: unknown): void {
    const live = liveReferences(model)
    //the model itself is trivially "reachable from the model"; keep it in - a serialize() that
    //returned `this` for some sub-object is exactly as broken as one returning `this.breakpoints`
    const alias = findAlias(payload, live)
    if (alias === null) return
    throw new Error(
        `${label}: the payload shares a live object with the model it came from.\n` +
        `  shared at: ${alias.path} (the model reaches the same object at ${alias.modelPath})\n` +
        `  A serialized payload is a SNAPSHOT handed to IndexedDB and to the download path: it ` +
        `must not be a view onto the song, or a later edit rewrites it from underneath whoever ` +
        `is holding it (and a mutation of the payload writes back into the song).\n` +
        `  Spread or .map() every array and object out - [...this.breakpoints], ` +
        `{...this.data}, this.columns.map(...) - never 'return this.someArray'. See ` +
        `ComposedSong.serialize's header.`
    )
}

/**
 * The model -> model direction: two instances that are supposed to be independent must share no
 * mutable object at all.
 *
 * This is what gates clone(). Nothing else can: a clone's fields are private (`#columns`) or
 * `$state` accessors, so the payload-shaped walk in findAlias cannot even see them, and every
 * value test in the suite compares CONTENT, which a shared array satisfies perfectly. Measured on
 * this tree: with ComposedSong.clone()'s `[...this.breakpoints]` replaced by `this.breakpoints`,
 * the ONLY failure in the whole sky suite is the clone gate in test/serializePlain.test.ts - every
 * other test, golden fixtures included, stays green.
 *
 * Both sides are walked the same way as a model in assertNoLiveAliasing (descriptors + prototype
 * getters), so this sees exactly what that walk sees, in both directions - which is the point:
 * the payload walk is the one that cannot look inside a class instance.
 *
 * Same exemptions as above: FROZEN objects are shareable, and this knows nothing about references
 * shared with any third object.
 */
export function assertNoSharedState(label: string, model: object, other: object): void {
    const live = liveReferences(model)
    for (const [node, otherPath] of liveReferences(other)) {
        const modelPath = live.get(node)
        if (modelPath === undefined || Object.isFrozen(node)) continue
        throw new Error(
            `${label}: the two instances share a live object.\n` +
            `  reached at ${modelPath} on the first, ${otherPath} on the second\n` +
            `  These are meant to be independent: an undo-history entry, a duplicated song or a ` +
            `converted copy that shares an array with its source means editing one edits the ` +
            `other. Copy every array and object across - [...this.breakpoints], {...this.data}, ` +
            `this.columns.map(column => column.clone()).`
        )
    }
}

function isReference(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

/**
 * Every object and array reachable from a live model instance, mapped to ONE path by which the
 * model reaches it (the first the walk happens to find - it is a diagnostic, not the shortest
 * route).
 *
 * Reads through property DESCRIPTORS and the PROTOTYPE CHAIN rather than Object.entries, because a
 * `$state` / `$state.raw` class field is a non-enumerable accessor PAIR on the prototype backed by
 * a private field: enumerating an instance sees neither the accessor nor the backing store, so
 * `instruments` and `breakpoints` - the two fields this guard most needs to see - would be
 * invisible. Reading them through their getters is also what keeps this future-proof: a `$state`
 * field added in a later phase is walked with no change here, and so is a private one behind a
 * getter (`#columns` via `columns`).
 */
function liveReferences(model: object): Map<object, string> {
    const seen = new Map<object, string>()
    const queue: { node: object, path: string }[] = [{node: model, path: '<self>'}]
    while (queue.length > 0) {
        const entry = queue.pop()
        if (entry === undefined || seen.has(entry.node)) continue
        seen.set(entry.node, entry.path)
        for (const [key, child] of childrenOf(entry.node)) {
            if (isReference(child)) queue.push({node: child, path: join(entry.node, entry.path, key)})
        }
    }
    return seen
}

function join(parent: object, path: string, key: string): string {
    return Array.isArray(parent) ? `${path}[${key}]` : `${path}.${key}`
}

function* childrenOf(node: object): Generator<[string, unknown]> {
    if (node instanceof Map) {
        let i = 0
        for (const [key, value] of node) {
            yield [`<key ${i}>`, key]
            yield [`<value ${i}>`, value]
            i++
        }
        return
    }
    if (node instanceof Set) {
        let i = 0
        for (const value of node) {
            yield [`<member ${i}>`, value]
            i++
        }
        return
    }
    //arrays included: their elements ARE own indexed properties
    for (const name of Object.getOwnPropertyNames(node)) {
        const descriptor = Object.getOwnPropertyDescriptor(node, name)
        if (descriptor && 'value' in descriptor) yield [name, descriptor.value]
    }
    for (const prototype of prototypeChain(node)) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
            if (!descriptor?.get) continue
            try {
                yield [name, descriptor.get.call(node)]
            } catch {
                //a getter that throws on this instance holds nothing anyone could alias
            }
        }
    }
}

/** Class prototypes only: Object/Array prototypes carry no state and their getters are not ours. */
function* prototypeChain(node: object): Generator<object> {
    let prototype: unknown = Object.getPrototypeOf(node)
    while (isReference(prototype) && prototype !== Object.prototype && prototype !== Array.prototype) {
        yield prototype
        prototype = Object.getPrototypeOf(prototype)
    }
}

/**
 * The SHALLOWEST payload path holding a live reference (pre-order: a node is tested before its
 * children), or null.
 *
 * Deliberately the opposite of test/noProxies.ts's findUncloneablePath, which recurses first and
 * reports the DEEPEST offender - the two are not a copy-paste of each other, and the asymmetry is
 * forced by what the two properties do at a container boundary. Uncloneability propagates UPWARDS:
 * an object holding an uncloneable child is itself uncloneable, so every ancestor matches and only
 * the deepest match says anything. "Is a live model object" does not propagate at all: a freshly
 * built array holding one live note is not itself live. So the outermost match is exactly the
 * boundary where sharing begins, and it is the node whose construction has to be fixed - for
 * `breakpoints: this.breakpoints` that is `breakpoints`, not the deeper elements it happens to
 * hold.
 */
function findAlias(
    payload: unknown,
    live: Map<object, string>,
    path = '<root>',
    seen = new Set<object>()
): { path: string, modelPath: string } | null {
    if (!isReference(payload) || seen.has(payload)) return null
    seen.add(payload)
    //FROZEN references are allowed through: an immutable value cannot be edited from either side,
    //so sharing one is not aliasing in any sense that matters here. (Nothing in the model is frozen
    //today; the exemption is here so that sharing a frozen constant - a config table, a canonical
    //empty tuple - stays a legitimate optimization rather than a test failure.)
    const modelPath = live.get(payload)
    if (modelPath !== undefined && !Object.isFrozen(payload)) return {path, modelPath}
    for (const name of Object.getOwnPropertyNames(payload)) {
        const descriptor = Object.getOwnPropertyDescriptor(payload, name)
        if (!descriptor || !('value' in descriptor)) continue
        const found = findAlias(descriptor.value, live, join(payload, path, name), seen)
        if (found) return found
    }
    return null
}
