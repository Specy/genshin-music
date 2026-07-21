<script lang="ts">
    import LibColorPicker from 'svelte-awesome-color-picker'
    import Color from 'color'
    import {game} from '$game'
    import {ThemeProvider as theme, type ThemeKeys} from '$core/theme/ThemeProvider.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/pages/Theme/ThemePropriety.tsx.
    //
    // Old imported `capitalize` from `$lib/utils/Utilities` but never actually called it anywhere in
    // this file (grepped) - a pre-existing dead import, dropped here (this tree's eslint is
    // stricter than whatever the old CRA-era config enforced, same class of trim as the dropped
    // `MIDISettings` import noted in `MIDIProvider.ts`'s own header comment).
    //
    // Old used react-colorful's `HexAlphaColorPicker`/`HexColorInput alpha` DIRECTLY here (NOT the
    // shared `ColorPicker.tsx` component, which is hex-only/no-alpha) - `inputs/ColorPicker.svelte`
    // (Phase-4a Task 4) explicitly called this out as its own out-of-scope companion ("the different
    // Theme-page-only ThemePropriety.tsx"). This file re-establishes the SAME vendor-library pattern
    // Task 4 set up (`svelte-awesome-color-picker`, `isDialog={false}`/`isTextInput={false}` +  a
    // hand-rolled hex text row so the `.color-picker*` DOM/classes stay exactly as old had them) -
    // just with `isAlpha={true}` and an 8-hex-digit-accepting input regex, matching old's alpha
    // variant instead of Task 4's non-alpha one.
    //
    // Class rename: old's outer wrapper was literally `className="color-picker"` - RENAMED to
    // `.color-picker-wrapper` here (same rename `inputs/ColorPicker.svelte` already applied, for the
    // identical reason: `svelte-awesome-color-picker`'s OWN root element carries the literal class
    // `color-picker` internally - see that library's `ColorPicker.svelte` source - so a same-named
    // wrapper class would collide with the vendor's own scoped-but-unprefixed class and pick up its
    // rules unintentionally). Theme.css (this task) defines `.color-picker-wrapper` accordingly - the
    // Task-4-forecast rename this task closes out.
    let {
        name,
        value,
        onChange,
        isModified,
        setSelectedProp,
        isSelected,
        handlePropReset,
        canReset
    }: {
        name: ThemeKeys
        value: string
        isSelected: boolean
        isModified: boolean
        canReset: boolean
        setSelectedProp: (name: ThemeKeys | '') => void
        onChange: (name: ThemeKeys, value: string) => void
        handlePropReset: (name: ThemeKeys) => void
    } = $props()

    // Old: `const [color, setColor] = useState(Color(value))` + `useEffect(() => setColor(Color(value)),
    // [value])` - collapsed into one writable `$derived`, same pattern `inputs/ColorPicker.svelte`/
    // `settings/SettingsRow.svelte` already established for this exact "diverge locally while
    // editing, resync when the prop itself changes" shape.
    let color = $derived(Color(value))

    function handleChange(hex: string) {
        color = Color(hex)
    }

    function sendEvent() {
        const parsed = color.alpha() === 1 ? color.hex() : color.hexa()
        onChange(name, parsed)
        setSelectedProp('')
    }

    // Old's cancel handler reverts the local `color` and closes the picker - unlike
    // `inputs/ColorPicker.svelte`'s own cancel button, it does NOT call `onChange` (nothing to
    // commit).
    function cancel() {
        color = Color(value)
        setSelectedProp('')
    }

    // Widened vs `inputs/ColorPicker.svelte`'s own `HEX_DIGITS` (which deliberately DROPS the
    // 8-digit form for alpha-leak parity there) - this picker IS the alpha one, so 8-digit
    // (RRGGBBAA) hex must be accepted.
    const HEX_DIGITS = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/

    function handleHexInput(e: Event & {currentTarget: EventTarget & HTMLInputElement}) {
        const digits = e.currentTarget.value
        if (HEX_DIGITS.test(digits)) handleChange('#' + digits)
    }

    const textColor = $derived(color.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark)
</script>

{#snippet faCheckIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"/></svg>
{/snippet}

{#snippet faTimesIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 352 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg>
{/snippet}

<div
    class="theme-row {isSelected ? 'selected' : ''}"
    style={isSelected ? `background-color:${color.toString()};color:${textColor}` : ''}
>
    <div>
        {t(`theme:colors.${name}`)}
    </div>
    <div class="color-input-wrapper">
        {#if canReset && isModified}
            <AppButton onclick={() => handlePropReset(name)} toggled={isModified} className="theme-reset">
                {t('common:reset').toUpperCase()}
            </AppButton>
        {/if}
        {#if isSelected}
            <div class="color-picker-wrapper">
                <LibColorPicker
                    hex={color.hexa()}
                    isAlpha={true}
                    isDialog={false}
                    isTextInput={false}
                    onInput={(c) => {
                        if (c.hex) handleChange(c.hex)
                    }}
                />
                <div class="color-picker-row">
                    <div class="color-picker-input" style="background-color:{color.toString()};color:{textColor}">
                        <div style="font-family:Arial">#</div>
                        <input
                            value={(color.alpha() === 1 ? color.hex() : color.hexa()).replace('#', '')}
                            oninput={handleHexInput}
                            style="color:{textColor}"
                        />
                    </div>
                    <button class="color-picker-check" onclick={cancel} style="background-color:{color.toString()};color:{textColor}">
                        {@render faTimesIcon()}
                    </button>
                    <button class="color-picker-check" onclick={sendEvent} style="background-color:{color.toString()};color:{textColor}">
                        {@render faCheckIcon()}
                    </button>
                </div>
            </div>
        {:else}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                onclick={() => setSelectedProp(name)}
                class="color-preview"
                style="background-color:{theme.get(name).toString()};color:{theme.getText(name).toString()}"
            >
                Text
            </div>
        {/if}
    </div>
</div>
