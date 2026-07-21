<script lang="ts">
    import type {InstrumentName} from '$core/types'
    import type {SettingUpdate, SettingUpdateKey, SettingVolumeUpdate, SettingsInstrument} from '$core/types/SettingsPropriety'
    import InstrumentSelect from '../inputs/InstrumentSelect.svelte'

    // Old: src/components/shared/Settings/InstrumentInput.tsx
    // Old declared a `theme: Theme` prop but never referenced it anywhere in its own body (its
    // <InstrumentSelect> call didn't pass a theme prop either, even in old) - a pre-existing dead
    // prop, dropped here the same way `inputs/Select.svelte` already dropped its own dead
    // `className` prop (Phase 3 Task 5 precedent).
    let {
        data,
        volume,
        onVolumeChange,
        onVolumeComplete,
        onInstrumentPick,
        objectKey,
        instrument,
    }: {
        data: SettingsInstrument
        volume: number
        instrument: InstrumentName
        objectKey: SettingUpdateKey
        onVolumeChange: (value: number) => void
        onVolumeComplete: (data: SettingVolumeUpdate) => void
        onInstrumentPick: (data: SettingUpdate) => void
    } = $props()

    function handleVolumeChange(e: Event & {currentTarget: EventTarget & HTMLInputElement}) {
        onVolumeChange(Number(e.currentTarget.value))
    }

    function handleVolumePick() {
        onVolumeComplete({
            key: objectKey,
            value: volume
        })
    }

    function handleInstrument(ins: InstrumentName) {
        onInstrumentPick({
            key: objectKey,
            data: {...data, value: ins}
        })
    }
</script>

<div class="instrument-picker">
    <InstrumentSelect
        selected={instrument}
        onChange={handleInstrument}
        className="select"
        style="text-align:left;padding-left:0.4rem;"
    />
    <input
        type="range"
        min={1}
        max={100}
        value={volume}
        onchange={handleVolumeChange}
        onpointerup={handleVolumePick}
    />
</div>

<style>
    .instrument-picker {
        display: flex;
        flex-direction: column;
        width: 8rem;
    }

    .instrument-picker input[type='range'] {
        margin-top: 0.2rem;
    }
</style>
