/**
 * Reflection over a model class's callable surface, shared by the two gates that need it:
 * test/reactivePublish.test.ts (one row per callable on ComposedSong) and
 * test/serializePlain.test.ts (every serialize-shaped callable in the model is classified). Both
 * used to carry their own copy of this walk, with near-identical docstrings making the same point.
 *
 * The three rules, which are the whole reason this is not Object.keys/entries:
 * - read through property DESCRIPTORS, never by reading the property. The 2026-08-06 reactive-model
 *   plan forbids ENUMERATING a model instance - `$state` fields compile to non-enumerable prototype
 *   accessors, so enumeration would miss them anyway - and a descriptor is how a member is
 *   inspected without INVOKING a getter (which, inside an effect, would also subscribe to it). Do
 *   not "simplify" this into Object.keys.
 * - keep function-VALUED descriptors only. An accessor whose getter would return a function is not
 *   a method, and is never called to find out.
 * - walk the INSTANCE's own properties, not just prototypes: the song classes declare a large part
 *   of their API as arrow-function instance fields (`serialize = () => ...`), which exist on the
 *   object itself and on no prototype. That is why callers must hand over a live instance.
 */

function collectFunctionValued(target: object, into: Set<string>): void {
    for (const name of Object.getOwnPropertyNames(target)) {
        if (name === 'constructor') continue
        const descriptor = Object.getOwnPropertyDescriptor(target, name)
        if (descriptor && typeof descriptor.value === 'function') into.add(name)
    }
}

/**
 * Everything callable ON an instance: its own arrow-function fields plus the methods of every
 * prototype up to (not including) Object.prototype - so inherited methods count, which is what
 * makes `Song`'s own members visible through any concrete song.
 */
export function instanceCallables(instance: object): string[] {
    const names = new Set<string>()
    collectFunctionValued(instance, names)
    let prototype: unknown = Object.getPrototypeOf(instance)
    while (typeof prototype === 'object' && prototype !== null && prototype !== Object.prototype) {
        collectFunctionValued(prototype, names)
        prototype = Object.getPrototypeOf(prototype)
    }
    return [...names].sort()
}

/**
 * Everything callable ON the class: its static methods plus those of its base classes (statics are
 * inherited through the constructor's own prototype chain, so `ComposedSong.deserializeTo` really
 * is a way to call `Song.deserializeTo`).
 */
export function staticCallables(constructor: object): string[] {
    const names = new Set<string>()
    let klass: unknown = constructor
    while (typeof klass === 'function' && klass !== Function.prototype) {
        collectFunctionValued(klass, names)
        klass = Object.getPrototypeOf(klass)
    }
    return [...names].sort()
}
