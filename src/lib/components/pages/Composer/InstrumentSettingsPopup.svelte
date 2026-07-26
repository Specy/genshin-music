<script module lang="ts">
    import type {InstrumentNoteIcon} from '$core/Songs/SongClasses'

    // Old: src/components/pages/Composer/InstrumentControls/InstrumentSettingsPopup.tsx (199
    // lines). The per-instrument popup (name, instrument select, pitch, volume slider, reverb
    // toggle, note icon, delete). Module-level helpers, same placement as old's own module scope.
    function getReverbValue(reverb: boolean | null): 'Unset' | 'On' | 'Off' {
        if (reverb === null) return 'Unset'
        return reverb ? 'On' : 'Off'
    }

    function toReverbValue(value: string): boolean | null {
        if (value === 'Unset') return null
        return value === 'On'
    }

    const noteIcons: InstrumentNoteIcon[] = ['circle', 'border', 'line']
</script>

<script lang="ts">
    import type {Pitch} from '$lib/games/types'
    import {InstrumentData} from '$core/Songs/SongClasses'
    import {t} from '$i18n/binding.svelte'
    import {clickOutside} from '$lib/utils/clickOutside'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import PitchSelect from '$cmp/inputs/PitchSelect.svelte'
    import InstrumentSelect from '$cmp/inputs/InstrumentSelect.svelte'
    import Select from '$cmp/inputs/Select.svelte'
    import HelpTooltip from '$cmp/utility/HelpTooltip.svelte'

    // `capitalize`/`prettyPrintInstrumentName` (old's own `$lib/utils/Utilities` imports) are
    // DEAD in old too - neither is actually called anywhere in old's render body (verified against
    // the raw blob); dropped rather than imported-then-unused (this project's eslint would flag an
    // unused import, unlike old's untyped tooling).
    //
    // `useClickOutside<HTMLDivElement>(onClose, {active: true, ignoreFocusable: true})` -> the
    // `clickOutside` action applied directly with `use:` on this component's OWN root div (not the
    // manual $effect+bind pattern the Menu components need - this is a plain same-component ref,
    // the simple case). Old's hook was called unconditionally ahead of the early `!instrument`
    // return (a React rules-of-hooks requirement) with its ref left unattached on that branch's own
    // div - an unreachable-in-practice edge case (`instrument` is always `instruments[selected]`
    // from `InstrumentControls.svelte`, which is never invoked with an empty instrument list) that
    // has no clean Svelte-action equivalent (a `use:` directive only ever runs on an element that
    // actually exists) - the action is applied only on the real (has-instrument) branch's div below,
    // matching where old's `ref={ref}` was actually attached.
    //
    // Native `<select className={s.select}>` (the note-icon picker) -> the shared
    // `$cmp/inputs/Select.svelte` component instead of re-inlining `Settings.module.css`'s `.select`
    // rule a fourth time in this codebase (already duplicated by `Select.svelte`/
    // `InstrumentSelect.svelte`/`PitchSelect.svelte` for the same old shared-but-not-modular CSS) -
    // `Select.svelte`'s own `handleChange` already blurs the target internally, so old's manual
    // `e.target.blur()` is simply subsumed, not dropped.
    //
    // Text `<input>`'s `onChange` -> `oninput` (React's onChange for a text input fires on every
    // keystroke, i.e. the native `input` event, not `change`); the reverb `<select>`'s `onChange`
    // stays `onchange` (native `<select>` value-commit semantics, and the shared `Select.svelte`'s
    // own prop is itself named `onchange`); the volume range `<input type="range">`'s `onChange`
    // is kept as `onchange` too, matching this migration's own established precedent for range
    // inputs (`$cmp/settings/SettingsSlider.svelte`), not `oninput`.
    let {
        instrument,
        onChange,
        onDelete,
        onClose,
        onChangePosition,
        currentLayer,
        instruments,
    }: {
        currentLayer: number
        instruments: InstrumentData[]
        instrument: InstrumentData
        onChange: (instrument: InstrumentData) => void
        onChangePosition: (direction: 1 | -1) => void
        onDelete: () => void
        onClose: () => void
    } = $props()
</script>

