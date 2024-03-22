import { hasTooltip, Tooltip } from "$cmp/shared/Utility/Tooltip"


interface SongActionButtonProps {
    onClick?: () => void
    style?: React.CSSProperties
    tooltip?: string
    ariaLabel?: string
    className?: string
    children: React.ReactNode
}

export function SongActionButton({ onClick, children, style, tooltip, ariaLabel, className }: SongActionButtonProps) {
    return <>
        <button
            className={`song-button ${hasTooltip(tooltip)} ${className ?? ''}`}
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