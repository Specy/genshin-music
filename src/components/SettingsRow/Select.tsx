import { ChangeEvent, ReactNode } from "react"

interface SelectProps {
    value: string,
    data: {
        options: string[]
    },
    objectKey: string,
    children: ReactNode
    onChange: (data: {
        key: string,
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