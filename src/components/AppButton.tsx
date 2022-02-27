import React from "react"

interface AppButtonprops {
    style?: object,
    className?: string,
    onClick?: () => void,
    children?: JSX.Element | JSX.Element[] | string,
    toggled?: boolean
}
export function AppButton({ style, className = '', children, toggled = false, onClick }: AppButtonprops) {
    return <button
        className={`app-button ${className} ${toggled ? 'active' : ''}`}
        style={style}
        onClick={onClick || (() => { })}
    >
        {children}
    </button>
}