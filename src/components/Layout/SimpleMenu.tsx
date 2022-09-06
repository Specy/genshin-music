import { FaHome, FaDiscord, FaArrowLeft } from 'react-icons/fa';

import {MenuItem} from '$cmp/Miscellaneous/MenuItem'
import { useHistory } from 'react-router-dom';
import { historyTracker } from '$stores/History';
import { homeStore } from '$stores/HomeStore';

interface SimpleMenuProps {
    children?: React.ReactNode,
    className?: string
}
export function SimpleMenu({ children = undefined, className = '' }: SimpleMenuProps) {
    const history = useHistory()
    return <div className={"menu-wrapper " + (className)} >
        <div className="menu menu-visible" style={{ justifyContent: 'flex-end' }}>
            {historyTracker.hasNavigated &&
                <MenuItem
                    style={{ marginBottom: 'auto' }}
                    onClick={() => {
                        history.goBack()
                    }}
                    ariaLabel='Go back'
                >
                    <FaArrowLeft className='icon' />
                </MenuItem>
            }
            {children}
            <MenuItem ariaLabel='Go to discord'>
                <a href='https://discord.gg/Arsf65YYHq' target='_blank' rel='noreferrer' >
                    <FaDiscord className="icon" />
                </a>
            </MenuItem>

            <MenuItem onClick={homeStore.open} ariaLabel='Open home menu'>
                <FaHome className="icon" />
            </MenuItem>
        </div>
    </div>
}