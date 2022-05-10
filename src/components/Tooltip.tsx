
interface TooltipProps{
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right'
    style?: React.CSSProperties
}
export function Tooltip({children, position = 'bottom', style}: TooltipProps) {
    return <span className={`tooltip tooltip-${position}`} style={style}>
        {children}
    </span>
}

export function hasTooltip(text?:string){
    return text ? 'has-tooltip' : '';
}