import { hasTooltip, Tooltip } from "../Utility/Tooltip"


interface SongActionButtonProps {
    onClick?: () => void
    style?: React.CSSProperties
    tooltip?: string
    ariaLabel?: string
    children: React.ReactNode
}

export function SongActionButton({ onClick, children, style, tooltip, ariaLabel }: SongActionButtonProps) {
    return <>
        <button 
            className={`song-button ${hasTooltip(tooltip)}`} 
            onClick={onClick || (() => { })}
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
    </>

}