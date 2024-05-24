import {useRef} from 'react';
import {MdHelpOutline} from 'react-icons/md';

interface HelpTooltipProps {
    children: React.ReactNode;
    maxWidth?: number
    width?: number
    position?: 'left' | 'right' | 'middle'
    buttonStyle?: React.CSSProperties
    parentStyle?: React.CSSProperties
}

const positionMap = {
    left: '-100%',
    right: '0',
    middle: '-50%'
}

export function HelpTooltip({children, maxWidth = 18, buttonStyle, parentStyle, width, position = 'right'}: HelpTooltipProps) {
    const ref = useRef<HTMLButtonElement>(null)
    return <div className="help-tooltip" style={{
        position: 'relative',
        ...parentStyle
    }}>
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
                 translate: positionMap[position],
                 maxWidth: `${maxWidth}rem`,
                 width: width !== undefined ? `${width}rem` : 'max-content',
             }}
        >
            {children}
        </div>
    </div>
}

