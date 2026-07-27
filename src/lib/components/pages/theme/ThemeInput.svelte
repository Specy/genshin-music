<script lang="ts">
    import {logger} from '$stores/LoggerStore.svelte'

    let {name, onChange, disabled, value, onLeave}: {
        name: string
        value: string
        disabled: boolean
        onChange: (value: string) => void
        onLeave?: () => void
    } = $props()

    let clicking = $state(false)

    // QUIRK: checks disabled && clicking BEFORE clearing clicking below, not after - clicking is a
    // live $state binding, so clearing first would make this check always read the just-cleared
    // false and the warning would never fire. This order is required, not incidental.
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
