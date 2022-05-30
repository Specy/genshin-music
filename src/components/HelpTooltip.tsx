
import { MdHelpOutline } from 'react-icons/md';

interface HelpTooltipProps {
    children: React.ReactNode;
    maxWidth?: number
    buttonStyle?: React.CSSProperties
}

export function HelpTooltip({ children, maxWidth = 20, buttonStyle = {} }: HelpTooltipProps) {
    return <div className="help-tooltip">
        <button className='help-tooltip-button' style={buttonStyle} >
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