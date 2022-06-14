import { hasTooltip, Tooltip } from "components/Tooltip";


interface CanvasToolProps {
    onClick: () => void;
    tooltip?: string;
    style?: React.CSSProperties
    children: React.ReactNode;
}


export function CanvasTool({ children, tooltip, onClick, style }: CanvasToolProps) {
    return <button className={`tool ${hasTooltip(tooltip)}`} onClick={onClick} style={style}>
        {children}
        {tooltip &&
            <Tooltip>
                {tooltip}
            </Tooltip>
        }
    </button>
}