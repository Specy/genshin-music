import LoggerStore from "stores/LoggerStore"

interface ThemeInputProps{
    name: string, 
    value: string, 
    disabled: boolean, 
    onChange: (value:string) => void,
    onLeave?: () => void
}


export function ThemeInput({ name , onChange, disabled, value, onLeave}: ThemeInputProps) {
    return <div className="theme-row">
        <div>
            {name}
        </div>
        <input
            className="theme-input"
            style={{ width: '9rem' }}
            placeholder="Write here"
            disabled={disabled}
            value={value}
            onPointerDown={() => {
                if(disabled) LoggerStore.warn('Create a new theme first')
            }}
            onBlur={() => { if(onLeave) onLeave()}}
            onChange={(e) => onChange(e.target.value)}
        />
    </div>
}