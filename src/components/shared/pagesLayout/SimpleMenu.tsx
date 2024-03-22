import { FaHome, FaDiscord, FaArrowLeft } from 'react-icons/fa';

import { MenuItem } from '$cmp/shared/Miscellaneous/MenuItem'
import { historyTracker } from '$stores/History';
import { homeStore } from '$stores/HomeStore';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { asyncConfirm } from '$cmp/shared/Utility/AsyncPrompts';

interface SimpleMenuProps {
    children?: React.ReactNode,
    className?: string
}
export function SimpleMenu({ children = undefined, className = '' }: SimpleMenuProps) {
    const history = useRouter()
    return <div className={"menu-wrapper " + (className)} >
        <div className="menu menu-visible" style={{ justifyContent: 'flex-end' }}>
            {historyTracker.hasNavigated &&
                <MenuItem
                    style={{ marginBottom: 'auto' }}
                    onClick={() => {
                        history.back()
                    }}
                    ariaLabel='Go back'
                >
                    <FaArrowLeft className='icon' />
                </MenuItem>
            }
            {children}
            <Link 
                href='https://discord.gg/Arsf65YYHq' 
                target='_blank' 
                rel='noreferrer' 
                title='Go to discord' 
                onClick={async (e) => {
                    e.preventDefault()
                    const confirm = await asyncConfirm('You are leaving the app to go to discord, do you want to continue?')
                    if (!confirm) return
                    window.open('https://discord.gg/Arsf65YYHq', '_blank')
                }}
            >
                <MenuItem ariaLabel='Go to discord'>
                    <FaDiscord className="icon" />
                </MenuItem>
            </Link>

             <MenuItem onClick={homeStore.open} ariaLabel='Open home menu' style={{border: "solid 0.1rem var(--secondary)"}}>
                <FaHome className="icon" />
            </MenuItem>
        </div>
    </div>
}