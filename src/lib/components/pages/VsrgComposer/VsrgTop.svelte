<script lang="ts">
    import type {Snippet} from 'svelte'
    import Color from 'color'
    import {game} from '$game'
    import type {VsrgHitObject, VsrgSong, VsrgTrack} from '$core/Songs/VsrgSong'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {t} from '$i18n/binding.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import VsrgTrackSettings from './VsrgTrackSettings.svelte'
    import VsrgComposerKeyboard from './VsrgComposerKeyboard.svelte'

    // Old: src/components/pages/VsrgComposer/VsrgTop.tsx (183 lines) - two old exports: `VsrgTop`
    // (default, the wrapper around the canvas `children` + the right sidebar) and a LOCAL,
    // non-exported `TrackSelector` function component (the per-track row in that sidebar).
    //
    // `TrackSelector` is folded into THIS file as the `trackSelector` snippet below rather than a
    // separate sibling file: unlike VsrgComposerMenu.tsx's own local SongRow/SelectSongRow (split
    // into sibling files this same task, see VsrgComposerSongRow.svelte/VsrgComposerAudioSongRow
    // .svelte), TrackSelector is never handed to a GENERIC `Component<T>`-typed prop anywhere (it's
    // called directly, `<TrackSelector .../>`, inside this file's own JSX) - the ONLY reason old's
    // SongRow/SelectSongRow needed real sibling `.svelte` files was `SongMenu.svelte`'s
    // `SongComponent: Component<T>` contract, which does not apply here. A `#snippet` reproduces
    // old's per-track color derivation faithfully: `{@const}` re-evaluates every time its
    // containing each-block instance re-renders, which happens whenever `ThemeProvider` itself
    // changes (a real dependency, tracked through `ThemeProvider.get()`'s own `$state` read) or
    // whenever `vsrg` is refreshed by the page (track add/delete/color/instrument change) - the
    // same two triggers old's `useEffect(..., [theme, track.color])` depended on. Old's OWN
    // `theme: Theme` prop is DROPPED (same established rationale as ComposerSongRow.svelte/
    // PlayerSongRow.svelte's own header comments): `ThemeProvider` is read directly instead.
    //
    // A11Y ADDITION (old's own `<div onClick={onTrackClick}>` had no role/tabindex/keydown handler
    // at all): `role="button" tabindex="0" onkeydown=...` added below, same established additive
    // convention as SongFolder.svelte/ComposerSongRow.svelte/PlayerSongRow.svelte's own identical
    // bare-onClick-div situations (their own header comments document the same fix) - not a
    // preserved-quirk situation, a repeated deliberate improvement this migration applies uniformly.
    //
    // `keyboardElements` (old: `useState<number[]>([])` + a MOUNT-ONLY `useEffect` computing
    // `new Array(APP_NAME === "Sky" ? 15 : 21).fill(0).map((_, i) => i)`) collapses to a plain
    // top-level constant: its size is `game.notes.perColumn` (two-tier: UI code reads `$game`
    // directly, never the CORE-only `NOTES_PER_COLUMN` re-export - this game-data value never
    // changes after the build-time `$game` alias is resolved, so there is nothing for a mount-effect
    // to actually be reactive to). `perRow` (old: `APP_NAME === "Sky" ? 5 : 7`) is likewise
    // `game.notes.perRow` directly.
    //
    // PRESERVED DEAD PROP: old's own `VsrgTop` destructures every prop EXCEPT `isHorizontal` (
    // verified against the raw blob: the props interface declares it, the page's call site passes
    // it, but the function's own parameter destructure omits it - never read anywhere in old's
    // render()). The page still passes `isHorizontal` below (byte-parity with old's own call site,
    // since `VsrgComposerCanvas` genuinely needs it) - this component just never consumes it,
    // exactly like old.
    let {
        vsrg,
        selectedTrack,
        children,
        onTrackAdd,
        onTrackChange,
        onTrackSelect,
        onTrackDelete,
        onNoteSelect,
        onBreakpointChange,
        onBreakpointSelect,
        lastCreatedHitObject,
        selectedHitObject,
    }: {
        vsrg: VsrgSong
        selectedTrack: number
        isHorizontal: boolean
        onTrackAdd: () => void
        onTrackDelete: (index: number) => void
        onTrackSelect: (index: number) => void
        onTrackChange: (track: VsrgTrack, index: number) => void
        onNoteSelect: (note: number) => void
        onBreakpointChange: (remove: boolean) => void
        onBreakpointSelect: (index: -1 | 1) => void
        children: Snippet
        lastCreatedHitObject: VsrgHitObject | null
        selectedHitObject: VsrgHitObject | null
    } = $props()

    const keyboardElements = new Array(game.notes.perColumn).fill(0).map((_, index) => index)

    let isTrackSettingsOpen = $state(false)

    const currentTrack = $derived(vsrg.tracks[selectedTrack])
</script>

