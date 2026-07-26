<script lang="ts">
    import {homeStore} from '$stores/HomeStore.svelte'
    import {folderStore} from '$stores/FoldersStore.svelte'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {globalConfigStore} from '$stores/GlobalConfigStore.svelte'
    import {clickOutside} from '$lib/utils/clickOutside'
    import type {VsrgSong} from '$core/Songs/VsrgSong'
    import type {SongType} from '$core/Songs/Song'
    import type {VsrgPlayerSettingsDataType} from '$core/BaseSettings'
    import type {SettingUpdate} from '$core/types/SettingsPropriety'
    import {t} from '$i18n/binding.svelte'
    import MenuSidebar from '$cmp/menu/MenuSidebar.svelte'
    import MenuItem from '$cmp/menu/MenuItem.svelte'
    import MenuButton from '$cmp/menu/MenuButton.svelte'
    import MenuPanel from '$cmp/menu/MenuPanel.svelte'
    import MenuPanelWrapper from '$cmp/menu/MenuPanelWrapper.svelte'
    import SongMenu from '$cmp/SongMenu.svelte'
    import VsrgPlayerSongRow, {type VsrgSongSelectType} from './VsrgPlayerSongRow.svelte'
    import SettingsPane from '$cmp/settings/SettingsPane.svelte'
    import Separator from '$cmp/Separator.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'

    // Old: src/components/pages/VsrgPlayer/VsrgPlayerMenu.tsx (265 lines, default export `VsrgMenu`,
    // `memo`-wrapped). Old's local `SongRow` sub-component is split into its own sibling file this
    // same task (see VsrgPlayerSongRow.svelte's own header comment for the "brief-silent sibling"
    // rationale).
    //
    // `memo(VsrgMenu, (p, n) => p.settings === n.settings)` DROPPED (established
    // "Svelte 5 fine-grained reactivity replaces manual memoization" precedent, every memo drop
    // this migration).
    //
    // Structural precedent: VsrgComposerMenu.svelte (P4c Task 8, same MenuSidebar/
    // MenuPanelWrapper/panel-snippet/hamburger-as-first-child/wrapperEl+clickOutside shape).
    // `useClickOutside<HTMLDivElement>((e) => { setIsVisible(false) }, {active: isOpen && isVisible,
    // ignoreFocusable: true})` + `ref={menuRef}` -> `wrapperEl` bound via MenuSidebar's own
    // `bind:wrapperEl`, plus a manually-invoked `clickOutside(...)` action in an `$effect` - the
    // same established pattern. Old's own callback here is the SIMPLE shape (just
    // `setIsVisible(false)`, no mobile branch) - matching ZenKeyboardMenu.svelte's/
    // VsrgComposerMenu.svelte's own identical callback shape (verified against the raw old blob,
    // not an inconsistency introduced here).
    //
    // TWO REAL, DISCLOSED DIFFERENCES from VsrgComposerMenu.svelte's own otherwise-identical shape
    // (verified against the raw old blob, not normalized away to match its sibling):
    // (1) `isVisible` starts `true` here (old: `useState(true)`), not `false` - this menu is
    //     VISIBLE by default; VsrgComposerMenu's own starts hidden (mobile-collapsed).
    // (2) The hamburger div's class is the bare `"hamburger-top"` (old: `className="hamburger-top"`,
    //     no "vsrg-hamburger" modifier), and BOTH the hamburger's and the close button's onClick
    //     handlers are UNCONDITIONAL sets (`() => setIsVisible(true)` / `() => setIsVisible(false)`),
    //     NOT toggles - unlike VsrgComposerMenu.svelte's own toggle-shaped
    //     `onclick={() => isVisible = !isVisible}` on both. `.hamburger-top` is the SAME already-
    //     ported global class ZenKeyboardMenu.svelte's own hamburger uses (App.css:1500/1518,
    //     P4a Task 3 CSS pull-forward) - no new CSS needed here either.
    //
    // No `createShortcutListener`/`onMount` at all here (verified against the raw old blob: old's
    // `VsrgMenu` registers no keyboard shortcut of its own, unlike ComposerMenu.svelte/PlayerMenu
    // .svelte/VsrgComposerMenu.svelte, which each register their own toggle_menu/close_menu
    // shortcut) - the outer VsrgPlayer PAGE registers `restart`/`stop` shortcuts instead (this
    // task's own +page.svelte route).
    //
    // `useTheme()`/`useFolders()`/`useSongs()`/`useConfig().IS_MOBILE` -> direct
    // `songsStore.songs`/`folderStore.folders`/`globalConfigStore.state.IS_MOBILE` reads (already
    // the established idiom); `theme` itself is no longer threaded through `componentProps` at all
    // (VsrgPlayerSongRow.svelte imports `ThemeProvider` directly, same as every other SongRow
    // sibling this migration ported).
    //
    // Icons: FaBars/FaTimes/FaMusic/FaCog/FaHome all byte-matched against the copies already
    // inlined in VsrgComposerMenu.svelte (P4c Task 8, same pinned react-icons@5.6.0 source) - not
    // re-fetched, since the shipped SVG is identical either way.
    let {
        settings,
        onSongSelect,
        onSettingsUpdate,
    }: {
        settings: VsrgPlayerSettingsDataType
        onSongSelect: (song: VsrgSong, type: VsrgSongSelectType) => void
        onSettingsUpdate: (update: SettingUpdate) => void
    } = $props()

    const excludedSongs: SongType[] = ['composed', 'recorded']

    let isOpen = $state(false)
    let isVisible = $state(true)
    let selectedMenu = $state('Settings')
    let wrapperEl: HTMLDivElement | undefined = $state()

    $effect(() => {
        if (!wrapperEl) return
        const action = clickOutside(wrapperEl, {
            active: isOpen && isVisible,
            ignoreFocusable: true,
            onOutside: () => {
                isVisible = false
            },
        })
        return () => action.destroy?.()
    })
