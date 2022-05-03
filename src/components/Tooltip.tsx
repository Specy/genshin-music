
interface TooltipProps{
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right'
}
export function Tooltip({children, position = 'bottom'}: TooltipProps) {
    return <span className={`tooltip tooltip-${position}`}>
        {children}
    </span>
}

export function hasTooltip(text?:string){
    return text ? 'has-tooltip' : '';
}