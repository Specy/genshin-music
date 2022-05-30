import { Tooltip,hasTooltip } from "./Tooltip"

interface AppButtonprops {
    style?: React.CSSProperties,
    className?: string,
    onClick?: () => void,
    children?: React.ReactNode,
    toggled?: boolean,
    disabled?: boolean,
    visible?: boolean,
    tooltip?: string
}
export function AppButton({ 
        style = {}, 
        className = '', 
        children, 
        toggled = false, 
        onClick, 
        disabled = false, 
        visible = true, 
        tooltip
    }: AppButtonprops) {
    return <button
        className={`app-button ${className} ${toggled ? 'active' : ''} ${hasTooltip(tooltip)}`}
        style={{
            ...style, 
            ...(!visible 
                ? {display: 'none'} 
                : {})
            
            }}
        onClick={onClick || (() => { })}
        disabled={disabled}
    >
        {children}
        {tooltip && 
            <Tooltip>
                {tooltip}
            </Tooltip>
        }
    </button>
}