{#snippet faStepBackwardIcon()}
    <!-- react-icons/fa's FaStepBackward, same source already verified for ComposerCanvas.svelte's
         own copy; old passed no explicit size (default "1em"), unlike that file's own size={16}. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M64 468V44c0-6.6 5.4-12 12-12h48c6.6 0 12 5.4 12 12v176.4l195.5-181C352.1 22.3 384 36.6 384 64v384c0 27.4-31.9 41.7-52.5 24.6L136 292.7V468c0 6.6-5.4 12-12 12H76c-6.6 0-12-5.4-12-12z"/></svg>
{/snippet}

{#snippet faMinusIcon()}
    <!-- react-icons/fa's FaMinus, same source already verified for InstrumentControls.svelte's own
         copy; old passed no explicit size here. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
{/snippet}

{#snippet faPlusIcon()}
    <!-- react-icons/fa's FaPlus, same source already verified for Composer.svelte's own copy; old
         passed no explicit size at this call site (default "1em") - see the SECOND, differently
         sized use of the same icon below (the add-track button, size=16). -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
{/snippet}

{#snippet faStepForwardIcon()}
    <!-- react-icons/fa's FaStepForward, same source already verified for ComposerCanvas.svelte's
         own copy; old passed no explicit size here. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M384 44v424c0 6.6-5.4 12-12 12h-48c-6.6 0-12-5.4-12-12V291.6l-195.5 181C95.9 489.7 64 475.4 64 448V64c0-27.4 31.9-41.7 52.5-24.6L312 219.3V44c0-6.6 5.4-12 12-12h48c6.6 0 12 5.4 12 12z"/></svg>
{/snippet}

{#snippet faCogIcon(color: string)}
    <!-- react-icons/fa's FaCog, same source already verified for ZenKeyboardMenu.svelte/
         InstrumentControls.svelte's own copies; old passed a `color` prop (react-icons merges a
         `color` prop straight into the rendered `style`), no explicit size. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style="color:{color}"><path d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"/></svg>
{/snippet}

{#snippet trackSelector(track: VsrgTrack, index: number)}
    {@const selected = index === selectedTrack}
    {@const themeColor = ThemeProvider.get('primary')}
    {@const mixed = themeColor.mix(new Color(track.color), 0.3)}
    {@const selectedBackground = mixed.toString()}
    {@const selectedText = mixed.isDark() ? 'var(--text-light)' : 'var(--text-dark)'}
    {@const trackColor = new Color(track.color)}
    {@const buttonBackground = trackColor.toString()}
    {@const buttonText = trackColor.isDark() ? 'rgb(220 219 216)' : 'rgb(55 55 55)'}
    <div
        class="vsrg-track row-centered"
        style="background-color:{selected ? selectedBackground : 'var(--primary)'};color:{selected ? selectedText : 'var(--primary-text)'}"
        onclick={() => onTrackSelect(index)}
        role="button"
        tabindex="0"
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTrackSelect(index) } }}
    >
        <span class="text-ellipsis" style="color:{selected ? selectedText : 'var(--text-color)'};padding-left:0.6rem;padding-right:0.2rem;flex:1">
            {track.instrument.alias || t(`instruments:${track.instrument.name}`)}
        </span>
        <AppButton
            onclick={() => selected && (isTrackSettingsOpen = !isTrackSettingsOpen)}
            style="background-color:{buttonBackground}"
            className="vsrg-track-left flex-centered"
        >
            {#if selected}
                {@render faCogIcon(buttonText)}
            {/if}
        </AppButton>
    </div>
{/snippet}

{@render children()}
<div class="vsrg-top-right {lastCreatedHitObject !== null ? 'vsrg-top-right-disabled' : ''}">
    {#if isTrackSettingsOpen}
        <VsrgTrackSettings
            track={currentTrack}
            onSave={() => isTrackSettingsOpen = false}
            onDelete={() => onTrackDelete(selectedTrack)}
            onChange={(track) => onTrackChange(track, selectedTrack)}
        />
    {/if}
    <Row align="center" className="vsrg-breakpoints-buttons" style="margin-bottom:0.4rem">
        <AppButton style="margin-left:0" onclick={() => onBreakpointSelect(-1)}>{@render faStepBackwardIcon()}</AppButton>
        <AppButton onclick={() => onBreakpointChange(true)}>{@render faMinusIcon()}</AppButton>
        <AppButton onclick={() => onBreakpointChange(false)}>{@render faPlusIcon()}</AppButton>
        <AppButton onclick={() => onBreakpointSelect(1)}>{@render faStepForwardIcon()}</AppButton>
    </Row>
    <div class="vsrg-track-wrapper column">
        {#each vsrg.tracks as track, index (index)}
            {@render trackSelector(track, index)}
        {/each}
        <div style="width:100%;height:1.4rem"></div>
        <AppButton
            onclick={(e) => {
                setTimeout(() => {
                    onTrackAdd()
                    ;(e.target as HTMLElement | null)?.scrollIntoView()
                }, 50)
            }}
            ariaLabel={t('common:add_new_instrument')}
            className="flex-centered"
            style="margin-top:auto;padding:0.3rem"
        >
            <!-- react-icons/fa's FaPlus, same source as the breakpoint-row copy above; old passed
                 size={16} + color='var(--icon-color)' (react-icons merges `color` into `style`, not
                 `fill` - matching the faCogIcon snippet's own established mechanism above). -->
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg" style="color:var(--icon-color)"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
        </AppButton>
    </div>
    <VsrgComposerKeyboard
        elements={keyboardElements}
        selected={selectedHitObject?.notes}
        perRow={game.notes.perRow}
        onClick={onNoteSelect}
    />
</div>
