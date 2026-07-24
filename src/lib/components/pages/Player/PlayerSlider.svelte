<script lang="ts">
    import * as workerTimers from 'worker-timers'
    import {DEFAULT_DOM_RECT} from '$core/legacyConfig'
    import {clamp} from '$core/utils/Utilities'
    import {playerControlsStore} from '$stores/PlayerControlsStore.svelte'
    import './Slider.css'

    // Old: src/components/pages/Player/PlayerSlider.tsx (150 lines) - the two-way vertical drag
    // slider that sets the practice/approaching start+end range. `memo(_PlayerSlider, (p,v) =>
    // p.onChange === v.onChange)` is dropped (same rationale as every other memo drop this
    // migration - Svelte 5's fine-grained reactivity already only re-runs what changed).
    //
    // `useObservableObject(playerControlsStore.state)` -> `playerControlsStore.state` is already
    // `$state`-backed (Task 1); every old `sliderState.X` read below becomes a direct
    // `playerControlsStore.state.X` read, reactive wherever referenced.
    //
    // State split (per brief): `selectedThumb`/`inputDimension`/`inputsEnabled` are genuinely read
    // inside reactive (`$derived`-adjacent) expressions or need to retrigger the pointerup/blur
    // effect below, so they are `$state`. `thumb1`/`thumb2`/`slider` are plain (non-`$state`)
    // `let`s bound via `bind:this` - they are only ever read inside plain, later-invoked pointer
    // event handlers (never inside a template/`$derived` expression), so a plain mutable `let`
    // (populated once Svelte attaches the DOM node) is sufficient; the same reasoning already used
    // for e.g. `PlayerKeyboard.svelte`'s non-reactive closure locals.
    //
    // `useEffect(() => {...}, [selectedThumb])` (attach `pointerup`/`blur` listeners on `window`
    // while a thumb is selected, tear down otherwise/on unmount) -> a top-level `$effect` with the
    // identical body: it reruns (cleanup then re-setup) on every `selectedThumb` change exactly like
    // old's dependency-array effect, and Svelte tears it down automatically on unmount the same way
    // React's cleanup-on-unmount did. The inner `if (selectedThumb !== null) setSelectedThumb(null)`
    // guard is genuinely redundant in old too (the effect body already early-returns whenever
    // `selectedThumb` is null, so `resetSelection` can only ever be registered while it's non-null) -
    // kept verbatim for parity rather than simplified away.
    //
    // `worker-timers`' `setTimeout` (imported `* as workerTimers`, matching the established
    // `$core/utils/Utilities.ts` `delay()` convention, Task 1/P3-7) replaces old's `import
    // {setTimeout} from "worker-timers"` one-for-one in `enableInputs` - it keeps firing in
    // backgrounded/throttled tabs, unlike native `window.setTimeout`.
    //
    // REAL PORTING DECISION (not a mechanical 1:1 swap): old wired `onChange={e =>
    // handleSelectChange(+e.target.value, ...)}` on the two `<input type="number">` thumbs. React's
    // `onChange` for text-like `<input>`s (incl. `type="number"`) is implemented over the native
    // `input` event, not `change` - it fires on every keystroke, not on blur/commit (well-documented
    // React behavior, confirmed against old's own `Input.tsx`'s identical `onChange`-per-keystroke +
    // separate `onBlur`-commit split). The direct-parity Svelte translation is therefore `oninput`
    // (fires per keystroke, matching old's live-typing behavior), NOT `onchange` (native DOM change,
    // fires only on blur) - using `onchange` here would silently change interactive behavior (typing
    // "500" would only commit once on blur instead of clamping live after each digit). `onclick`/
    // `onblur` below map directly (React's onClick/onBlur already mirror the native click/blur
    // events one-for-one, no such distinction applies to them).
    //
    // `BsTriangleFill` (react-icons/bs, first consumer of the `bs` icon set in this migration) is
    // inlined below as a raw `<svg>`, sourced from unpkg.com/react-icons@5.6.0/bs/index.mjs (the
    // same pinned version cited throughout this migration) - `viewBox="0 0 16 16"`,
    // `fill-rule="evenodd"`. PRESERVED QUIRK (real, non-obvious): old passed `width={16}` to each
    // `<BsTriangleFill>`. react-icons' `IconBase` only ever derives the rendered `height`/`width`
    // SVG attributes from a `size` prop (`computedSize = props.size || conf.size || "1em"`), which
    // is applied to the underlying `<svg>` AFTER any other passthrough props are spread - so a bare
    // `width` prop (not `size`) is silently overwritten back to the `"1em"` default and has NO
    // effect on the rendered icon (verified directly against react-icons' `IconBase`/`GenIcon`
    // source, `lib/iconBase.mjs`). Old's `width={16}` is therefore dead - preserved as such below
    // (`height="1em" width="1em"`, NOT a literal `16`), not "fixed" to what a naive JSX reading would
    // suggest. `<Memoized>` (old's no-op memoization wrapper around the icon) is dropped, same
    // established precedent as every other `Memoized`/`MemoizedIcon` drop this migration.
    //
    // PRESERVED QUIRK: `.slider-current`'s inline transform (`translateY(${(100 -
    // sliderState.current / sliderState.size * 100).toFixed(1)}%)`) divides by `sliderState.size`
    // with NO zero-guard (unlike the `start`/`end` percentage locals just below it, which do check
    // `size !== 0`) - when no song is loaded (`size === 0`) this evaluates to `NaN` and renders
    // `translateY(NaN%)`. Kept byte-verbatim; in practice invisible because the parent
    // (`PlayerSongControls.svelte`, this task) hides this component's wrapper via `display:none`
    // whenever there is no song.
    let {onChange}: {onChange?: (start: number, end: number) => void} = $props()

    let selectedThumb: 'start' | 'end' | null = $state(null)
    let inputDimension: DOMRect = $state(DEFAULT_DOM_RECT)
    let inputsEnabled = $state(true)
    let thumb1: HTMLDivElement | undefined
    let thumb2: HTMLDivElement | undefined
    let slider: HTMLDivElement | undefined

    $effect(() => {
        //TODO remove the dependency and instead use the callback for the set state
        if (selectedThumb === null) return

        function resetSelection() {
            if (selectedThumb !== null) selectedThumb = null
        }

        window.addEventListener('pointerup', resetSelection)
        window.addEventListener('blur', resetSelection)
        return () => {
            window.removeEventListener('pointerup', resetSelection)
            window.removeEventListener('blur', resetSelection)
        }
    })

    function handleSelectChange(val: number, type: 'start' | 'end') {
        const state = playerControlsStore.state
        if (type === 'start') {
            playerControlsStore.setPosition(Math.max(0, Math.min(val, state.end)))
        } else {
            playerControlsStore.setState({end: Math.min(state.size, Math.max(val, state.position))})
        }
        onChange?.(playerControlsStore.current, playerControlsStore.end)
    }

    function handleSliderClick(event: PointerEvent) {
        if (slider && thumb1 && thumb2) {
            const size = slider.getBoundingClientRect()
            const offset = event.clientY
            const thumb1Position = thumb1.getBoundingClientRect().y
            const thumb2Position = thumb2.getBoundingClientRect().y
            const left = Math.abs(thumb1Position - offset)
            const right = Math.abs(thumb2Position - offset)
            inputDimension = size
            const currentThumb = left >= right ? 'end' : 'start'
            selectedThumb = left >= right ? 'end' : 'start'
            handleSliderMove(event, currentThumb)
        }
    }

    function handleSliderLeave() {
        selectedThumb = null
    }

    function enableInputs(e: MouseEvent) {
        inputsEnabled = true
        workerTimers.setTimeout(() => {
            (e.currentTarget as HTMLInputElement | null)?.focus()
        }, 50)
    }

    function disableInputs() {
        inputsEnabled = false
    }

    function handleSliderMove(event: PointerEvent, override?: 'start' | 'end') {
        if (selectedThumb === null && !override) return
        const currentThumb = override || selectedThumb
        const sliderSize = inputDimension.height
        const sliderOffset = inputDimension.y
        const eventPosition = event.clientY - sliderOffset
        //reverse the order from top to bottom
        const value = clamp(Math.round((1 - eventPosition / sliderSize) * playerControlsStore.state.size), 0, playerControlsStore.state.size)
        if (currentThumb === 'start') {
            if (value - playerControlsStore.state.end < -1) playerControlsStore.setPosition(value)
        } else {
            if (value - playerControlsStore.state.position > 1) playerControlsStore.setState({end: value})
        }
        onChange?.(playerControlsStore.current, playerControlsStore.end)
    }

    const start = $derived(playerControlsStore.state.size !== 0 ? playerControlsStore.state.position / playerControlsStore.state.size * 100 : 0)
    const end = $derived(playerControlsStore.state.size !== 0 ? playerControlsStore.state.end / playerControlsStore.state.size * 100 : 100)
