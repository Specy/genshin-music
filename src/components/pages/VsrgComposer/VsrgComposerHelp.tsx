import {keyBinds} from '$stores/KeybindsStore';
import {useObservableMap} from '$lib/Hooks/useObservable';
import {useConfig} from '$lib/Hooks/useConfig';
import {Key, ShortcutsTable} from '$cmp/pages/Index/HelpTab/ShortcutsHelp';
import {Column} from "$cmp/shared/layout/Column";
import {AppLink} from "$cmp/shared/link/AppLink";
import {Header} from "$cmp/shared/header/Header";
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {useTranslation} from "react-i18next";

export function VsrgComposerHelp() {
    const {t} = useTranslation(['tutorials', 'shortcuts'])
    const keys = keyBinds.getVsrgKeybinds(6)
    const {IS_MOBILE} = useConfig()
    const [vsrgComposerShortcuts] = useObservableMap(keyBinds.getShortcutMap("vsrg_composer"))
    return <>
        <Column>
            <Header type={'h2'}>
                {t('help.learn_how_to_use_vsrg_composer')}
            </Header>
            <p>
                <AppLink href={'/blog/posts/how-to-use-player'}>{t('help.click_to_visit_blog')}</AppLink>
            </p>
            {
                !IS_MOBILE && <>
                    <Header type={'h2'}>
                        {t('help.vsrg_composer_shortcuts')}
                    </Header>
                    <AppLink href={'/keybinds'} style={{marginTop: "1rem"}}>
                        <AppButton>
                            {t('help.change_keybinds')}
                        </AppButton>
                    </AppLink>
                    <ShortcutsTable shortcuts={vsrgComposerShortcuts}/>
                    <div className='row' style={{padding: '0.1rem', gap: "1rem", marginTop: "-0.1rem"}}>
                        <Key>{keys.join("/")}</Key>
                        <div>{t('shortcuts:props.vsrg_add_hit_object')}</div>
                    </div>
                </>
            }
        </Column>
    </>
}