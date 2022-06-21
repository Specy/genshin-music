import { hasTooltip, Tooltip } from "components/Tooltip";
import { blurEvent } from "lib/Tools";


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
        onClick={(e) => {
            blurEvent(e)
            onClick();
        }} 
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