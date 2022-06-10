import { useTheme } from "lib/Hooks/useTheme"
import { memo } from "react"

interface MenuItemProps<T> {
    className?: string,
    action?: (data?: T) => void
    children?: React.ReactNode,
    data?: T,
    current?: string,
    style?: React.CSSProperties
}

function MenuItem<T>({ className, action, children, data, style }: MenuItemProps<T>) {
    const [theme] = useTheme()
    return <div
        className={className ? `menu-item ${className}` : "menu-item"}
        style={{ backgroundColor: theme.layer('primary', 0.1).toString(), ...style }}
        onClick={() => action?.(data)}
    >
        {children}
    </div>
}
export default memo(MenuItem, (prev, next) => {
    //@ts-ignore
    if (next.children.key !== null || prev.children.key !== null) return prev.children.key === next.children.key
    //@ts-ignore
    return prev.children !== undefined && prev.className === next.className && prev.action === next.action && prev.current === next.current
}) as typeof MenuItem