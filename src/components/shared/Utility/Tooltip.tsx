
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'
interface TooltipProps{
    children: React.ReactNode;
    position?: TooltipPosition
    style?: React.CSSProperties
}
export function Tooltip({children, position = 'bottom', style}: TooltipProps) {
    return <span className={`tooltip tooltip-${position}`} style={style}>
        {children}
    </span>
}

export function hasTooltip(text?:string | boolean){
    return text ? 'has-tooltip' : '';
}