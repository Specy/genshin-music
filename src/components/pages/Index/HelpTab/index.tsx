import {useConfig} from '$lib/Hooks/useConfig'
import {HelpTooltip} from '$cmp/shared/Utility/HelpTooltip'
import {useObservableMap} from '$lib/Hooks/useObservable'
import {keyBinds} from '$stores/KeybindsStore'
import {ShortcutsTable} from './ShortcutsHelp'
import {AppLink} from "$cmp/shared/link/AppLink";
import {Header} from "$cmp/shared/header/Header";
import {useTranslation} from "react-i18next";
import {AppButton} from "$cmp/shared/Inputs/AppButton";

export function HelpTab() {
    const {t} = useTranslation('tutorials')
    return <>
        <div style={{margin: '0.5rem 0'}}>
            {t('help.question_mark_description')}
            <HelpTooltip
                parentStyle={{
                    display: 'inline-flex'
                }}
                buttonStyle={{
                    width: '1.2rem',
                    height: '1.2rem',
                    margin: '0 0.4rem'
                }}
            >
                {t('help.example_help')}
            </HelpTooltip>
        </div>
        <Header type={'h2'}>
            {t('help.learn_how_to_use_player')}
        </Header>
        <p>
            <AppLink href={'/blog/posts/how-to-use-player'}>{t('help.click_to_visit_blog')}</AppLink>
        </p>
        <Header type={'h2'}>
            {t('help.learn_how_to_use_composer')}
        </Header>
        <p>
            <AppLink href={'/blog/posts/how-to-use-composer'}>{t('help.click_to_visit_blog')}</AppLink>
        </p>
    </>
}


export function ComposerShortcuts() {
    const {t} = useTranslation(['tutorials', 'home'])
    const {IS_MOBILE} = useConfig()
    const [composerShortcuts] = useObservableMap(keyBinds.getShortcutMap("composer"))
    if (IS_MOBILE) return
    return <>
        <Header type={'h2'}>
            {t('help.composer_shortcuts')}
        </Header>
        <AppLink href={'/keybinds'} style={{marginTop: "1rem"}}>
            <AppButton>
                {t('help.change_keybinds')}
            </AppButton>
        </AppLink>
        <ShortcutsTable shortcuts={composerShortcuts} style={{marginTop: '1rem'}}/>
    </>
}
export function PlayerShortcuts() {
    const {t} = useTranslation(['tutorials', 'home'])
    const {IS_MOBILE} = useConfig()
    const [playerShortcuts] = useObservableMap(keyBinds.getShortcutMap("player"))
    if (IS_MOBILE) return
    return <>
        <Header type={'h2'}>
            {t('help.player_shortcuts')}
        </Header>
        <AppLink href={'/keybinds'} style={{marginTop: "1rem"}}>
            <AppButton>
                {t('help.change_keybinds')}
            </AppButton>
        </AppLink>
        <ShortcutsTable shortcuts={playerShortcuts} style={{marginTop: '1rem'}}/>
    </>
}