import {SimpleMenu} from "./SimpleMenu"
import {CSSProperties, ReactNode} from "react";

interface PageProps {
    excludeMenu?: boolean
    children: ReactNode
    menu?: ReactNode
    className?: string
    style?: CSSProperties
    contentStyle?: CSSProperties
    cropped?: boolean
}

export function DefaultPage({excludeMenu = false, children, className = "", style, menu, cropped = true, contentStyle}: PageProps) {
    const pageStyle = !cropped ? {...style, padding: 0} : style
    const hasMenu = menu || !excludeMenu
    return <div
        className={"default-page " + className}
        style={{
            '--left-mobile-padding': hasMenu ? '5rem' : '1rem',
            ...pageStyle
        } as CSSProperties}
    >
        {menu
            ? menu
            : (!excludeMenu && <SimpleMenu/>)
        }
        <main
            className="default-content appear-on-mount"
            style={contentStyle}
        >
            {children}
        </main>
    </div>
}