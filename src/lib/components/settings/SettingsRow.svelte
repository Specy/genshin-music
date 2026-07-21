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

    // Old: src/components/shared/Settings/SettingsRow.tsx
    // `theme` is imported directly (the reactive singleton) instead of threaded via `useTheme()` +
    // a prop, same as every other Phase 3/4 component (see SettingsSelect.svelte's own comment for
    // the fuller rationale) - this drops the old `[theme] = useTheme()` local entirely.
    // `React.memo(SettingsRow, (p, n) => p.data.value === n.data.value && p.data.volume ===
    // n.data.volume && p.update === n.update)` is dropped - a React re-render optimization Svelte's
    // fine-grained reactivity doesn't need (the Memoized precedent this whole migration has applied
    // to every other memo()-wrapped component: BodyDropper, MenuSidebar's DropHoverHinter, etc.).
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

    // Old: `const [currentValue, setValue] = useState(data.value)` +
    // `useEffect(() => setValue(data.value), [data.value])`. A *writable* `$derived` (Svelte
    // >=5.25) replaces both the `$state` and its resync `$effect` in one: reading `currentValue`
    // tracks `data.value` normally; the settings-type branches below can still assign
    // `currentValue = v` directly to diverge from it locally (e.g. while the user is mid-edit), and
    // that override is itself overwritten the next time `data.value` actually changes - the exact
    // same "diverge locally, resync on prop change" behavior old's separate state+effect pair gave,
    // just expressed as one declaration (eslint's `svelte/prefer-writable-derived` flags the old
    // two-piece shape specifically for this rewrite).
    let currentValue = $derived(data.value)
    // Old: `const [volume, setVolume] = useState(data.type === 'instrument' ? data.volume : 0)` -
    // deliberately has NO resync effect even in old (only `currentValue` gets one there), so this
    // stays a plain one-time-read `$state`, not a `$derived` - `data.volume` changing later must
    // NOT overwrite an in-progress local volume drag, matching old exactly.
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

    .settings-row :global(:is(input, select)) {
        background-color: var(--primary);
        color: var(--primary-text);
        border: none;
        text-align: center;
        width: 8rem;
        padding: 0.2rem;
        border-radius: 0.2rem;
    }

    .settings-row :global(input[type='range']) {
        padding: 0;
        margin: 0;
    }

    /* Old Settings.module.css's `.settings-row .invalid` rule - grepped the whole old
       Settings/Inputs tree and found no consumer that ever applies an `invalid` class anywhere
       near a settings row (dead CSS even in the old app). Ported anyway, wrapped in :global()
       so Svelte's unused-selector check doesn't flag it, per this migration's general preference
       for disclosed preservation over silent dropping. */
    .settings-row :global(.invalid) {
        background-color: var(--red) !important;
    }
</style>
