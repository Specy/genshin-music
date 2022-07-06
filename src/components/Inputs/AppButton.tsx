import { Tooltip,hasTooltip } from "../Utility/Tooltip"

interface AppButtonprops {
    style?: React.CSSProperties,
    className?: string,
    onClick?: (e: React.MouseEvent) => void,
    children?: React.ReactNode,
    toggled?: boolean,
    disabled?: boolean,
    visible?: boolean,
    tooltip?: string,
    ariaLabel?: string
}
export function AppButton({ 
        style = {}, 
        className = '', 
        children, 
        toggled = false, 
        onClick, 
        disabled = false, 
        visible = true, 
        tooltip,
        ariaLabel
    }: AppButtonprops) {
    return <button
        className={`app-button ${className} ${toggled ? 'active' : ''} ${hasTooltip(tooltip)}`}
        style={{
            ...style, 
            ...(!visible 
                ? {display: 'none'} 
                : {})
            
            }}
        aria-label={ariaLabel}
        onClick={(e) => onClick?.(e)}
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