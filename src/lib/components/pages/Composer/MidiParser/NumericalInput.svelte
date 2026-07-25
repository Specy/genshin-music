<script lang="ts">
    import {untrack} from 'svelte'

    // Old: src/components/pages/Composer/MidiParser/Numericalinput.tsx (57 lines, exported
    // component `NumericalInput`) - the OLD FILENAME itself has a lowercase-`i` typo
    // (`Numericalinput.tsx`, not `NumericalInput.tsx`). Svelte component filenames are the
    // component's own identity (unlike a React default export, whose module path is arbitrary),
    // so this port is named after the exported component itself (`NumericalInput.svelte`) rather
    // than reproducing the old typo'd path - the typo lived in the filename only, never in the
    // component name or any call site, so nothing behavioral changes.
    //
    // `useDebounce(elementValue, delay)`'s own internal `useState`+`useEffect` pair -> a `$state` +
    // a `$effect` owning its own setTimeout/clearTimeout cleanup, the same established precedent as
    // `BodyDropper.svelte`'s identical port of `useDebounce(_isHovering, 50)`.
    let {
        onChange,
        value,
        delay = 800,
        step = 1,
        style = '',
        placeholder,
        className = '',
    }: {
        onChange: (value: number) => void
        value: number
        placeholder?: string
        className?: string
        delay?: number
        step?: number
        style?: string
    } = $props()

    // Old: `const [elementValue, setElementValue] = useState(`${value}`)` +
    // `useEffect(() => setElementValue(`${value}`), [value])`. A *writable* `$derived` (Svelte
    // >=5.25) replaces both the `$state` and its resync effect in one: reading `elementValue`
    // tracks `value` normally, the +/- buttons and the text input below can still assign
    // `elementValue = ...` directly to diverge from it locally, and that override is itself
    // overwritten the next time `value` actually changes - the exact same "diverge locally, resync
    // on prop change" behavior old's separate state+effect pair gave. Same established precedent as
    // `SettingsRow.svelte`'s `currentValue` (eslint's `svelte/prefer-writable-derived` flags the old
    // two-piece shape specifically for this rewrite).
    let elementValue = $derived(`${value}`)
    // Old: `useDebounce`'s own internal `useState(value)` seed - a ONE-TIME read with no resync of
    // its own (only the debounce-timer effect below ever updates it, off of `elementValue`, never
    // directly off the `value` prop) - same established precedent as `SettingsRow.svelte`'s
    // `volume` (a plain one-time-read `$state`, not a `$derived`).
    // svelte-ignore state_referenced_locally
    let debounced = $state(`${value}`)

    // Old: `useEffect(() => { const handler = setTimeout(() => setDebouncedValue(value), delay);
    // return () => clearTimeout(handler) }, [value, delay])` (useDebounce's own internal effect).
    $effect(() => {
        void elementValue
        const handle = setTimeout(() => {
            debounced = elementValue
        }, delay)
        return () => clearTimeout(handle)
    })

    // Old: `useEffect(() => { const parsed = Number(debounced); if (Number.isFinite(parsed)) {
    // onChange(parsed) } else { setElementValue('0') } }, [debounced, onChange])`. `onChange` is
    // called through `untrack()`: this component's own consumers (`MidiParser.svelte`'s
    // `changeBpm`/`changeOffset`, `TrackInfo.svelte`'s `onMaxScaleChange`) all funnel into
    // `convertMidi()`, which reads-then-writes several `$state` fields (e.g. `track
    // .numberOfAccidentals++`) - left untracked, THIS effect (whichever `$state` those happen to
    // read) would auto-track those as its own dependencies and immediately re-invalidate itself the
    // moment a MIDI file is loaded, throwing `effect_update_depth_exceeded`. Same established fix
    // as `ZenKeyboardStore.svelte.ts`'s `setKeyboardLayout` effect, `ZenNote.svelte`'s `statusId`
    // write, and `Player.svelte`'s settings-sync effect - a required, correctness-preserving
    // adaptation for Svelte's auto-tracking (old's `useEffect`, keyed on an explicit dependency
    // array, never had this hazard to begin with).
    $effect(() => {
        const parsed = Number(debounced)
        if (Number.isFinite(parsed)) {
            untrack(() => onChange(parsed))
        } else {
            elementValue = '0'
        }
    })
</script>

<div style="display:flex;justify-content:flex-end" class={className}>
    <button onclick={() => elementValue = `${Number(elementValue) - step}`} class="midi-btn-small" {style}>-</button>
    <input
        type="text"
        {placeholder}
        value={elementValue}
        oninput={(e) => elementValue = e.currentTarget.value}
        class="midi-input"
        style="margin:0 0.3rem;{style}"
    />
    <button onclick={() => elementValue = `${Number(elementValue) + step}`} class="midi-btn-small" {style}>+</button>
</div>
