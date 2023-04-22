import { Tooltip, hasTooltip, TooltipPosition } from "../Utility/Tooltip"

export interface AppButtonProps {
    style?: React.CSSProperties,
    className?: string,
    onClick?: (e: React.MouseEvent) => void,
    children?: React.ReactNode,
    toggled?: boolean,
    disabled?: boolean,
    visible?: boolean,
    cssVar?: string,
    tooltip?: string,
    tooltipPosition?: TooltipPosition
    ariaLabel?: string
}
export function AppButton({
    style = {},
    className = '',
    cssVar,
    children,
    toggled = false,
    onClick,
    disabled = false,
    visible = true,
    tooltip,
    ariaLabel,
    tooltipPosition
}: AppButtonProps) {
    return <button
        className={`app-button ${className} ${toggled ? 'active' : ''} ${hasTooltip(tooltip)}`}
        style={{
            ...(cssVar && { backgroundColor: `var(--${cssVar})`, color: `var(--${cssVar}-text)` }),
            ...style,
            ...(!visible
                ? { display: 'none' }
                : {})
        }}
        aria-label={ariaLabel}
        onClick={(e) => onClick?.(e)}
        disabled={disabled}
    >
        {children}
        {tooltip &&
            <Tooltip
                position={tooltipPosition}
            >
                {tooltip}
            </Tooltip>
        }
    </button>
}