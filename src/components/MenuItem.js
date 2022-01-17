import { memo } from "react"
export default memo(function MenuItem(props) {
    const { className, action, children, type } = props
    return <div
        className={className ? `menu-item ${className}` : "menu-item"}
        onClick={() => action?.(type)}
    >
        {children}
    </div>
},(prev,next) => {
    if(next.children.key !== null || prev.children.key !== null) return prev.children.key === next.children.key
    return prev.children !== undefined && prev.className === next.className
})