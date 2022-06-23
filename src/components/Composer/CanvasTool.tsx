import { hasTooltip, Tooltip } from "components/Tooltip";


interface CanvasToolProps {
    onClick: () => void;
    tooltip?: string;
    ariaLabel?: string;
    style?: React.CSSProperties
    children: React.ReactNode;
}


export function CanvasTool({ children, tooltip, onClick, style, ariaLabel }: CanvasToolProps) {
    return <button 
        className={`tool ${hasTooltip(tooltip)}`} 
        onClick={onClick} 
        style={style}
        aria-label={ariaLabel}
    >
        {children}
        {tooltip &&
            <Tooltip>
                {tooltip}
            </Tooltip>
        }
    </button>
}