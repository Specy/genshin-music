<script lang="ts">
    import {logger} from '$stores/LoggerStore.svelte'

    // Old: src/components/pages/Theme/ThemeInput.tsx.
    //
    // PRESERVED-INTENT REORDER (disclosed, not a behavior change - the observable result is
    // identical to old, only the literal statement order differs): old's `onPointerUp` handler ran
    // `setClicking(false)` THEN `if (disabled && clicking) logger.warn(...)`. In React, `clicking`
    // there is a per-render closure snapshot - `setClicking(false)` schedules a future re-render but
    // does NOT change what the CURRENT closure's `clicking` reads, so the check still saw the value
    // from the last render (effectively "was the pointer down when this render happened", almost
    // always `true` once `onPointerDown` has fired). Svelte's `clicking` below is a live `$state`
    // binding, not a per-render snapshot - writing `clicking = false` then immediately reading
    // `clicking` on the next line would read the JUST-WRITTEN `false`, silently breaking the warning
    // (it would never fire). Checking BEFORE clearing reproduces old's INTENDED/observed behavior
    // exactly under Svelte's live-binding semantics.
    let {name, onChange, disabled, value, onLeave}: {
        name: string
        value: string
        disabled: boolean
        onChange: (value: string) => void
        onLeave?: () => void
    } = $props()

    let clicking = $state(false)

    function handlePointerUp() {
        if (disabled && clicking) logger.warn('Create a new theme first')
        clicking = false
    }
</script>

<div class="theme-row">
    <div>
        {name}
    </div>
    <input
        class="theme-input"
        style="width:9rem"
        placeholder="Write here"
        {disabled}
        {value}
        onpointerdown={() => (clicking = true)}
        onpointerup={handlePointerUp}
        onpointerleave={() => (clicking = false)}
        onblur={() => onLeave?.()}
        oninput={(e) => onChange(e.currentTarget.value)}
    />
</div>
