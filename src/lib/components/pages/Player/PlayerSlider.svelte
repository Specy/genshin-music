<script lang="ts">
    import * as workerTimers from 'worker-timers'
    import {DEFAULT_DOM_RECT} from '$core/legacyConfig'
    import {clamp} from '$core/utils/Utilities'
    import {playerControlsStore} from '$stores/PlayerControlsStore.svelte'
    import './Slider.css'

    // QUIRK: the .slider-current transform below divides by playerControlsStore.state.size with
    // no zero-guard (unlike the start/end $derived values further down, which do check size !== 0)
    // - when no song is loaded (size === 0) this evaluates to translateY(NaN%). Harmless only
    // because PlayerSongControls.svelte hides this component's wrapper via display:none whenever
    // there is no song - don't remove that hiding without also guarding this.
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

<!-- Pointer handlers only, no keyboard equivalent - accepted a11y gap. -->
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
            <!-- oninput (not onchange) on both thumbs: commits live per keystroke, matching the
                 drag-thumb's live feedback - onchange would only commit on blur. -->
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
