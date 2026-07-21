<script lang="ts">
    import LibColorPicker from 'svelte-awesome-color-picker'
    import Color from 'color'
    import {game} from '$game'

    // Old: src/components/shared/Inputs/ColorPicker.tsx
    // Old wrapped react-colorful's HexColorPicker (the saturation/hue widget) + HexColorInput (a
    // bare hex text <input>, rendered manually behind a literal "#" prefix div). This task's
    // dispatch replaces react-colorful with `svelte-awesome-color-picker` (NEW dep, installed this
    // task - see package.json for the pinned version); its default-exported `ColorPicker` renders
    // the equivalent saturation/hue picking surface with its own bundled (scoped, per-component)
    // styles, so - unlike react-colorful, which needed a manually-imported `dist/index.css` this
    // app never actually did import (grepped the whole old branch: zero `react-colorful/dist`
    // imports anywhere; its default look came entirely from Theme.css's own `.react-colorful`/
    // `.react-colorful__pointer`/`.react-colorful__pointer-fill` override rules) - nothing extra
    // needs importing here.
    //
    // `isDialog={false}` reproduces old's "always visible, no built-in open/close toggle" behavior
    // (visibility here is entirely externally controlled by whatever renders <ColorPicker>, exactly
    // like old); `isTextInput={false}` suppresses the library's OWN hex/rgb/hsv text-input row so
    // this component can own the `.color-picker-input` DOM/classes itself (see below) instead of
    // the library's differently-classed equivalent - important because Theme.css's `.color-picker*`
    // rules (arriving Task 9) target those OLD class names specifically, and only markup literally
    // wearing them will pick up that styling. `isAlpha={false}` matches old's hex-only (no alpha)
    // mode, since old used react-colorful's plain `HexColorPicker`/`HexColorInput`, not the alpha
    // variant (`HexAlphaColorPicker`, used elsewhere in old for the different Theme-page-only
    // `ThemePropriety.tsx`, out of this task's scope).
    //
    // The library is used one-way-controlled (`hex={color.hex()}` + `onInput`), mirroring old's own
    // controlled `color={color.hex()} onChange={handleChange}` pattern on HexColorPicker/
    // HexColorInput exactly, rather than Svelte's `bind:hex` two-way sugar.
    //
    // react-colorful's `HexColorInput` (a validated, no-# hex text input) has no equivalent left in
    // this file once `isTextInput={false}` is set - reimplemented below as a small, documented,
    // sanctioned inline replacement (a regex-validated plain <input>) so the `.color-picker-input`
    // DOM/classes stay exactly as old had them (the "#" prefix div + input, both old literal
    // elements).
    //
    // FaCheck/FaTimes (react-icons/fa) inlined as raw <svg>, no react-icons dependency - same
    // convention as Logger.svelte/FloatingDropdown.svelte/HelpTooltip.svelte (Phase 3). Logger's
    // own icon set doesn't include these two (it has FaCheckCircle/FaExclamationTriangle/
    // FaTimesCircle, not the plain FaCheck/FaTimes old used here), so both were fetched fresh from
    // the same cited source version (unpkg.com/react-icons@5.6.0/fa/index.mjs, FaCheck/FaTimes
    // GenIcon() calls) - FaTimes's path/viewBox came out byte-identical to the copy already inlined
    // in `utility/FloatingDropdown.svelte`, cross-checked against that file as a sanity confirmation
    // of the source version. Old passed `size={16}` explicitly on both (no `color` prop), so the
    // wrapper's `height`/`width` are the literal "16" rather than the usual default "1em".
    //
    // Two-tier rule: `BASE_THEME_CONFIG.text.light`/`.dark` (old, from `$config`) -> UI code reads
    // this from `game.themes.baseConfig.text.light`/`.dark` directly (never `$core/legacyConfig`),
    // same as `BaseNote.svelte` already established.
    let {
        onChange,
        value,
        absolute = true,
        style = '',
    }: {
        value: string
        absolute?: boolean
        style?: string
        onChange?: (color: string) => void
    } = $props()

    // Old: `const [color, setColor] = useState(Color(value))` +
    // `useEffect(() => setColor(Color(value)), [value])`. A *writable* `$derived` (Svelte >=5.25)
    // replaces both the `$state` and its resync `$effect` in one: reading `color` tracks `value`
    // normally; `handleChange`/`cancel` below can still assign `color = ...` directly to diverge
    // from it locally while the user drags/types, and that override is itself overwritten the next
    // time `value` (the prop) actually changes - the exact same "diverge locally, resync on prop
    // change" behavior old's separate state+effect pair gave (eslint's `svelte/prefer-writable-
    // derived` flags the old two-piece shape specifically for this rewrite).
    let color = $derived(Color(value))

    function handleChange(hex: string) {
        color = Color(hex)
    }

    function sendEvent() {
        onChange?.(color.toString())
    }

    function cancel() {
        color = Color(value)
        onChange?.(value)
    }

    const HEX_DIGITS = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/

    function handleHexInput(e: Event & {currentTarget: EventTarget & HTMLInputElement}) {
        const digits = e.currentTarget.value
        if (HEX_DIGITS.test(digits)) handleChange('#' + digits)
    }

    const textColor = $derived(
        color.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark
    )
