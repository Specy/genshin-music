import { useTheme } from "lib/hooks/useTheme"
import { memo } from "react"
export default memo(function MenuItem(props) {
    const [theme] = useTheme()
    const { className, action, children, type } = props
    return <div
        className={className ? `menu-item ${className}` : "menu-item"}
        style={{backgroundColor: theme.layer('primary',0.1)}}
        onClick={() => action?.(type)}
    >
        {children}
    </div>
},(prev,next) => {
    if(next.children.key !== null || prev.children.key !== null) return prev.children.key === next.children.key
    return prev.children !== undefined && prev.className === next.className
})