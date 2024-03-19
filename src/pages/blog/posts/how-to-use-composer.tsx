import {BlogMetadata} from "$pages/blog/types";
import {BaseBlogPost} from "$cmp/pages/blog/BaseBlogPost";
import Link from "next/link";
import {AppLink} from "$cmp/shared/link/AppLink";
import {Header} from "$cmp/shared/header/Header";
import {BlogImage} from "$cmp/pages/blog/BlogImage";
import {APP_NAME} from "$config";
import {BlogLi, BlogOl} from "$cmp/pages/blog/BlogUl";
import {ShortcutsTable} from "$cmp/HelpTab/ShortcutsHelp";
import {AppButton} from "$cmp/Inputs/AppButton";
import {useConfig} from "$lib/Hooks/useConfig";
import {useObservableMap} from "$lib/Hooks/useObservable";
import {keyBinds} from "$stores/KeybindsStore";
import sh from "$cmp/HelpTab/HelpTab.module.css";

export const _composerTutorialMetadata: BlogMetadata = {
    title: "How to use the composer",
    relativeUrl: "how-to-use-composer",
    image: '/assets/blog/help-composer.webp',
    description: "This is a guide to help you learn how to use the song composer to create and edit songs!",
    createdAt: new Date(),
}


export default function BlogPage() {
    const {IS_MOBILE} = useConfig()
    const [composerShortcuts] = useObservableMap(keyBinds.getShortcutMap("composer"))

    return <BaseBlogPost metadata={_composerTutorialMetadata}>
        The composer is made to help you create and edit songs, it allows you to use multiple instruments, each of them
        with
        different pitches, reverb, volume etc... <br/>
        It is a simple music DAW with which you can even create rather complex songs (there will be some examples after)
        <BlogImage src={'/assets/blog/help-composer.webp'} alt={"Composer UI"} height={'20rem'}/>
        <BlogOl>
            <BlogLi>Go to the next / previous breakpoint</BlogLi>
            <BlogLi>Timeline of the breakpoints</BlogLi>
            <BlogLi>Open the tools</BlogLi>
            <BlogLi>Add 16 columns to the end</BlogLi>
            <BlogLi>Remove the current selected column</BlogLi>
            <BlogLi>Add column after the current one</BlogLi>
            <BlogLi>Layer (instrument) selection</BlogLi>
            <BlogLi>Change column's duration</BlogLi>
        </BlogOl>

        {!IS_MOBILE && <>
            <Header margin={'1rem 0'}>
                Composer shortcuts
            </Header>
            The composer has some shortcuts you can use, if you want to change them, go to the <AppLink
            href={'/keybinds'}>keybinds page</AppLink>
            <ShortcutsTable shortcuts={composerShortcuts} style={{marginTop: '1rem'}}/>
        </>}
    </BaseBlogPost>
}
