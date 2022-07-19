import { capitalize } from "lodash"
import { useEffect, useRef, useState } from "react"


interface MultipleOptionSliderProps<T>{
    options: T[]
    selected: T
    onChange: (value: T) => void
}
export function MultipleOptionSlider<T extends string>({options, selected, onChange}: MultipleOptionSliderProps<T>){
    const ref = useRef<HTMLDivElement>(null)
    const [overlayState, setOverlayState] = useState({
        width: 0,
        left: 0,
    })
    useEffect(() => {
        const elements = ref.current?.querySelectorAll('button')
        const index = options.indexOf(selected)
        if(!elements || index < 0) return
        const bounds = elements[index].getBoundingClientRect()
        const parentBounds = ref.current!.getBoundingClientRect()
        setOverlayState({
            width: bounds.width,
            left: bounds.left - parentBounds.left,
        })
    }, [ref, options, selected])

    return <div className="multiple-option-slider" ref={ref}>
        {options.map(option => 
            <button 
                key={option} 
                onClick={() => onChange(option)} 
                className={option === selected ? 'multiple-options-selected' : ''}
            >
                {capitalize(option)}
            </button>    
        )}
        <div className="multiple-option-slider-overlay" 
            style={{
                width: `${overlayState.width}px`,
                left: `${overlayState.left}px`,
            }}
        />
    </div>
}