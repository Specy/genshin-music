import {keyBinds} from '$stores/KeybindsStore';
import {useObservableMap} from '$lib/Hooks/useObservable';
import {useConfig} from '$lib/Hooks/useConfig';
import {Key, ShortcutsTable} from '$cmp/HelpTab/ShortcutsHelp';
import {Column} from "$cmp/shared/layout/Column";
import {AppLink} from "$cmp/shared/link/AppLink";
import {Header} from "$cmp/shared/header/Header";

export function VsrgComposerHelp() {
    const keys = keyBinds.getVsrgKeybinds(6)
    const {IS_MOBILE} = useConfig()
    const [vsrgComposerShortcuts] = useObservableMap(keyBinds.getShortcutMap("vsrg_composer"))
    return <>
        <Column>
            <Header type={'h2'}>
                VSRG help
            </Header>
            <p>
                To learn how to use this composer, visit the <AppLink href={`/blog/how-to-use-vsrg-composer`}>VSRG
                composer guide</AppLink>! <br/>
                There will be written a simple explanation of every function and setting in the composer.
            </p>
            {
                !IS_MOBILE && <>
                    <Header margin={'1rem 0'}>
                        VSRG Composer shortcuts
                    </Header>
                    <p>
                        The VSRG composer has some shortcuts you can use, if you want to change them, go to the <AppLink
                        href={'/keybinds'}>keybinds page</AppLink>
                    </p>
                    <ShortcutsTable shortcuts={vsrgComposerShortcuts}/>
                    <div className='row' style={{padding: '0.1rem', gap: "1rem", marginTop: "-0.1rem"}}>
                        <Key>{keys.join("/")}</Key>
                        <div> Add hit object (syncs to the registered keybinds)</div>
                    </div>
                </>
            }
        </Column>
    </>
}