</script>

{#snippet faBarsIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M16 132h416c8.837 0 16-7.163 16-16V76c0-8.837-7.163-16-16-16H16C7.163 60 0 67.163 0 76v40c0 8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16z"/></svg>
{/snippet}

{#snippet faTimesIcon()}
    <svg class="icon" stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 352 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg>
{/snippet}

{#snippet faMusicIcon()}
    <svg class="icon" stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M470.38 1.51L150.41 96A32 32 0 0 0 128 126.51v261.41A139 139 0 0 0 96 384c-53 0-96 28.66-96 64s43 64 96 64 96-28.66 96-64V214.32l256-75v184.61a138.4 138.4 0 0 0-32-3.93c-53 0-96 28.66-96 64s43 64 96 64 96-28.65 96-64V32a32 32 0 0 0-41.62-30.49z"/></svg>
{/snippet}

{#snippet faCogIcon()}
    <svg class="icon" stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"/></svg>
{/snippet}

{#snippet faHomeIcon()}
    <svg class="icon" stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M280.37 148.26L96 300.11V464a16 16 0 0 0 16 16l112.06-.29a16 16 0 0 0 15.92-16V368a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v95.64a16 16 0 0 0 16 16.05L464 480a16 16 0 0 0 16-16V300L295.67 148.26a12.19 12.19 0 0 0-15.3 0zM571.6 251.47L488 182.56V44.05a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v72.61L318.47 43a48 48 0 0 0-61 0L4.34 251.47a12 12 0 0 0-1.6 16.9l25.5 31A12 12 0 0 0 45.15 301l235.22-193.74a12.19 12.19 0 0 1 15.3 0L530.9 301a12 12 0 0 0 16.9-1.6l25.5-31a12 12 0 0 0-1.7-16.93z"/></svg>
{/snippet}

<MenuSidebar
    bind:wrapperEl
    current={selectedMenu}
    setCurrent={(c) => selectedMenu = c}
    open={isOpen}
    setOpen={(o) => isOpen = o}
    visible={isVisible}
>
    {#snippet hamburger()}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="hamburger-top" onclick={() => isVisible = true}>
            {@render faBarsIcon()}
        </div>
    {/snippet}
    <MenuButton onclick={() => isVisible = false} ariaLabel={t('menu:close_menu')}>
        {@render faTimesIcon()}
    </MenuButton>
    <MenuItem style="margin-top:auto" id="Songs" ariaLabel={t('menu:song_menu')}>
        {@render faMusicIcon()}
    </MenuItem>
    <MenuItem id="Settings" ariaLabel={t('menu:settings_menu')}>
        {@render faCogIcon()}
    </MenuItem>
    <MenuButton onclick={homeStore.open} ariaLabel={t('menu:open_home_menu')} style="border:solid 0.1rem var(--secondary)">
        {@render faHomeIcon()}
    </MenuButton>

    {#snippet panel()}
        <MenuPanelWrapper>
            <MenuPanel id="Songs">
                <div class="row">
                    <AppLink href="/vsrg-composer">
                        <AppButton>
                            {t('common:create_song')}
                        </AppButton>
                    </AppLink>
                </div>
                <SongMenu
                    songs={songsStore.songs}
                    exclude={excludedSongs}
                    style="margin-top:0.6rem"
                    SongComponent={VsrgPlayerSongRow}
                    componentProps={{
                        folders: folderStore.folders,
                        functions: {
                            setMenuVisible: (v) => isVisible = v,
                            onSongSelect,
                        },
                    }}
                />
            </MenuPanel>
            <MenuPanel id="Settings">
                <SettingsPane
                    settings={settings}
                    onUpdate={onSettingsUpdate}
                />
                {#if !globalConfigStore.state.IS_MOBILE}
                    <Separator background="var(--secondary)" height="0.1rem" verticalMargin="0.5rem" />
                    <AppLink href="/keybinds" style="margin-left:auto">
                        <AppButton>
                            {t('settings:change_keybinds')}
                        </AppButton>
                    </AppLink>
                {/if}
            </MenuPanel>
        </MenuPanelWrapper>
    {/snippet}
</MenuSidebar>
