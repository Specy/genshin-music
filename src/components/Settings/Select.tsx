import { ChangeEvent, ReactNode } from "react"
import { ThemeStore } from "stores/ThemeStore"
import { SettingsSelect, SettingUpdateKey } from "types/SettingsPropriety"

interface SelectProps {
    value: string | number
    type: string | number
    data: SettingsSelect
    objectKey: SettingUpdateKey
    children: ReactNode
    theme: ThemeStore
    onChange: (data: {
        key: SettingUpdateKey
        data: any
    }) => void
}
export function Select({ value, onChange, data, objectKey , children, theme, type}: SelectProps) {
    function handleChange(e: ChangeEvent<HTMLSelectElement>) {
        onChange({
            key: objectKey,
            data: { 
                ...data, 
                value: typeof type === 'number' ? parseInt(e.target.value) : e.target.value 
            }
        })
    }
    return <select value={value}
        onChange={handleChange}
        style={{
            backgroundImage: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#','%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
        }}
    >
        {children}
    </select>
}