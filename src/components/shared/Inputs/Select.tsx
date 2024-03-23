import {useTheme} from "$lib/Hooks/useTheme"
import s from '$cmp/shared/Settings/Settings.module.css'
import {useCallback} from "react";

interface SelectProps {
    onChange: (value: React.ChangeEvent<HTMLSelectElement>) => void
    value: React.SelectHTMLAttributes<HTMLSelectElement>['value']
    className?: string
    children?: React.ReactNode
    style?: React.CSSProperties
}

export function Select({onChange, value, children, style}: SelectProps) {
    const [theme] = useTheme()
    const callback = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(e)
        e.target.blur()
    }, [onChange])
    return <select
        onChange={callback}
        value={value}
        className={s.select}
        style={{
            backgroundImage: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`,
            ...style
        }}
    >
        {children}
    </select>
}