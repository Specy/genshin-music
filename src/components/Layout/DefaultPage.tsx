import { SimpleMenu } from "./SimpleMenu"

interface PageProps {
    excludeMenu?: boolean
    children: React.ReactNode
    menu?: React.ReactNode
    className?: string
    style?: React.CSSProperties
    cropped?: boolean
}
export function DefaultPage({ excludeMenu = false, children, className = "", style, menu, cropped = true }: PageProps) {
    const pageStyle = !cropped ? { ...style, padding: 0 } : style
    return <div className={"default-page " + className} style={pageStyle}>
        {(!excludeMenu || !menu) && <SimpleMenu />}
        {menu}
        <div className="default-content appear-on-mount">
            {children}
        </div>
    </div>
}