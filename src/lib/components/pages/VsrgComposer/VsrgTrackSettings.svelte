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

    // Old: src/components/pages/VsrgComposer/VsrgTrackSettings.tsx (147 lines) - the floating
    // per-track settings popup opened from VsrgTop.svelte's TrackSelector gear button.
    //
    // `if (!track) return null` (old) is preserved as an `{#if track}` guard below: `track` is typed
    // non-optional in old's own props interface, but old still defends against it being momentarily
    // undefined (the parent passes `vsrg.tracks[selectedTrack]`, which can be `undefined` for one
    // render right after deleting the last/currently-selected track) - reproduced, not "cleaned up"
    // away just because the type claims otherwise.
    //
    // `track.instrument.set({...})` mutates the SAME `InstrumentData` instance the parent's
    // `vsrg.tracks[selectedTrack]` already holds, THEN calls `onChange(track)` - which is literally
    // the identical reference being handed back (`vsrg.tracks[index] = track` in the page's
    // `onTrackChange` is a same-value reassignment) - the REAL effect is the page's own
    // `refreshVsrg()` that follows, which this component doesn't need to know about (same
    // callback-prop contract old used).
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

    let isColorPickerOpen = $state(false)
</script>

{#snippet faTrashIcon()}
    <!-- react-icons/fa's FaTrash (unpkg.com/react-icons@5.6.0/fa/index.mjs), same source already
         verified for ComposerSongRow.svelte's own copy; old passed color='var(--red)' (a bare CSS
         color, not the hex literal ComposerSongRow's own delete icon uses) + marginRight 0.3rem. -->
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
            <!-- old's conditional branch re-set the SAME margin-left:0.4rem the base style already
                 has (a real, harmless old redundancy - the object-spread `{color, marginLeft:
                 "0.4rem"}` just re-declares an existing key) - the repeated declaration is dropped
                 here (svelte/no-dupe-style-properties, a hard lint error) since it is a byte-for-
                 byte no-op either way: only the `color` addition is the actual conditional effect. -->
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
            <AppButton className="row-centered" style="padding:0.4rem;width:fit-content" onclick={onDelete}>
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
