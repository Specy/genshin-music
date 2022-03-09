interface AppButtonprops {
    style?: object,
    className?: string,
    onClick?: () => void,
    children?: React.ReactNode,
    toggled?: boolean,
    disabled?: boolean,
    visible?: boolean
}
export function AppButton({ style = {}, className = '', children, toggled = false, onClick, disabled = false, visible = true}: AppButtonprops) {
    return <button
        className={`app-button ${className} ${toggled ? 'active' : ''}`}
        style={{...style, ...(!visible ? {display: 'none'} : {})}}
        onClick={onClick || (() => { })}
        disabled={disabled}
    >
        {children}
    </button>
}