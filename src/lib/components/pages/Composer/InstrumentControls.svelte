<script lang="ts">
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {InstrumentData} from '$core/Songs/SongClasses'
    import {t} from '$i18n/binding.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import InstrumentSettingsPopup from './InstrumentSettingsPopup.svelte'

    // Old: src/components/pages/Composer/InstrumentControls/index.tsx (206 lines, two components:
    // the default-exported `_InstrumentControls` wrapped in `memo`, plus a local, non-exported
    // `InstrumentButton` helper). The layer list with reorder buttons, add-instrument, and the
    // conditionally-rendered `InstrumentSettingsPopup`.
    //
    // `InstrumentButton` is inlined directly into the `{#each}` body below rather than ported as a
    // third sibling file: it is not in this task's file list (only `InstrumentControls.svelte` and
    // `InstrumentSettingsPopup.svelte` are), and unlike ComposerTools.tsx's `ToolButton` (a pure,
    // stateless helper - ported as a parameterized snippet), old's `InstrumentButton` owns a real
    // per-item DOM effect (`useRef` + `useEffect(() => { if (isSelected) ref.current
    // .scrollIntoView(...) }, [isSelected, ref])`, scrolling the button into view whenever IT
    // becomes the selected one) that a plain snippet cannot own (snippets have no lifecycle of
    // their own). Reproduced via `scrollIntoViewOnSelect` below, a small Svelte action applied with
    // `use:scrollIntoViewOnSelect={isSelected}` on each row's own root div - the direct
    // action-based equivalent of a per-element ref+effect, same category of substitution already
    // established throughout this migration (e.g. `clickOutside`).
    //
    // `theme: Theme` (old, threaded into `InstrumentButton` via a prop) -> `ThemeProvider` imported
    // directly, same established precedent as every other Phase-4 component.
    // `memo(_InstrumentControls, comparator)` dropped (Svelte 5 fine-grained reactivity).
    let {
        instruments,
        selected,
        onLayerSelect,
        onInstrumentChange,
        onInstrumentDelete,
        onInstrumentAdd,
        onChangePosition,
    }: {
        instruments: InstrumentData[]
        selected: number
        onLayerSelect: (index: number) => void
        onInstrumentChange: (instrument: InstrumentData, index: number) => void
        onInstrumentDelete: (index: number) => void
        onInstrumentAdd: () => void
        onChangePosition: (direction: 1 | -1) => void
    } = $props()

    let isEditing = $state(false)

    function setNotEditing() {
        isEditing = false
    }

    // Old: `useRef<HTMLDivElement>(null)` + `useEffect(() => { if (!isSelected || !ref.current)
    // return; ref.current.scrollIntoView({behavior: "auto", block: "nearest"}) }, [isSelected,
    // ref])`. `ref` never changes after mount in old either, so the effective dependency is just
    // `isSelected` - the action's own `update()` re-fires on every new `isSelected` value passed
    // via `use:scrollIntoViewOnSelect={isSelected}` below, matching that exactly (including
    // scrolling again on the FIRST attach if the row happens to mount already-selected, same as
    // old's effect firing once on mount too).
    function scrollIntoViewOnSelect(node: HTMLElement, isSelected: boolean) {
        function run(selected: boolean) {
            if (selected) node.scrollIntoView({behavior: 'auto', block: 'nearest'})
        }
        run(isSelected)
        return {
            update: run,
        }
    }
</script>

