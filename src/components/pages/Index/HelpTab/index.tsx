import {useConfig} from '$lib/Hooks/useConfig'
import {HelpTooltip} from '$cmp/shared/Utility/HelpTooltip'
import {useObservableMap} from '$lib/Hooks/useObservable'
import {keyBinds} from '$stores/KeybindsStore'
import {ShortcutsTable} from './ShortcutsHelp'
import {AppLink} from "$cmp/shared/link/AppLink";
import {Header} from "$cmp/shared/header/Header";

export function HelpTab() {
    const {IS_MOBILE} = useConfig()

    return <>
        <div>
            {IS_MOBILE
                ? 'Long press the buttons to see a tooltip. '
                : 'Hover over the buttons to see a tooltip. '
            }

            When clicking
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
                Example help
            </HelpTooltip>
            it will show you more info.
        </div>
        <Header type={'h2'}>
            Learn how to use the Player
        </Header>
        <p>
            To learn how to use the Player, visit the <AppLink href={'/blog/how-to-use-player'}>Player guide</AppLink>,
            it will
            tell you about every feature in the player, and what every setting does.
        </p>
        <Header type={'h2'}>
            Learn how to use the composer
        </Header>
        <p>
            To learn how to use the composer, visit the <AppLink href={'/blog/how-to-use-composer'}>Composer
            guide</AppLink>,
            it will tell you about every feature in the composer, what every setting does, and other tutorials on how to
            work with
            sheets, midi, and audio files
        </p>
    </>
}


export function ComposerShortcuts() {
    const {IS_MOBILE} = useConfig()
    const [composerShortcuts] = useObservableMap(keyBinds.getShortcutMap("composer"))
    if (IS_MOBILE) return
    return <>
        <Header  type={'h2'}>
            Composer shortcuts
        </Header>
        <p>
            The composer has some shortcuts you can use, if you want to change them, go to the <AppLink
            href={'/keybinds'}>keybinds page</AppLink>
        </p>
        <ShortcutsTable shortcuts={composerShortcuts} style={{marginTop: '1rem'}}/>
    </>
}

export function PlayerShortcuts() {
    const {IS_MOBILE} = useConfig()
    const [playerShortcuts] = useObservableMap(keyBinds.getShortcutMap("player"))
    if (IS_MOBILE) return
    return <>
        <Header  type={'h2'}>
            Player shortcuts
        </Header>
        <p>
            The player has some shortcuts you can use, if you want to change them, go to the <AppLink
            href={'/keybinds'}>keybinds page</AppLink>
        </p>
        <ShortcutsTable shortcuts={playerShortcuts} style={{marginTop: '1rem'}}/>
    </>
}