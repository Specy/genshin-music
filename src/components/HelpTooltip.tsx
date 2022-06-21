
import { useRef } from 'react';
import { MdHelpOutline } from 'react-icons/md';

interface HelpTooltipProps {
    children: React.ReactNode;
    maxWidth?: number
    buttonStyle?: React.CSSProperties
}

export function HelpTooltip({ children, maxWidth = 20, buttonStyle = {} }: HelpTooltipProps) {
    const ref = useRef<HTMLButtonElement>(null)
    return <div className="help-tooltip">
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
            }} />
        </button>
        <div className="help-tooltip-content" 
            style={{
                maxWidth: `${maxWidth}rem`
            }}
        >
            {children}
        </div>
    </div>
}

