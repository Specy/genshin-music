export default function MenuItem(props) {
    const { className, action, children, type } = props
    return <div
        className={className ? `menu-item ${className}` : "menu-item"}
        onClick={() => action?.(type)}
    >
        {children}
    </div>
}