</script>

<div class="color-picker" style="position:{absolute ? 'absolute' : 'unset'};{style}">
    <LibColorPicker
        hex={color.hex()}
        isAlpha={false}
        isDialog={false}
        isTextInput={false}
        onInput={(c) => {
            if (c.hex) handleChange(c.hex)
        }}
    />
    <div class="color-picker-row">
        <div class="color-picker-input" style="background-color:{color.toString()};color:{textColor}">
            <div style="font-family:Arial">#</div>
            <input value={color.hex().replace('#', '')} oninput={handleHexInput} style="color:{textColor}" />
        </div>
        <!-- Old ColorPicker.tsx's cancel/confirm buttons never had an aria-label/title either (only
             the bare FaTimes/FaCheck icon as content) - preserved as-is rather than inventing new
             a11y attributes old didn't have; suppressing the compiler's (correct, in general)
             icon-only-button nudge for this specific faithfully-ported pair. -->
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button
            class="color-picker-check"
            onclick={cancel}
            style="background-color:{color.toString()};color:{textColor}"
        >
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 352 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg>
        </button>
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button
            class="color-picker-check"
            onclick={sendEvent}
            style="background-color:{color.toString()};color:{textColor}"
        >
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"/></svg>
        </button>
    </div>
</div>

<style>
    /* fallback until Theme.css lands (Task 9 removes) */
    /* Byte-identical values to old src/app/_client-pages/theme/Theme.css's `.color-picker`/
       `.color-picker-input`/`.color-picker-input *`/`.color-picker-input input`/`.color-picker-row`/
       `.color-picker-check` rules. Deliberately NOT included: old Theme.css's `.react-colorful`/
       `.react-colorful__pointer`/`.react-colorful__pointer-fill` overrides - those target
       react-colorful's own class names, which can never appear in this component's DOM now that
       it's built on svelte-awesome-color-picker instead. Task 9 (porting the rest of Theme.css)
       should SKIP that three-rule block for the same reason. */
    .color-picker {
        position: absolute;
        padding: 0.3rem;
        border-radius: 0.6rem;
        background-color: #efeff0;
        z-index: 2;
        right: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        box-shadow: 1px 1px 5px #45455994;
        animation: show 0.2s;
        width: 13.6rem;
    }

    .color-picker-input {
        display: flex;
        align-items: center;
        margin: 0;
        width: calc(100% - 4.6rem);
        box-sizing: border-box;
        border: none;
        border-radius: 0.4rem;
        font-size: 1rem;
        box-shadow: -1px -1px 5px rgb(0, 0, 0, 0.2);
    }

    .color-picker-input * {
        transform: translateY(0.05rem);
    }

    .color-picker-input input {
        padding: 0.4rem;
        display: flex;
        margin: 0;
        width: 100%;
        background-color: transparent;
        box-sizing: border-box;
        outline: none;
        border: none;
    }

    .color-picker-row {
        display: flex;
        height: 2rem;
        margin-top: 0.3rem;
    }

    .color-picker-check {
        width: 2rem;
        height: 2rem;
        border-radius: 0.4rem;
        border: none;
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 0;
        margin-left: 0.3rem;
        padding: 0;
        cursor: pointer;
        box-shadow: -1px -1px 5px rgb(0, 0, 0, 0.2);
    }

    /* `.color-picker`'s `animation: show 0.2s` above references this - old defined `@keyframes
       show` in the same Theme.css file, not some already-ported global stylesheet, so it's
       included here too (Svelte scopes local @keyframes per-component, so this can't collide with
       Theme.css's own copy of the same rule once Task 9 lands it globally). Removed together with
       the rest of this fallback block when that happens. */
    @keyframes show {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }
</style>
