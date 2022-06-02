import { useState } from "react"
import { FaTimes } from "react-icons/fa"
import { AppButton } from "./AppButton"
import { SongActionButton } from "./SongActionButton"


interface FloatingDropdownProps {
    position?: "top" | "bottom" | "left" | "right"
    children: React.ReactNode
    tooltip?: string
    Icon: React.FC
    className?: string
    style?: React.CSSProperties
    onClose?: () => void
}

export function FloatingDropdown({ position = 'bottom', children, Icon, className = "", style = {}, onClose, tooltip }: FloatingDropdownProps) {
    const [isActive, setActive] = useState(false)
    return <div className={`${className} floating-dropdown ${isActive ? "floating-dropdown-active" : ""}`}>
        <SongActionButton style={{ margin: 0, ...style }}
            onClick={() => {
                setActive(!isActive)
                if (isActive && onClose) onClose()
            }}
            tooltip={tooltip}
        >
            {isActive
                ? <FaTimes />
                : <Icon />
            }
        </SongActionButton>

        <div className={`floating-children-${position}`}>
            {children}
        </div>
    </div>
}


interface FloatingDropdownButtonProps {
    children: React.ReactNode
    onClick?: () => void

}
export function FloatingDropdownRow({ children, onClick }: FloatingDropdownButtonProps) {
    return <AppButton className='row row-centered' style={{ padding: "0.4rem" }} onClick={onClick}>
        {children}
    </AppButton>
}