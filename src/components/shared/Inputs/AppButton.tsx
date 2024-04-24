import {hasTooltip, Tooltip, TooltipPosition} from "$cmp/shared/Utility/Tooltip"
import type {CSSProperties, MouseEvent, ReactNode} from 'react'

export interface AppButtonProps {
    style?: CSSProperties,
    className?: string,
    onClick?: (e: MouseEvent) => void,
    children?: ReactNode,
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
            ...(cssVar && {backgroundColor: `var(--${cssVar})`, color: `var(--${cssVar}-text)`}),
            ...style,
            ...(!visible
                ? {display: 'none'}
                : {})
        }}
        aria-label={ariaLabel}
        onClick={onClick}
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