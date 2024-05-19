import {capitalize} from "$lib/utils/Utilities"
import React, {useEffect, useRef, useState} from "react"

export type Option<T> = {
    value: T
    text: string
    color: string
}

interface MultipleOptionSliderProps<T> {
    options: Option<T>[]
    selected: T
    onChange: (value: T) => void
}

export function MultipleOptionSlider<T extends string>({options, selected, onChange}: MultipleOptionSliderProps<T>) {
    const ref = useRef<HTMLDivElement>(null)
    const selectedOption = options.find(option => option.value === selected)
    const [overlayState, setOverlayState] = useState({
        width: 0,
        left: 0,
    })
    useEffect(() => {
        const elements = ref.current?.querySelectorAll('button')
        const index = options.findIndex(e => e.value === selected)
        if (!elements || index < 0) return
        const bounds = elements[index].getBoundingClientRect()
        const parentBounds = ref.current!.getBoundingClientRect()
        setOverlayState({
            width: bounds.width - 3,
            //TODO for some reason first item is off by 2px
            left: bounds.left - (parentBounds.left),
        })
    }, [ref, options, selected])
    return <div
        className="multiple-option-slider"
        ref={ref}
        style={{
            border: `solid 0.1rem ${selectedOption?.color ?? "var(--accent)"}`,
        }}
    >
        {options.map((option) =>
            <button
                key={option.value}
                onClick={() => onChange(option.value)}
                className={option === selectedOption ? 'multiple-options-selected' : ''}
            >
                {capitalize(option.text)}
            </button>
        )}
        <div className="multiple-option-slider-overlay"
             style={{
                 width: `${overlayState.width}px`,
                 left: `${overlayState.left}px`,
                 backgroundColor: selectedOption?.color,
             }}
        />
    </div>
}