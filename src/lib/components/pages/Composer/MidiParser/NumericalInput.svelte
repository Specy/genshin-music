<script lang="ts">
    import {untrack} from 'svelte'
    import type {ClassValue} from 'svelte/elements'

    let {
        onChange,
        value,
        delay = 800,
        step = 1,
        style = '',
        placeholder,
        class: cls = '',
    }: {
        onChange: (value: number) => void
        value: number
        placeholder?: string
        class?: ClassValue
        delay?: number
        step?: number
        style?: string
    } = $props()

    // elementValue is a writable $derived (Svelte 5.25+): reading it tracks value normally, but
    // the +/- buttons and the input below can assign to it directly to diverge locally - that
    // override is overwritten the next time value actually changes.
    let elementValue = $derived(`${value}`)
    // One-time seed; only the debounce effect below updates it after that.
    // svelte-ignore state_referenced_locally
    let debounced = $state(`${value}`)

    $effect(() => {
        void elementValue
        const handle = setTimeout(() => {
            debounced = elementValue
        }, delay)
        return () => clearTimeout(handle)
    })

    // onChange goes through untrack(): its consumers (MidiParser.svelte's changeBpm/changeOffset,
    // TrackInfo.svelte's onMaxScaleChange) funnel into convertMidi(), which mutates several $state
    // fields - left untracked, this effect would pick those up as dependencies and self-invalidate,
    // throwing effect_update_depth_exceeded the moment a MIDI file loads.
    $effect(() => {
        const parsed = Number(debounced)
        if (Number.isFinite(parsed)) {
            untrack(() => onChange(parsed))
        } else {
            elementValue = '0'
        }
    })
</script>

<div style="display:flex;justify-content:flex-end" class={cls}>
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
