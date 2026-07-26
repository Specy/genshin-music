<script lang="ts">
    import type {SettingUpdate, SettingUpdateKey, SettingsSlider} from '$core/types/SettingsPropriety'

    // Old: src/components/shared/Settings/Slider.tsx
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

<!-- `oninput`, not `onchange`: old Slider.tsx used React's onChange, which fires on the DOM
     `input` event (live during the drag). See InstrumentInput.svelte's note for the full mapping. -->
