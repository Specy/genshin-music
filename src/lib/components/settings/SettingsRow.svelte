<script lang="ts">
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import {hasTooltip} from '../utility/tooltip'
    import Tooltip from '../utility/Tooltip.svelte'
    import Switch from '../inputs/Switch.svelte'
    import SettingsSelect from './SettingsSelect.svelte'
    import SettingsInput from './SettingsInput.svelte'
    import SettingsSlider from './SettingsSlider.svelte'
    import InstrumentInput from './InstrumentInput.svelte'
    import {t} from '$i18n/binding.svelte'
    import type {SettingUpdate, SettingUpdateKey, SettingVolumeUpdate, SettingsPropriety} from '$core/types/SettingsPropriety'

    let {
        data,
        update,
        objKey,
        changeVolume,
    }: {
        data: SettingsPropriety
        update: (data: SettingUpdate) => void
        objKey: SettingUpdateKey
        changeVolume?: (data: SettingVolumeUpdate) => void
    } = $props()

    // A writable $derived: reading `currentValue` tracks `data.value`, but
    // the branches below can still locally reassign it to diverge (e.g.
    // while the user is mid-edit) until `data.value` itself changes again.
    let currentValue = $derived(data.value)
    // QUIRK: deliberately a plain one-time-read $state, NOT a $derived like
    // currentValue above - data.volume changing later must NOT overwrite an
    // in-progress local volume drag.
    // svelte-ignore state_referenced_locally
    let volume = $state(data.type === 'instrument' ? data.volume : 0)

    function handleCheckbox(value: boolean) {
        if (data.type === 'checkbox') {
            update({
                key: objKey,
                data: {...data, value}
            })
        }
    }

    const rowBackground = $derived(theme.layer('menu_background', 0.15).toString())
</script>

<div class="settings-row" style="background-color:{rowBackground}">
    <div class={hasTooltip(data.tooltip)} style="flex:1">
        {t(`settings:props.${data.name}`)}
        {#if data.tooltip}
            <Tooltip style="width:12rem">
                {t(`settings:props.${data.tooltip}`)}
            </Tooltip>
        {/if}
    </div>
    {#if data.type === 'select'}
        <SettingsSelect
            data={data}
            onChange={update}
            value={data.value}
            objectKey={objKey}
        >
            {#each data.options as option (option)}
                <option value={option}>{option}</option>
            {/each}
        </SettingsSelect>
    {/if}
    {#if data.type === 'number' || data.type === 'text'}
        <SettingsInput
            data={data}
            value={currentValue as string | number}
            onChange={(v) => currentValue = v}
            onComplete={update}
            objectKey={objKey}
        />
    {/if}
    {#if data.type === 'checkbox'}
        <Switch
            checked={currentValue as boolean}
            onchange={handleCheckbox}
        />
    {/if}
    {#if data.type === 'slider'}
        <SettingsSlider
            objectKey={objKey}
            data={data}
            value={currentValue as number}
            onChange={update}
        />
    {/if}
    {#if data.type === 'instrument' && changeVolume}
        <InstrumentInput
            volume={volume}
            onInstrumentPick={update}
            onVolumeChange={(v) => volume = v}
            onVolumeComplete={changeVolume}
            instrument={data.value}
            data={data}
            objectKey={objKey}
        />
    {/if}
</div>

<style>
    .settings-row {
        display: flex;
        justify-content: space-between;
        padding: 0.4rem;
        border-radius: 0.2rem;
        color: var(--menu-background-text);
        align-items: center;
        margin-bottom: 0.3rem;
    }

    .settings-row div {
        display: flex;
        align-items: center;
    }

    /* :global() because the input/select this reaches is rendered by a child
       component's own template (SettingsInput, SettingsSelect, SettingsSlider,
       InstrumentInput) - not by this component's, so scoped CSS can't cross
       that component boundary on its own. */
    .settings-row :global(:is(input, select)) {
        background-color: var(--primary);
        color: var(--primary-text);
        border: none;
        text-align: center;
        width: 8rem;
        padding: 0.2rem;
        border-radius: 0.2rem;
    }

    /* Same cross-component reason as above, for SettingsSlider/InstrumentInput's range input. */
    .settings-row :global(input[type='range']) {
        padding: 0;
        margin: 0;
    }

    /* QUIRK: `.invalid` below is unused - no current template applies that
       class near a settings row - but is kept, wrapped in :global(), so
       svelte-check's unused-selector check doesn't flag it. Not dead code
       to prune. */
    .settings-row :global(.invalid) {
        background-color: var(--red) !important;
    }
</style>
