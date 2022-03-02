import { FaHome, FaDiscord } from 'react-icons/fa';

import MenuItem from 'components/MenuItem'
import HomeStore from 'stores/HomeStore';

interface SimpleMenuProps{
    children?: React.ReactNode, 
    className?: string
}
export function SimpleMenu({ children = undefined, className = '' }: SimpleMenuProps) {
    return <div className={"menu-wrapper " + (className)} >
        <div className="menu menu-visible" style={{ justifyContent: 'flex-end' }}>
            {children}
            <MenuItem type='Discord'>
                <a href='https://discord.gg/Arsf65YYHq' target='_blank' rel='noreferrer' >
                    <FaDiscord className="icon" />
                </a>
            </MenuItem>

            <MenuItem type="Home" action={HomeStore.open}>
                <FaHome className="icon" />
            </MenuItem>

        </div>
    </div>
}