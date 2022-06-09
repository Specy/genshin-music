import { ChangeEvent } from "react"
import { FaPlus, FaMinus } from 'react-icons/fa'
import { SettingsNumber, SettingsText, SettingUpdateKey } from "types/SettingsPropriety"

interface InputProps {
    data: SettingsText | SettingsNumber,
    objectKey: SettingUpdateKey,
    value: string | number,
    onChange: (value: string | number) => void,
    onComplete: (data: {
        key: SettingUpdateKey,
        data: any
    }) => void
}
export function Input({ data, value, onChange, onComplete, objectKey }: InputProps) {

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
        const el = e.target
        if (data.type === "number") {
            const value = Number(el.value)
            el.value = "" //have to do this to remove a react bug that adds a 0 at the start
            if (!data.threshold || value < data.threshold[0] || value > data.threshold[1]) return
            onChange(value)
        } else {
            onChange(el.value)
        }
    }

    function handleIncrement(sign: number){
        if(data.type === 'number'){
            const nextValue = Number(value) + (data.increment || 0) * sign
            if (!data.threshold || nextValue < data.threshold[0] || nextValue > data.threshold[1]) return
            onComplete({
                key: objectKey,
                data: { ...data, value: nextValue }
            })
        }
    }

    function handleBlur() {
        if (data.value === value) return
        onComplete({
            key: objectKey,
            data: { ...data, value: value }
        })
    }
    
    return <div className="settings-input">
        {data.type === 'number' &&
            <button 
                onClick={() => handleIncrement(-1)}
                className="settings-input-button"
                style={{marginRight: '0.15rem'}}
            >
                <FaMinus />
            </button>
        }
            <input
            type={data.type}
            value={value}
            placeholder={data.placeholder || ""}
            onBlur={handleBlur}
            onChange={handleChange}
        />
        {data.type === 'number' &&
            <button 
                onClick={() => handleIncrement(1)}
                className="settings-input-button"
                style={{marginLeft: '0.15rem'}}
            >   
                <FaPlus />
            </button>
        }
    </div>
}