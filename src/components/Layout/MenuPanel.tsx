interface MenuPanelProps<T> {
    title?: string,
    current?: T,
    id?: T,
    children: React.ReactNode
}

export default function MenuPanel<T>({ title, current, children, id }: MenuPanelProps<T>) {
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