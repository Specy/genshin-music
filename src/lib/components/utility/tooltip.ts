// Old: src/components/shared/Utility/Tooltip.tsx (hasTooltip + the position type)
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

export function hasTooltip(text?: string | boolean): string {
    return text ? 'has-tooltip' : ''
}
