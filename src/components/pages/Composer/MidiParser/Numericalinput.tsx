import useDebounce from '$lib/Hooks/useDebounce'
import {ChangeEvent, useEffect, useState} from 'react'

interface NumberInputProps {
    onChange: (value: number) => void
    value: number
    placeholder?: string
    className?: string
    delay?: number
    step?: number
    style?: React.CSSProperties
}

export function NumericalInput({
                                   onChange,
                                   value,
                                   delay = 800,
                                   step = 1,
                                   style,
                                   placeholder,
                                   className
                               }: NumberInputProps) {
    const [elementValue, setElementValue] = useState(`${value}`)
    const debounced = useDebounce<string>(elementValue, delay)
    useEffect(() => {
        const parsed = Number(debounced)
        if (Number.isFinite(parsed)) {
            onChange(parsed)
        } else {
            setElementValue('0')
        }
    }, [debounced, onChange]);
    useEffect(() => {
        setElementValue(`${value}`)
    }, [value])
    return <div style={{display: 'flex', justifyContent: 'flex-end'}} className={className}>
        <button
            onClick={() => setElementValue(`${Number(elementValue) - step}`)}
            className='midi-btn-small'
            style={style}
        >-
        </button>
        <input
            type="text"
            placeholder={placeholder}
            value={elementValue}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setElementValue(e.target.value)}
            className='midi-input'
            style={{margin: '0 0.3rem', ...style}}
        />
        <button
            onClick={() => setElementValue(`${Number(elementValue) + step}`)}
            className='midi-btn-small'
            style={style}
        >+
        </button>
    </div>
}