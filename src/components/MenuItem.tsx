import { useTheme } from "lib/Hooks/useTheme"
import { blurEvent } from "lib/Tools"

interface MenuItemProps<T> {
    className?: string,
    onClick?: (data?: T) => void
    children?: React.ReactNode,
    data?: T,
    current?: string,
    style?: React.CSSProperties
    isActive?: boolean
}

export function MenuItem<T>({ className = "", onClick, children, data, style, isActive }: MenuItemProps<T>) {
    const [theme] = useTheme()
    return <button
        className={`menu-item ${className}`}
        style={{ 
            backgroundColor: isActive
            ? theme.layer('primary', 0.2).toString()
            : theme.layer('primary', 0).toString(),
             ...style 
        }}
        onClick={(e) => {
            blurEvent(e)
            onClick?.(data)
        }}
    >
        {children}
    </button>
}
