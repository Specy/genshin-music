interface MenuPanelProps{
    title: string,
    current: string,
    children: React.ReactNode
}

export default function MenuPanel({title, current, children}: MenuPanelProps) {
    let className = current === title ? "menu-panel menu-panel-visible" : "menu-panel"
    return <div className={className}>
        <div className="menu-title">
            {title}
        </div>
        <div className="panel-content-wrapper">
            {children}
        </div>
    </div>
}