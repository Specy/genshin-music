<script lang="ts">
    import Color from 'color'
    import type {VsrgTrack} from '$core/Songs/VsrgSong'
    import type {Pitch} from '$lib/games/types'
    import {vsrgComposerStore} from '$stores/VsrgComposerStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import InstrumentSelect from '$cmp/inputs/InstrumentSelect.svelte'
    import PitchSelect from '$cmp/inputs/PitchSelect.svelte'
    import HelpTooltip from '$cmp/utility/HelpTooltip.svelte'
    import ColorPicker from '$cmp/inputs/ColorPicker.svelte'

    // QUIRK: track's type claims non-optional, but the parent (vsrg.tracks[selectedTrack]) can
    // pass it as undefined for one render right after deleting the selected track - keep the
    // {#if track} guard below despite what the type says.
    let {
        track,
        onSave,
        onDelete,
        onChange,
    }: {
        track: VsrgTrack
        onSave: () => void
        onDelete: () => void
        onChange: (track: VsrgTrack) => void
    } = $props()

    // QUIRK: onChange(track) below always hands back the SAME (mutated in place) VsrgTrack
    // reference the parent already holds - it is not a "new value" signal. The parent re-triggers
    // its own refresh on any call regardless of reference equality; don't add a reference-equality
    // check here or upstream expecting onChange to only fire on a genuine identity change.
    let isColorPickerOpen = $state(false)
</script>

{#snippet faTrashIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" style="color:var(--red);margin-right:0.3rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"/></svg>
{/snippet}

{#if track}
    <div class="vsrg-floating-settings box-shadow">
        <Row justify="between" align="center">
            {t('vsrg_composer:track_name')}
            <input
                type="text"
                maxlength="50"
                class="input"
                style="width:7.4rem"
                value={track.instrument.alias}
                oninput={(e) => {
                    track.instrument.set({alias: e.currentTarget.value})
                    onChange(track)
                }}
                placeholder={t(`instruments:${track.instrument.name}`)}
            />
        </Row>
        <Row justify="between" align="center" style="margin-top:0.4rem">
            {t('common:instrument')}
            <InstrumentSelect
                style="width:8rem"
                selected={track.instrument.name}
                onChange={(name) => {
                    track.instrument.set({name})
                    onChange(track)
                }}
            />
        </Row>
        <Row justify="between" align="center" style="margin-top:0.4rem">
            {t('common:pitch')}
            <PitchSelect
                style="width:8rem"
                selected={track.instrument.pitch as Pitch}
                onChange={(pitch) => {
                    track.instrument.set({pitch})
                    onChange(track)
                }}
            >
                <option value="">
                    {t('instrument_settings:use_song_pitch')}
                </option>
            </PitchSelect>
        </Row>
        <Row align="center" style="margin-top:1rem">
            {t('instrument_settings:volume')}
            <!-- old redundantly re-declared margin-left here too (a harmless no-op); dropped to
                 satisfy svelte/no-dupe-style-properties (a lint error) - only the color addition
                 below is the real conditional effect. -->
            <span style="margin-left:0.4rem;width:3rem;{track.instrument.volume > 100 ? `color:hsl(0, ${-40 + track.instrument.volume}%, 61%)` : ''}">
                {track.instrument.volume}%
            </span>
            <HelpTooltip buttonStyle="width:1.2rem;height:1.2rem" width={10}>
                {t('instrument_settings:volume_high_warning')}
            </HelpTooltip>
        </Row>
        <Row align="center">
            <input
                type="range"
                style="flex:1"
                min="0"
                max="125"
                value={track.instrument.volume}
                oninput={(e) => {
                    track.instrument.set({volume: parseInt(e.currentTarget.value)})
                    onChange(track)
                }}
            />
        </Row>
        <Column>
            <Row justify="between" align="center">
                {t('common:color')}
                <AppButton
                    onclick={() => isColorPickerOpen = true}
                    ariaLabel="Change color"
                    style="background-color:{track.color};color:{Color(track.color).isDark() ? '#fff' : '#000'}"
                >
                    {t('common:change')}
                </AppButton>
            </Row>
        </Column>
        <Row justify="between" style="margin-top:0.4rem">
            <AppButton class="row-centered" style="padding:0.4rem;width:fit-content" onclick={onDelete}>
                {@render faTrashIcon()}
                {t('common:delete')}
            </AppButton>
            <AppButton onclick={onSave} style="padding:0.4rem;width:fit-content">
                {t('common:ok')}
            </AppButton>
        </Row>
    </div>
    {#if isColorPickerOpen}
        <ColorPicker
            style="right:0.8rem;top:0.5rem"
            value={track.color}
            onChange={(color) => {
                onChange(track.set({color}))
                isColorPickerOpen = false
                vsrgComposerStore.emitEvent('colorChange')
            }}
        />
    {/if}
{/if}