{#if isEditing}
    <InstrumentSettingsPopup
        instrument={instruments[selected]}
        currentLayer={selected}
        instruments={instruments}
        onChange={(ins) => onInstrumentChange(ins, selected)}
        onDelete={() => {
            onInstrumentDelete(selected)
            setNotEditing()
        }}
        onChangePosition={onChangePosition}
        onClose={setNotEditing}
    />
{/if}
<div class="column instruments-button-wrapper">
    {#each instruments as ins, i (ins.name + i)}
        {@const isSelected = i === selected}
        {@const passiveIconBase = ThemeProvider.getText('primary')}
        {@const passiveIcon = passiveIconBase.isDark() ? passiveIconBase.lighten(0.2) : passiveIconBase.darken(0.15)}
        <div
            class="instrument-button flex-centered {isSelected ? 'instrument-button-selected' : ''}"
            style={isSelected ? `background-color:${ThemeProvider.get('primary').mix(ThemeProvider.get('accent')).toString()}` : ''}
            use:scrollIntoViewOnSelect={isSelected}
        >
            {#if !isSelected}
                <div class="row" style="position:absolute;gap:0.2rem;top:0.2rem;left:0.3rem">
                    {#if !ins.visible}
                        <!-- react-icons/fa's FaEyeSlash (unpkg.com/react-icons@5.6.0/fa/index.mjs);
                             old passed size={14} + color={passiveIcon.hex()} (react-icons' `color`
                             prop merges into the rendered `style` as a plain CSS `color` property -
                             verified against the real iconBase.mjs source, cited in ComposerTools
                             .svelte's own header comment). -->
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" height="14" width="14" xmlns="http://www.w3.org/2000/svg" style="color:{passiveIcon.hex()}"><path d="M320 400c-75.85 0-137.25-58.71-142.9-133.11L72.2 185.82c-13.79 17.3-26.48 35.59-36.72 55.59a32.35 32.35 0 0 0 0 29.19C89.71 376.41 197.07 448 320 448c26.91 0 52.87-4 77.89-10.46L346 397.39a144.13 144.13 0 0 1-26 2.61zm313.82 58.1l-110.55-85.44a331.25 331.25 0 0 0 81.25-102.07 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64a308.15 308.15 0 0 0-147.32 37.7L45.46 3.37A16 16 0 0 0 23 6.18L3.37 31.45A16 16 0 0 0 6.18 53.9l588.36 454.73a16 16 0 0 0 22.46-2.81l19.64-25.27a16 16 0 0 0-2.82-22.45zm-183.72-142l-39.3-30.38A94.75 94.75 0 0 0 416 256a94.76 94.76 0 0 0-121.31-92.21A47.65 47.65 0 0 1 304 192a46.64 46.64 0 0 1-1.54 10l-73.61-56.89A142.31 142.31 0 0 1 320 112a143.92 143.92 0 0 1 144 144c0 21.63-5.29 41.79-13.9 60.11z"/></svg>
                    {/if}
                    {#if ins.muted}
                        <!-- react-icons/fa's FaVolumeMute, same sourcing; old passed size={14} +
                             color={passiveIcon.hex()}. -->
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="14" width="14" xmlns="http://www.w3.org/2000/svg" style="color:{passiveIcon.hex()}"><path d="M215.03 71.05L126.06 160H24c-13.26 0-24 10.74-24 24v144c0 13.25 10.74 24 24 24h102.06l88.97 88.95c15.03 15.03 40.97 4.47 40.97-16.97V88.02c0-21.46-25.96-31.98-40.97-16.97zM461.64 256l45.64-45.64c6.3-6.3 6.3-16.52 0-22.82l-22.82-22.82c-6.3-6.3-16.52-6.3-22.82 0L416 210.36l-45.64-45.64c-6.3-6.3-16.52-6.3-22.82 0l-22.82 22.82c-6.3 6.3-6.3 16.52 0 22.82L370.36 256l-45.63 45.63c-6.3 6.3-6.3 16.52 0 22.82l22.82 22.82c6.3 6.3 16.52 6.3 22.82 0L416 301.64l45.64 45.64c6.3 6.3 16.52 6.3 22.82 0l22.82-22.82c6.3-6.3 6.3-16.52 0-22.82L461.64 256z"/></svg>
                    {/if}
                </div>
            {/if}
            {#if !isSelected}
                <div style="position:absolute;top:0.4rem;right:0.4rem;height:fit-content">
                    {#if ins.icon === 'circle'}
                        <!-- react-icons/fa's FaCircle, same sourcing; old passed size={8} +
                             style={{display:'block'}} + color={passiveIcon.hex()}. -->
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="8" width="8" xmlns="http://www.w3.org/2000/svg" style="color:{passiveIcon.hex()};display:block"><path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8z"/></svg>
                    {/if}
                    {#if ins.icon === 'border'}
                        <!-- react-icons/bi's BiSquareRounded (BoxIcons, github.com/atisawd/boxicons,
                             svg/regular/bx-square-rounded.svg - a "regular"-style BoxIcons glyph
                             renders as a single solid path with a cut-out, same wrapper convention
                             as any other filled icon in this migration, NOT the tb-style outline
                             wrapper). Old passed size={12} + style={{display:'block',
                             marginRight:'-2px', marginTop:'-2px', strokeWidth:'2px'}} +
                             color={passiveIcon.hex()} - `strokeWidth:'2px'` is a deliberate old
                             addition ON TOP of this icon's own `stroke-width="0"` base attribute
                             (CSS `style` wins), giving the small glyph a visible 2px outline layered
                             over its solid fill; reproduced exactly, not simplified away. -->
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="12" width="12" xmlns="http://www.w3.org/2000/svg" style="color:{passiveIcon.hex()};display:block;margin-right:-2px;margin-top:-2px;stroke-width:2px"><path d="M17 2H7C4.243 2 2 4.243 2 7v10c0 2.757 2.243 5 5 5h10c2.757 0 5-2.243 5-5V7c0-2.757-2.243-5-5-5zm3 15c0 1.654-1.346 3-3 3H7c-1.654 0-3-1.346-3-3V7c0-1.654 1.346-3 3-3h10c1.654 0 3 1.346 3 3v10z"/></svg>
                    {/if}
                    {#if ins.icon === 'line'}
                        <!-- react-icons/fa's FaMinus, same sourcing; old passed size={8} +
                             style={{display:'block'}} + color={passiveIcon.hex()}. -->
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="8" width="8" xmlns="http://www.w3.org/2000/svg" style="color:{passiveIcon.hex()};display:block"><path d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
                    {/if}
                </div>
            {/if}

            <AppButton
                onclick={() => onLayerSelect(i)}
                style="background-color:transparent;width:100%"
                className="flex-grow flex-centered instrument-name-button"
            >
                <span class="text-ellipsis" style="width:6rem">
                    {ins.alias || t(`instruments:${ins.name}`)}
                </span>
            </AppButton>

            {#if isSelected}
                <div class="instrument-settings">
                    <AppButton onclick={() => isEditing = !isEditing} ariaLabel="Settings" className="flex-centered">
                        <!-- react-icons/fa's FaCog, same sourcing; old passed size={15}, no
                             className (unlike the ".icon"-classed menu-tab usage elsewhere in this
                             migration). -->
                        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="15" width="15" xmlns="http://www.w3.org/2000/svg"><path d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"/></svg>
                    </AppButton>
                    <AppButton
                        onclick={() => onInstrumentChange(ins.set({visible: !ins.visible}), i)}
                        ariaLabel={ins.visible ? 'Hide' : 'Show'}
                        className="flex-centered"
                    >
                        {#if ins.visible}
                            <!-- react-icons/fa's FaEye; old passed size={16}. -->
                            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M572.52 241.4C518.29 135.59 410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41 165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400a144 144 0 1 1 144-144 143.93 143.93 0 0 1-144 144zm0-240a95.31 95.31 0 0 0-25.31 3.79 47.85 47.85 0 0 1-66.9 66.9A95.78 95.78 0 1 0 288 160z"/></svg>
                        {:else}
                            <!-- react-icons/fa's FaEyeSlash; old passed size={16} here (a THIRD,
                                 distinct size from this same icon's two other call sites above -
                                 badge=14, this toggle=16 - a real old inconsistency, preserved). -->
                            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 640 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M320 400c-75.85 0-137.25-58.71-142.9-133.11L72.2 185.82c-13.79 17.3-26.48 35.59-36.72 55.59a32.35 32.35 0 0 0 0 29.19C89.71 376.41 197.07 448 320 448c26.91 0 52.87-4 77.89-10.46L346 397.39a144.13 144.13 0 0 1-26 2.61zm313.82 58.1l-110.55-85.44a331.25 331.25 0 0 0 81.25-102.07 32.35 32.35 0 0 0 0-29.19C550.29 135.59 442.93 64 320 64a308.15 308.15 0 0 0-147.32 37.7L45.46 3.37A16 16 0 0 0 23 6.18L3.37 31.45A16 16 0 0 0 6.18 53.9l588.36 454.73a16 16 0 0 0 22.46-2.81l19.64-25.27a16 16 0 0 0-2.82-22.45zm-183.72-142l-39.3-30.38A94.75 94.75 0 0 0 416 256a94.76 94.76 0 0 0-121.31-92.21A47.65 47.65 0 0 1 304 192a46.64 46.64 0 0 1-1.54 10l-73.61-56.89A142.31 142.31 0 0 1 320 112a143.92 143.92 0 0 1 144 144c0 21.63-5.29 41.79-13.9 60.11z"/></svg>
                        {/if}
                    </AppButton>
                </div>
            {/if}
        </div>
    {/each}
    <div style="min-height:1rem"></div>
    <AppButton
        onclick={(e) => {
            onInstrumentAdd()
            setTimeout(() => {
                // old: `// @ts-ignore` + `e.target?.scrollIntoView()` (`e.target` is typed as the
                // generic DOM `EventTarget`, lacking `.scrollIntoView()`). `e.currentTarget` (the
                // button this handler is actually attached to, always an Element) is used here
                // instead of a same-shaped `@ts-ignore`/cast on `e.target` - functionally
                // equivalent for this button (no child element could be the real click target
                // ahead of the button itself here), and avoids a lint-suppressing comment.
                (e.currentTarget as HTMLElement)?.scrollIntoView()
            }, 50)
        }}
        ariaLabel={t('common:add_new_instrument')}
        className="new-instrument-button flex-centered"
    >
        <!-- react-icons/fa's FaPlus; old passed size={16} + color='var(--icon-color)'. -->
        <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg" style="color:var(--icon-color)"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
    </AppButton>
</div>
