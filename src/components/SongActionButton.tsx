import { hasTooltip, Tooltip } from "./Tooltip"


interface SongActionButtonProps {
    onClick?: () => void
    style: React.CSSProperties
    tooltip?: string
    children: React.ReactNode
}

export function SongActionButton({ onClick, children, style, tooltip }: SongActionButtonProps) {
    return <>
        <button 
            className={`song-button ${hasTooltip(tooltip)}`} 
            onClick={onClick || (() => { })}
            style={style}
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