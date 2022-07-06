import { SimpleMenu } from "./SimpleMenu"

interface PageProps{
    excludeMenu?: boolean
    children: React.ReactNode
}
export function DefaultPage({excludeMenu = false, children}: PageProps) {
    return <div className="default-page">
        {!excludeMenu && <SimpleMenu />}
        <div className="default-content">
            {children}
        </div>
    </div>
}