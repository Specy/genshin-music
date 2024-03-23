import {useRef} from 'react';
import {MdHelpOutline} from 'react-icons/md';

interface HelpTooltipProps {
    children: React.ReactNode;
    maxWidth?: number
    width?: number
    buttonStyle?: React.CSSProperties
    parentStyle?: React.CSSProperties
}

export function HelpTooltip({children, maxWidth = 20, buttonStyle, parentStyle, width}: HelpTooltipProps) {
    const ref = useRef<HTMLButtonElement>(null)
    return <div className="help-tooltip" style={parentStyle}>
        <button
            ref={ref}
            className='help-tooltip-button'
            style={buttonStyle}
            aria-label={'Help'}
            //Safari focus workaround
            onClick={() => ref.current?.focus()}
        >
            <MdHelpOutline style={{
                width: '100%',
                height: '100%'
            }}/>
        </button>
        <div className="help-tooltip-content"
             style={{
                 maxWidth: `${maxWidth}rem`,
                 width: width !== undefined ? `${width}rem` : 'unset',
             }}
        >
            {children}
        </div>
    </div>
}

