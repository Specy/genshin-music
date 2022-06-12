import { FaHome, FaDiscord, FaArrowLeft } from 'react-icons/fa';

import {MenuItem} from 'components/MenuItem'
import HomeStore from 'stores/HomeStore';
import { useHistory } from 'react-router-dom';
import { historyTracker } from 'stores/History';

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
                >
                    <FaArrowLeft className='icon' />
                </MenuItem>
            }
            {children}
            <MenuItem>
                <a href='https://discord.gg/Arsf65YYHq' target='_blank' rel='noreferrer' >
                    <FaDiscord className="icon" />
                </a>
            </MenuItem>

            <MenuItem onClick={HomeStore.open}>
                <FaHome className="icon" />
            </MenuItem>
        </div>
    </div>
}