{#if !instrument}
    <!-- PRESERVED QUIRK: old's className here has TWO spaces between the two class tokens
         ("floating-instrument-settings  box-shadow") - a harmless typo (HTML class-list whitespace
         is insignificant), reproduced byte-for-byte; the real (has-instrument) branch below has
         only one space, matching old exactly. -->
    <div class="floating-instrument-settings  box-shadow">
        {t('instrument_settings:no_instrument_selected')}
    </div>
{:else}
    <div class="floating-instrument-settings box-shadow" use:clickOutside={{active: true, ignoreFocusable: true, onOutside: onClose}}>
        <div class="row space-between">
            {t('instrument_settings:layer_name')}
            <input
                type="text"
                maxlength="50"
                class="input"
                style="width:7.4rem"
                value={instrument.alias}
                oninput={(e) => onChange(instrument.set({alias: e.currentTarget.value}))}
                placeholder={t(`instruments:${instrument.name}`)}
            />
        </div>

        <div class="row space-between" style="margin-top:0.4rem">
            {t('common:instrument')}
            <InstrumentSelect
                style="width:8rem"
                selected={instrument.name}
                onChange={(name) => onChange(instrument.set({name}))}
            />
        </div>
        <div class="row space-between" style="margin-top:0.4rem">
            {t('common:pitch')}
            <PitchSelect
                style="padding:0.3rem;width:8rem"
                selected={instrument.pitch as Pitch}
                onChange={(pitch) => onChange(instrument.set({pitch}))}
            >
                <option value="">
                    {t('instrument_settings:use_song_pitch')}
                </option>
            </PitchSelect>
        </div>
        <div class="row space-between" style="margin-top:0.4rem">
            {t('common:reverb')}
            <Select
                style="padding:0.3rem;width:8rem"
                onchange={(e) => {
                    onChange(instrument.set({reverbOverride: toReverbValue(e.currentTarget.value)}))
                }}
                value={getReverbValue(instrument.reverbOverride)}
            >
                <option value="On">
                    {t('common:on')}
                </option>
                <option value="Off">
                    {t('common:off')}
                </option>
                <option value="Unset">
                    {t('instrument_settings:use_song_reverb')}
                </option>
            </Select>
        </div>

        <div class="row space-between" style="margin-top:0.4rem">
            {t('instrument_settings:note_icon')}
            <Select
                style="padding:0.3rem;width:8rem"
                onchange={(e) => onChange(instrument.set({icon: e.currentTarget.value as InstrumentNoteIcon}))}
                value={instrument.icon}
            >
                {#each noteIcons as iconKind (iconKind)}
                    <option value={iconKind}>{t(`common:${iconKind}`)}</option>
                {/each}
            </Select>
        </div>

        <div class="row" style="margin-top:1rem;align-items:center">
            {t('instrument_settings:volume')}
            <span style="margin-left:0.4rem;width:3rem{instrument.volume > 100 ? `;color:hsl(0, ${-40 + instrument.volume}%, 61%);margin-left:0.4rem` : ''}">
                {instrument.volume}%
            </span>
            <HelpTooltip
                buttonStyle="width:1.2rem;height:1.2rem"
                width={10}
            >
                {t('instrument_settings:volume_high_warning')}
            </HelpTooltip>
        </div>
        <div class="row">
            <input
                type="range"
                style="flex:1;opacity:{instrument.muted ? '0.6' : '1'}"
                min={0}
                max={125}
                value={instrument.volume}
                oninput={(e) => onChange(instrument.set({volume: Number(e.currentTarget.value)}))}
            />
            <AppButton
                className="flex-centered"
                toggled={instrument.muted}
                style="padding:0;min-width:unset;width:1.6rem;height:1.6rem;border-radius:2rem"
                onclick={() => {
                    if (instrument.volume === 0 && !instrument.muted) return
                    onChange(instrument.set({muted: !instrument.muted}))
                }}
            >
                {#if instrument.muted || instrument.volume === 0}
                    <!-- react-icons/fa's FaVolumeMute (unpkg.com/react-icons@5.6.0/fa/index.mjs);
                         old passed no explicit size (default "1em"). -->
                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M215.03 71.05L126.06 160H24c-13.26 0-24 10.74-24 24v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V88.02c0-21.46-25.96-31.98-40.97-16.97zM461.64 256l45.64-45.64c6.3-6.3 6.3-16.52 0-22.82l-22.82-22.82c-6.3-6.3-16.52-6.3-22.82 0L416 210.36l-45.64-45.64c-6.3-6.3-16.52-6.3-22.82 0l-22.82 22.82c-6.3 6.3-6.3 16.52 0 22.82L370.36 256l-45.63 45.63c-6.3 6.3-6.3 16.52 0 22.82l22.82 22.82c6.3 6.3 16.52 6.3 22.82 0L416 301.64l45.64 45.64c6.3 6.3 16.52 6.3 22.82 0l22.82-22.82c6.3-6.3 6.3-16.52 0-22.82L461.64 256z"/></svg>
                {:else}
                    <!-- react-icons/fa's FaVolumeUp, same sourcing; old passed no explicit size. -->
                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M215.03 71.05L126.06 160H24c-13.26 0-24 10.74-24 24v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V88.02c0-21.46-25.96-31.98-40.97-16.97zm233.32-51.08c-11.17-7.33-26.18-4.24-33.51 6.95-7.34 11.17-4.22 26.18 6.95 33.51 66.27 43.49 105.82 116.6 105.82 195.58 0 78.98-39.55 152.09-105.82 195.58-11.17 7.32-14.29 22.34-6.95 33.5 7.04 10.71 21.93 14.56 33.51 6.95C528.27 439.58 576 351.33 576 256S528.27 72.43 448.35 19.97zM480 256c0-63.53-32.06-121.94-85.77-156.24-11.19-7.14-26.03-3.82-33.12 7.46s-3.78 26.21 7.41 33.36C408.27 165.97 432 209.11 432 256s-23.73 90.03-63.48 115.42c-11.19 7.14-14.5 22.07-7.41 33.36 6.51 10.36 21.12 15.14 33.12 7.46C447.94 377.94 480 319.54 480 256zm-141.77-76.87c-11.58-6.33-26.19-2.16-32.61 9.45-6.39 11.61-2.16 26.2 9.45 32.61C327.98 228.28 336 241.63 336 256c0 14.38-8.02 27.72-20.92 34.81-11.61 6.41-15.84 21-9.45 32.61 6.43 11.66 21.05 15.8 32.61 9.45 28.23-15.55 45.77-45 45.77-76.88s-17.54-61.32-45.78-76.86z"/></svg>
                {/if}
            </AppButton>
        </div>
        <div class="row space-between" style="margin-top:1rem">
            <AppButton
                onclick={() => onChangePosition(-1)}
                disabled={currentLayer === 0}
                className="flex-centered"
                style="padding:0.5rem;flex:1;margin-right:0.4rem"
            >
                <!-- react-icons/fa's FaArrowUp; old passed no explicit size. -->
                <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" style="margin-right:0.2rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M34.9 289.5l-22.2-22.2c-9.4-9.4-9.4-24.6 0-33.9L207 39c9.4-9.4 24.6-9.4 33.9 0l194.3 194.3c9.4 9.4 9.4 24.6 0 33.9L413 289.4c-9.5 9.5-25 9.3-34.3-.4L264 168.6V456c0 13.3-10.7 24-24 24h-32c-13.3 0-24-10.7-24-24V168.6L69.2 289.1c-9.3 9.8-24.8 10-34.3.4z"/></svg>
                {t('instrument_settings:move_up')}
            </AppButton>
            <AppButton
                onclick={() => onChangePosition(1)}
                disabled={currentLayer === instruments.length - 1}
                className="flex-centered"
                style="padding:0.5rem;flex:1"
            >
                <!-- react-icons/fa's FaArrowDown; old passed no explicit size. -->
                <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" style="margin-right:0.2rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M413.1 222.5l22.2 22.2c9.4 9.4 9.4 24.6 0 33.9L241 473c-9.4 9.4-24.6 9.4-33.9 0L12.7 278.6c-9.4-9.4-9.4-24.6 0-33.9l22.2-22.2c9.5-9.5 25-9.3 34.3.4L184 343.4V56c0-13.3 10.7-24 24-24h32c13.3 0 24 10.7 24 24v287.4l114.8-120.5c9.3-9.8 24.8-10 34.3-.4z"/></svg>
                {t('instrument_settings:move_down')}
            </AppButton>
        </div>
        <div class="row space-between" style="margin-top:0.4rem">
            <AppButton
                className="row-centered"
                style="padding:0.4rem;width:fit-content"
                onclick={onDelete}
            >
                <!-- react-icons/fa's FaTrash; old passed color="var(--red)" (a DIFFERENT color
                     source than the literal "#ed4557" hex this migration's SongRow-style delete
                     icons use elsewhere - a real, disclosed per-file difference), margin-right
                     0.3rem (not the more common 0.4rem), no explicit size. -->
                <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" style="color:var(--red);margin-right:0.3rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"/></svg>
                {t('common:delete')}
            </AppButton>
            <AppButton
                onclick={onClose}
                style="padding:0.4rem;width:fit-content"
            >
                {t('common:ok')}
            </AppButton>
        </div>
    </div>
{/if}
