<script lang="ts">
    import type {InstrumentName} from '$core/types'
    import type {SettingUpdate, SettingUpdateKey, SettingVolumeUpdate, SettingsInstrument} from '$core/types/SettingsPropriety'
    import InstrumentSelect from '../inputs/InstrumentSelect.svelte'

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

    // MUST be `oninput`, not `onchange`, below: `onchange` only fires once
    // the value is committed, so `onpointerup` (handleVolumePick) would fire
    // and commit the PREVIOUS value before the new one was ever reported -
    // picking 10% saved nothing, picking 50% next saved 10%. `oninput` fires
    // on every drag step, ahead of the pointerup commit.
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
        oninput={handleVolumeChange}
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
