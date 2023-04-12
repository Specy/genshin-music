import useClickOutside from "$lib/Hooks/useClickOutside"
import React, { useEffect, useState } from "react"
import { FaTimes } from "react-icons/fa"
import { AppButton } from "../Inputs/AppButton"
import { SongActionButton } from "../Inputs/SongActionButton"
import { DEFAULT_DOM_RECT } from "$/Config"


interface FloatingDropdownProps {
    children: React.ReactNode
    tooltip?: string
    Icon: React.FC
    className?: string
    offset?: number
    style?: React.CSSProperties
    ignoreClickOutside?: boolean
    onClose?: () => void
}
const defaultBounds = {...DEFAULT_DOM_RECT}
export function FloatingDropdown({
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
    const [overflows, setOverflows] = useState(false)
    const ref = useClickOutside<HTMLDivElement>(() => {
        if (ignoreClickOutside) return
        setActive(false)
        if (onClose) onClose()
    }, { active: isActive, ignoreFocusable: true })
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const bounds = el.getBoundingClientRect()
        setOverflows(bounds.top + bounds.height > (window.innerHeight ?? 0) )
    }, [isActive, ref])
    const transform = `translateX(calc(-100% + ${offset}rem)) ${overflows ? `translateY(calc(-100% - 2rem))` : ""}`
    return <div className={`${className} floating-dropdown ${isActive ? "floating-dropdown-active" : ""}`}>
        <SongActionButton
            style={{
                margin: 0,
                ...style,
                ...isActive ? {
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-text)",
                } : {}
            }}

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
            className={`floating-dropdown-children`}
            style={{
                transform,
                '--existing-transform': transform,
                transformOrigin: overflows ? "bottom" : "top",
            } as React.CSSProperties}
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
        style={{ padding: "0.4rem", minWidth: "unset", ...style }}
        onClick={onClick}
    >
        {children}
    </AppButton>
}