</script>

<!-- old's own div had no ARIA role/keyboard handling on its pointer handlers either (verified
     against the old blob directly) - suppressed rather than adding a11y attributes old didn't
     have, same established convention as e.g. ThemePropriety.svelte/ThemePreview.svelte. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="slider-outer"
    bind:this={slider}
    onpointerup={handleSliderLeave}
    onpointermove={handleSliderMove}
    onpointerdown={handleSliderClick}
>
    <div class="slider-full">
        <div
            class="slider-current"
            style="transform:translateY({(100 - playerControlsStore.state.current / playerControlsStore.state.size * 100).toFixed(1)}%)"
        ></div>
    </div>
    <div class="two-way-slider">
        <div class="two-way-slider-thumb" style="bottom:calc({end}% - 18px)" bind:this={thumb2}>
            <input
                type="number"
                class="slider-input"
                style="font-size:0.8rem"
                value={playerControlsStore.state.end}
                onclick={enableInputs}
                readonly={!inputsEnabled}
                onblur={disableInputs}
                oninput={(e) => handleSelectChange(+e.currentTarget.value, 'end')}
            />
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" style="filter:drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M7.022 1.566a1.13 1.13 0 0 1 1.96 0l6.857 11.667c.457.778-.092 1.767-.98 1.767H1.144c-.889 0-1.437-.99-.98-1.767z"/></svg>
        </div>
        <div class="two-way-slider-thumb" style="bottom:calc({start}% - 14px)" bind:this={thumb1}>
            <input
                type="number"
                class="slider-input"
                style="font-size:0.8rem"
                value={playerControlsStore.state.position}
                onclick={enableInputs}
                readonly={!inputsEnabled}
                onblur={disableInputs}
                oninput={(e) => handleSelectChange(+e.currentTarget.value, 'start')}
            />
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" style="filter:drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M7.022 1.566a1.13 1.13 0 0 1 1.96 0l6.857 11.667c.457.778-.092 1.767-.98 1.767H1.144c-.889 0-1.437-.99-.98-1.767z"/></svg>
        </div>
    </div>
</div>
