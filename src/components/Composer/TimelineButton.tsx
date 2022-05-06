import { Tooltip, hasTooltip } from "components/Tooltip";

interface TimelineButtonProps {
    onClick: () => void;
    tooltip?: string;
    children: React.ReactNode;
    style?: any;
}

export function TimelineButton({onClick, children, tooltip, style}:TimelineButtonProps) {
    return <div
        className={`timeline-button ${hasTooltip(tooltip)}`}
        onClick={onClick}
        style={style}
    >
        {children}
        {tooltip &&
            <Tooltip>
                {tooltip}
            </Tooltip>
        }
    </div>
}