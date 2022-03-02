import { useTheme } from "lib/hooks/useTheme"
import { memo } from "react"

interface MenuItemProps {
    className?: string,
    action?: (type?: string) => void
    children?: React.ReactNode,
    type?: string
}

export default memo(function MenuItem({ className, action, children, type }: MenuItemProps) {
    const [theme] = useTheme()
    return <div
        className={className ? `menu-item ${className}` : "menu-item"}
        style={{ backgroundColor: theme.layer('primary', 0.1).toString() }}
        onClick={() => action?.(type)}
    >
        {children}
    </div>
}, (prev, next) => {
    //@ts-ignore
    if (next.children.key !== null || prev.children.key !== null) return prev.children.key === next.children.key
    //@ts-ignore
    return prev.children !== undefined && prev.className === next.className
})