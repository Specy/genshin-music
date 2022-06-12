import { useTheme } from "lib/Hooks/useTheme"

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
    return <div
        className={`menu-item ${className}`}
        style={{ 
            backgroundColor: isActive
            ? theme.layer('primary', 0.2).toString()
            : theme.layer('primary', 0).toString(),
             ...style 
        }}
        onClick={() => onClick?.(data)}
    >
        {children}
    </div>
}
