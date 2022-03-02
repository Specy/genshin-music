import { ChangeEvent, ReactNode } from "react"
import { SettingsSelect, SettingUpdateKey } from "types/SettingsPropriety"

interface SelectProps {
    value: string | number,
    data: SettingsSelect,
    objectKey: SettingUpdateKey,
    children: ReactNode
    onChange: (data: {
        key: SettingUpdateKey,
        data: any
    }) => void
}
export function Select({ value, onChange, data, objectKey , children}: SelectProps) {
    function handleChange(e: ChangeEvent<HTMLSelectElement>) {
        onChange({
            key: objectKey,
            data: { ...data, value: e.target.value }
        })
    }
    return <select value={value}
        onChange={handleChange}
    >
        {children}
    </select>
}