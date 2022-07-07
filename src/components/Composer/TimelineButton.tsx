import { Tooltip, hasTooltip } from "components/Utility/Tooltip";

interface TimelineButtonProps {
    onClick: () => void;
    tooltip?: string;
    ariaLabel?: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
}

export function TimelineButton({onClick, children, tooltip, style, ariaLabel}:TimelineButtonProps) {
    return <button
        className={`timeline-button ${hasTooltip(tooltip)}`}
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