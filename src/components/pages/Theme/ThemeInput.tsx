import {logger} from "$stores/LoggerStore";
import {useState} from "react";

interface ThemeInputProps {
    name: string,
    value: string,
    disabled: boolean,
    onChange: (value: string) => void,
    onLeave?: () => void
}


export function ThemeInput({name, onChange, disabled, value, onLeave}: ThemeInputProps) {
    const [clicking, setClicking] = useState(false)
    return <div className="theme-row">
        <div>
            {name}
        </div>
        <input
            className="theme-input"
            style={{width: '9rem'}}
            placeholder="Write here"
            disabled={disabled}
            value={value}
            onPointerDown={() => {
                setClicking(true)
            }}
            onPointerUp={() => {
                setClicking(false)
                if (disabled && clicking) logger.warn('Create a new theme first')
            }}
            onPointerLeave={() => {
                setClicking(false)
            }}
            onBlur={() => {
                if (onLeave) onLeave()
            }}
            onChange={(e) => onChange(e.target.value)}
        />
    </div>
}