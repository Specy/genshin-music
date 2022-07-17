import { SimpleMenu } from "./SimpleMenu"

interface PageProps{
    excludeMenu?: boolean
    children: React.ReactNode
    className?: string
    style?: React.CSSProperties
}
export function DefaultPage({excludeMenu = false, children, className = "", style}: PageProps) {
    return <div className={"default-page " + className } style={style}>
        {!excludeMenu && <SimpleMenu />}
        <div className="default-content">
            {children}
        </div>
    </div>
}