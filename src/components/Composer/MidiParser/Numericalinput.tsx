import useDebounce from '$/lib/Hooks/useDebounce'
import { useEffect, useState, ChangeEvent } from 'react'
interface NumberInputProps {
    onChange: (value: number) => void
    value: number
    placeholder?: string
    className?: string
    delay?: number
    step?: number
    style?: React.CSSProperties
}
export function NumericalInput({ onChange, value, delay = 500, step = 1, style, placeholder, className }: NumberInputProps) {
    const [elementValue, setElementValue] = useState(value)
    const debounced = useDebounce<number>(elementValue, delay)
    useEffect(() => {
        onChange(debounced)
    }, [debounced, onChange]);
    useEffect(() => {
        setElementValue(value)
    }, [value])
    return <div style={{ display: 'flex', justifyContent: 'flex-end' }} className={className}>
        <button
            onClick={() => setElementValue(elementValue - step)}
            className='midi-btn-small'
            style={style}
        >-</button>
        <input
            type="text"
            placeholder={placeholder}
            value={elementValue}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setElementValue(Number(e.target.value))}
            className='midi-input'
            style={{ margin: '0 0.3rem', ...style }}
        />
        <button
            onClick={() => setElementValue(elementValue + step)}
            className='midi-btn-small'
            style={style}
        >+</button>
    </div>
}