import {FaArrowLeft, FaDiscord, FaHome} from 'react-icons/fa';

import {MenuButton} from '$cmp/shared/Menu/MenuItem'
import {browserHistoryStore} from '$stores/BrowserHistoryStore';
import {homeStore} from '$stores/HomeStore';
import {useAppNavigation} from "$/app/_navigation/NavigationProvider";
import {asyncConfirm} from '$cmp/shared/Utility/AsyncPrompts';
import {MenuContextProvider, MenuSidebar} from "$cmp/shared/Menu/MenuContent";
import {MaybeChildren, Stylable} from "$lib/utils/UtilTypes";
import {useTranslation} from "react-i18next";

export function SimpleMenu({children, className, style}: MaybeChildren<Stylable>) {
    const {t} = useTranslation(['menu', 'home'])
    const navigation = useAppNavigation()
    return <MenuContextProvider className={className} style={style}>
        <MenuSidebar style={{justifyContent: 'flex-end'}}>
            {browserHistoryStore.hasNavigated &&
                <MenuButton
                    style={{marginBottom: 'auto'}}
                    onClick={() => {
                        void navigation.back()
                    }}
                    ariaLabel={t('go_back')}
                >
                    <FaArrowLeft className='icon'/>
                </MenuButton>
            }
            {children}
            <a
                href='https://discord.gg/Arsf65YYHq'
                target='_blank'
                rel='noreferrer'
                title="Discord"
                onClick={async (e) => {
                    e.preventDefault()
                    const confirm = await asyncConfirm(t('home:about_to_leave_warning', {to: "discord"}))
                    if (!confirm) return
                    window.open('https://discord.gg/Arsf65YYHq', '_blank')
                }}
            >
                <MenuButton ariaLabel='Discord'>
                    <FaDiscord className="icon"/>
                </MenuButton>
            </a>

            <MenuButton
                onClick={homeStore.open}
                ariaLabel={t('open_home_menu')}
                style={{border: "solid 0.1rem var(--secondary)"}}
            >
                <FaHome className="icon"/>
            </MenuButton>
        </MenuSidebar>
    </MenuContextProvider>
}
