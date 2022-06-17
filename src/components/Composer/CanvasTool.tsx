import { hasTooltip, Tooltip } from "components/Tooltip";
import { blurEvent } from "lib/Tools";


interface CanvasToolProps {
    onClick: () => void;
    tooltip?: string;
    style?: React.CSSProperties
    children: React.ReactNode;
}


export function CanvasTool({ children, tooltip, onClick, style }: CanvasToolProps) {
    return <button 
        className={`tool ${hasTooltip(tooltip)}`} 
        onClick={(e) => {
            blurEvent(e)
            onClick();
        }} 
        style={style}
    >
        {children}
        {tooltip &&
            <Tooltip>
                {tooltip}
            </Tooltip>
        }
    </button>
}