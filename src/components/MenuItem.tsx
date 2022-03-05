import { useTheme } from "lib/hooks/useTheme"
import { memo } from "react"

interface MenuItemProps<T> {
    className?: string,
    action?: (data?: T) => void
    children?: React.ReactNode,
    data?: T
}

function MenuItem<T>({ className, action, children, data }: MenuItemProps<T>) {
    const [theme] = useTheme()
    return <div
        className={className ? `menu-item ${className}` : "menu-item"}
        style={{ backgroundColor: theme.layer('primary', 0.1).toString() }}
        onClick={() => action?.(data)}
    >
        {children}
    </div>
}
export default memo(MenuItem, (prev, next) => {
    //@ts-ignore
    if (next.children.key !== null || prev.children.key !== null) return prev.children.key === next.children.key
    //@ts-ignore
    return prev.children !== undefined && prev.className === next.className
}) as typeof MenuItem