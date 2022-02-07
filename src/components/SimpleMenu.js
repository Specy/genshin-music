import { FaHome, FaDiscord } from 'react-icons/fa';

import MenuItem from 'components/MenuItem'
import HomeStore from 'stores/HomeStore';

export function SimpleMenu({children, className}) {
    return <div className={"menu-wrapper " + (className ? className : '')} >
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