<script lang="ts">
    import type {SettingUpdate, SettingUpdateKey, SettingsSlider} from '$core/types/SettingsPropriety'

    let {
        data,
        value,
        onChange,
        objectKey,
    }: {
        data: SettingsSlider
        objectKey: SettingUpdateKey
        value: number
        onChange: (data: SettingUpdate) => void
    } = $props()

    function handleChange(e: Event & {currentTarget: EventTarget & HTMLInputElement}) {
        onChange({
            key: objectKey,
            data: {...data, value: Number(e.currentTarget.value)}
        })
    }
</script>

<input
    type="range"
    min={data.threshold[0]}
    max={data.threshold[1]}
    step={data.step}
    value={value}
    oninput={handleChange}
/>

<!-- MUST be `oninput`, not `onchange` - see InstrumentInput.svelte's note
     for why. -->
