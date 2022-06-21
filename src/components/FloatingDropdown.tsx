import useClickOutside from "lib/Hooks/useClickOutside"
import { useState } from "react"
import { FaTimes } from "react-icons/fa"
import { AppButton } from "./AppButton"
import { SongActionButton } from "./SongActionButton"


interface FloatingDropdownProps {
    position?: "bottom"
    children: React.ReactNode
    tooltip?: string
    Icon: React.FC
    className?: string
    offset?: number
    style?: React.CSSProperties
    ignoreClickOutside? : boolean
    onClose?: () => void
}

export function FloatingDropdown({ 
        position = 'bottom', 
        children, 
        Icon, 
        className = "", 
        style = {}, 
        onClose, 
        tooltip, 
        offset = 3,
        ignoreClickOutside,
    }: FloatingDropdownProps) {

    const [isActive, setActive] = useState(false)
    const ref = useClickOutside<HTMLDivElement>(() => {
        if(ignoreClickOutside) return
        setActive(false)
        if (onClose) onClose()
    }, { active: isActive, ignoreFocusable: true})
    return <div className={`${className} floating-dropdown ${isActive ? "floating-dropdown-active" : ""}`}>
        <SongActionButton style={{ margin: 0, ...style }}
            onClick={() => {
                setActive(!isActive)
                if (isActive && onClose) onClose()
            }}
            ariaLabel={isActive ? "Close" : "Open"}
            tooltip={tooltip}
        >
            {isActive
                ? <FaTimes />
                : <Icon />
            }
        </SongActionButton>

        <div
            ref={ref}
            className={`floating-children-${position}`}
            style={{ transform: `translateX(calc(-100% + ${offset}rem)` }}
        >
            {children}
        </div>
    </div>
}


interface FloatingDropdownButtonProps {
    children: React.ReactNode
    onClick?: () => void
    style?: React.CSSProperties
}
interface FloatingDropdownTextProps {
    text: string
}

export function FloatingDropdownText({ text }: FloatingDropdownTextProps) {
    return <div className="floating-dropdown-text">
        {text}
    </div>
}
export function FloatingDropdownRow({ children, onClick, style }: FloatingDropdownButtonProps) {
    return <AppButton
        ariaLabel="Floating Dropdown Button"
        className='row row-centered'
        style={{ padding: "0.5rem", minWidth: "unset", ...style }}
        onClick={onClick}
    >
        {children}
    </AppButton>
}