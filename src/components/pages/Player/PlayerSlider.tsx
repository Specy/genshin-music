import {DEFAULT_DOM_RECT} from "$config"
import Memoized from "$cmp/shared/Utility/Memoized"
import {useObservableObject} from "$lib/Hooks/useObservable"
import {clamp} from "$lib/utils/Utilities"
import {memo, MouseEvent, useCallback, useEffect, useRef, useState} from "react"
import {BsTriangleFill} from "react-icons/bs"
import {playerControlsStore} from "$stores/PlayerControlsStore"
import sl from "./Slider.module.css"
import {setTimeout} from "worker-timers";


export function _PlayerSlider() {
    const sliderState = useObservableObject(playerControlsStore.state)
    const [selectedThumb, setSelectedThumb] = useState<'start' | 'end' | null>(null)
    const [inputDimension, setInputDimension] = useState(DEFAULT_DOM_RECT)
    const thumb1 = useRef<HTMLDivElement>(null)
    const thumb2 = useRef<HTMLDivElement>(null)
    const slider = useRef<HTMLDivElement>(null)
    const [inputsEnabled, setInputsEnabled] = useState(true)
    useEffect(() => {
        //TODO remove the dependency and instead use the callback for the set state
        if (selectedThumb === null) return

        function resetSelection() {
            if (selectedThumb !== null) setSelectedThumb(null)
        }

        window.addEventListener('pointerup', resetSelection)
        window.addEventListener('blur', resetSelection)
        return () => {
            window.removeEventListener('pointerup', resetSelection)
            window.removeEventListener('blur', resetSelection)
        }
    }, [selectedThumb])

    function handleSelectChange(val: number, type: 'start' | "end") {
        if (type === 'start') {
            playerControlsStore.setPosition(Math.max(0, Math.min(val, sliderState.end)))
        } else {
            playerControlsStore.setState({end: Math.min(sliderState.size, Math.max(val, sliderState.position))})
        }
    }

    const handleSliderClick = (event: React.PointerEvent<HTMLDivElement>) => {
        if (slider.current && thumb1.current && thumb2.current) {
            const size = slider.current.getBoundingClientRect()
            const offset = event.clientY
            const thumb1Position = thumb1.current.getBoundingClientRect().y
            const thumb2Position = thumb2.current.getBoundingClientRect().y
            const left = Math.abs(thumb1Position - offset)
            const right = Math.abs(thumb2Position - offset)
            setInputDimension(size)
            const currentThumb = left >= right ? 'end' : 'start'
            setSelectedThumb(left >= right ? 'end' : 'start')
            handleSliderMove(event, currentThumb)
        }
    }

    function handleSliderLeave() {
        setSelectedThumb(null)
    }

    const enableInputs = useCallback((e: MouseEvent) => {
        setInputsEnabled(true)
        setTimeout(() => {
            // @ts-ignore
            e.currentTarget?.focus()
        }, 50)
    }, [])
    const disableInputs = useCallback(() => {
        setInputsEnabled(false)
    }, [])

    const handleSliderMove = (event: React.PointerEvent<HTMLDivElement>, override?: 'start' | 'end') => {
        if (selectedThumb === null && !override) return
        const currentThumb = override || selectedThumb
        const sliderSize = inputDimension.height
        const sliderOffset = inputDimension.y
        const eventPosition = event.clientY - sliderOffset
        //reverse the order from top to bottom
        const value = clamp(Math.round((1 - eventPosition / sliderSize) * sliderState.size), 0, sliderState.size)
        if (currentThumb === 'start') {
            if (value - sliderState.end < -1) playerControlsStore.setPosition(value)
        } else {
            if (value - sliderState.position > 1) playerControlsStore.setState({end: value})
        }
    }
    const start = sliderState.size !== 0 ? sliderState.position / sliderState.size * 100 : 0
    const end = sliderState.size !== 0 ? sliderState.end / sliderState.size * 100 : 100
    return <>
        <div
            className={sl["slider-outer"]}
            ref={slider}
            onPointerUp={handleSliderLeave}
            onPointerMove={handleSliderMove}
            onPointerDown={handleSliderClick}
        >
            <div className={sl["slider-full"]}>
                <div
                    className={sl["slider-current"]}
                    style={{transform: `translateY(${(100 - sliderState.current / sliderState.size * 100).toFixed(1)}%)`}}
                />
            </div>
            <div className={sl["two-way-slider"]}>

                <div className={sl["two-way-slider-thumb"]} style={{bottom: `calc(${end}% - 18px)`}} ref={thumb2}>
                    <input
                        type={'number'}
                        className={sl["slider-input"]}
                        style={{fontSize: '0.8rem'}}
                        value={sliderState.end}
                        onClick={enableInputs}
                        readOnly={!inputsEnabled}
                        onBlur={disableInputs}
                        onChange={e => handleSelectChange(+e.target.value, 'start')}
                    />
                    <Memoized>
                        <BsTriangleFill width={16} style={{filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)'}}/>
                    </Memoized>

                </div>
                <div className={sl["two-way-slider-thumb"]} style={{bottom: `calc(${start}% - 14px)`}} ref={thumb1}>
                    <input
                        type={'number'}
                        className={sl["slider-input"]}
                        style={{fontSize: '0.8rem'}}
                        value={sliderState.position}
                        onClick={enableInputs}
                        readOnly={!inputsEnabled}
                        onBlur={disableInputs}
                        onChange={e => handleSelectChange(+e.target.value, 'start')}
                    />
                    <Memoized>
                        <BsTriangleFill width={16} style={{filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)'}}/>
                    </Memoized>
                </div>
            </div>
        </div>
    </>
}

export const PlayerSlider = memo(_PlayerSlider, () => true)