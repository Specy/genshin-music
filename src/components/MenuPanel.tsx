interface MenuPanelProps {
    title?: string,
    current: string,
    id: string,
    children: React.ReactNode
}

export default function MenuPanel({ title, current, children, id }: MenuPanelProps) {
    return <div className={current === id ? "menu-panel menu-panel-visible" : "menu-panel"}>
        {title &&
            <div className="menu-title">
                {title}
            </div>
        }
        <div className="panel-content-wrapper">
            {children}
        </div>
    </div>
}