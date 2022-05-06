
import { MdHelpOutline } from 'react-icons/md';

interface HelpTooltipProps {
    children: React.ReactNode;
    maxWidth?: number
}

export function HelpTooltip({ children, maxWidth = 20 }: HelpTooltipProps) {
    return <div className="help-tooltip">
        <button className='help-tooltip-button' >
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