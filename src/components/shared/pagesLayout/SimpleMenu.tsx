import {FaArrowLeft, FaDiscord, FaHome} from 'react-icons/fa';

import {MenuButton} from '$cmp/shared/Menu/MenuItem'
import {browserHistory} from '$stores/BrowserHistory';
import {homeStore} from '$stores/HomeStore';
import {useRouter} from 'next/router';
import Link from 'next/link';
import {asyncConfirm} from '$cmp/shared/Utility/AsyncPrompts';
import {MenuContextProvider, MenuSidebar} from "$cmp/shared/Menu/MenuContent";
import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";

export function SimpleMenu({children, className, style}: MaybeChildren<Stylable>) {
    const history = useRouter()
    return <MenuContextProvider className={className} style={style}>
        <MenuSidebar style={{justifyContent: 'flex-end'}}>
            {browserHistory.hasNavigated &&
                <MenuButton
                    style={{marginBottom: 'auto'}}
                    onClick={() => {
                        history.back()
                    }}
                    ariaLabel='Go back'
                >
                    <FaArrowLeft className='icon'/>
                </MenuButton>
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
                <MenuButton ariaLabel='Go to discord'>
                    <FaDiscord className="icon"/>
                </MenuButton>
            </Link>

            <MenuButton
                onClick={homeStore.open}
                ariaLabel='Open home menu'
                style={{border: "solid 0.1rem var(--secondary)"}}
            >
                <FaHome className="icon"/>
            </MenuButton>
        </MenuSidebar>
    </MenuContextProvider>
}