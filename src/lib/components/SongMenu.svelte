<script module lang="ts">
    import type {SongStorable} from '$core/Songs/Song'

    // Named separately (rather than inlining `{data: SongStorable}` directly in the `generics`
    // attribute below) because that attribute is a plain string - Svelte's tokenizer scans it
    // for brace balance before the type-checker ever sees it, and a literal object-type `{...}`
    // inside the string confuses that scan (empirically: it broke this file's own script-tag
    // matching, reporting the tag as left open). A bare named type reference avoids the collision.
    export type SongMenuRowProps = {data: SongStorable}

    // Old: src/components/shared/pagesLayout/SongMenu.tsx (231 lines).
    //
    // PROP-SURFACE IDIOM DECISION (per this task's dispatch): old's `SongComponent: React.FC<any>`
    // (its own `//TODO improve this` comment flags the looseness) + `componentProps: Omit<T,
    // "data">` is ported as a direct COMPONENT+PROPS PAIR, not a snippet - Svelte 5 lets a plain
    // capitalized local variable be rendered as a dynamic component tag (`<SongComponent .../>`),
    // the exact same constraint JSX itself already imposed on old's own `SongComponent` prop name
    // (both frameworks require capitalized identifiers to resolve as components, not elements) -
    // so the OLD prop key/call-shape (`SongComponent={SongRow} componentProps={{...}}`) survives
    // completely unchanged at every future call site this unlocks (Composer/Player/VsrgComposer/
    // VsrgPlayer/SheetVisualizer menus, Phase 4b), the most mechanical option available. The
    // alternative (a `songComponent` snippet taking `(song, extraProps)` args) was rejected because
    // every real old call site passes a *component reference*, not a render function, and old's own
    // per-page SongRow components are ordinary components with their own local state/hooks (e.g.
    // error page's SongRow, which resolves a serialized song async before downloading) - snippets
    // can't own that the way a component can.
    // One deliberate tightening over old: `SongComponent: Component<T>` instead of old's admitted
    // `any` - old's own generic bound (`T extends {data: SongStorable}`) already fully determines
    // the correct prop shape, so nothing is lost by actually enforcing it (zero runtime difference,
    // strictly more type safety - same class of improvement as SettingsInput.svelte's SettingUpdate
    // tightening in Phase 4a Task 4).
    //
    // isComposedOrRecorded: grepped - old SongMenu.tsx doesn't import it (only sheet-visualizer/
    // index.tsx does, out of this task's scope), so no Utilities restoration is triggered here.
    //
    // The dispatch's own CSS cross-reference (".library-search-*"/".tab-selector*" "already in
    // App.css") does NOT apply to this file - those two class families belong to PlayerMenu's
    // separate song-*library* search feature (Player/menu.css, confirmed via repo-wide grep: zero
    // uses in SongMenu.tsx or any of its old call sites), pulled into App.css ahead of time by an
    // earlier CSS-consolidation task for whichever future task ports PlayerMenu. SongMenu's actual
    // own CSS is the tiny, never-before-ported `SongMenu.module.css` (.search/.search input, 11
    // lines) - now owned by the sibling SongMenuSearch.svelte (see below). There likewise is no
    // "recorded/composed tab selector" anywhere in this file (re-verified against the real blob,
    // byte-checked against the brief's own cited 231-line count) - the three song types render as
    // three simultaneously-visible default SongFolder sections, not a tab switcher; `baseType` only
    // picks which one starts expanded. Both brief callouts are flagged here as inaccurate for this
    // specific file, per "old blobs are the spec" - documented rather than silently chased.
    //
    // TOOLING PITFALL (found while porting this file, flagged for whoever next touches SongMenu*
    // .svelte): a source comment that spells out a real style-tag or script-tag substring with
    // actual angle brackets - even one describing this very issue, as an earlier draft of this
    // comment did - makes svelte-check misreport a phantom "script left open" parse error on a
    // generics-attributed component whenever the SAME file also has an actual style block
    // (verified via bisection: this exact paragraph, unchanged apart from de-bracketing those two
    // tag names, was the one line separating a clean check run from that phantom error). It is why
    // the search box below was split out into its own plain (non-generic) SongMenuSearch.svelte
    // rather than keeping a style block directly in this file - not a design preference, a
    // workaround for this specific tooling limitation.
</script>

<script lang="ts" generics="T extends SongMenuRowProps">
    import type {Component} from 'svelte'
    import FuzzySearch from 'fuzzy-search'
    import {Folder} from '$core/Folder'
    import type {SongType} from '$core/Songs/Song'
    import {folderStore} from '$stores/FoldersStore.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {t} from '$i18n/binding.svelte'
    import Row from './layout/Row.svelte'
    import AppButton from './inputs/AppButton.svelte'
    import SongFolder from './SongFolder.svelte'
    import SongFolderContent from './SongFolderContent.svelte'
    import SongMenuSearch from './SongMenuSearch.svelte'

    let {
        songs,
        SongComponent,
        componentProps,
        className = '',
        style = '',
        baseType,
        exclude,
        onCreateFolder,
    }: {
        songs: SongStorable[]
        SongComponent: Component<T>
        componentProps: Omit<T, 'data'>
        className?: string
        style?: string
        baseType?: SongType
        exclude?: SongType[]
        onCreateFolder?: () => void
    } = $props()

    let searchValue = $state('')

    function isInFolder(folders: Folder[], song: SongStorable) {
        return folders.some(f => f.id === song.folderId)
    }

    // old: `useEffect(() => {...}, [songs, exclude, searchValue])` writing into a separate
    // `filteredSongs` state. Direct $derived translation - excludes by type first, then either
    // returns the excluded set as-is (search empty) or fuzzy-searches it. Minor, behaviorally
    // inert deviation from old's literal code: old always constructs `new FuzzySearch(...)` before
    // checking `searchValue === ''` (discarding it unused in that branch); constructed here only
    // when actually needed - same observable result, one fewer wasted allocation per recompute.
    const filteredSongs = $derived.by(() => {
        const excluded = songs.filter(s => !(exclude?.includes(s.type)))
        if (searchValue === '') return excluded
        const searcher = new FuzzySearch(excluded, ['name'], {caseSensitive: false, sort: true})
        return searcher.search(searchValue)
    })

    // old: `useFolders(filteredSongs)` (src/lib/Hooks/useFolders.ts) - clones every real folder
    // from folderStore, filling in `.songs` from filteredSongs by folderId, sorted per the folder's
    // own filterType. Old's 3-branch if/else-if/else ('date-created' -> unsorted, 'alphabetical' ->
    // sorted, else -> unsorted) collapses to the equivalent 2 branches below (the first and third
    // branches were identical in old too).
    const folders = $derived.by(() => {
        return folderStore.folders.map(folder => {
            const clone = folder.clone()
            const filtered = filteredSongs.filter(song => song.folderId === folder.id)
            clone.songs = folder.filterType === 'alphabetical'
                ? filtered.sort((a, b) => a.name.localeCompare(b.name))
                : filtered
            return clone
        })
    })

    // old: 3x `useState<Folder>()` + a `useEffect` rebuilding all three on [filteredSongs, folders,
    // t] - direct $derived translation, one derivation each (no transient `undefined` before the
    // first effect run, so the old JSX's extra "&& noFolderX" truthiness guard is redundant here
    // and dropped from the {#if} conditions below).
    // Quirk preserved: noFolderVsrg's name is the literal, UNtranslated string "Vsrg" (old never
    // wrapped it in t(), unlike the other two, which use t('menu:composed')/t('menu:recorded')).
    const noFolderComposed = $derived(new Folder(t('menu:composed'), null, filteredSongs.filter(song => !isInFolder(folders, song) && song.type === 'composed')))
    const noFolderRecorded = $derived(new Folder(t('menu:recorded'), null, filteredSongs.filter(song => !isInFolder(folders, song) && song.type === 'recorded')))
    const noFolderVsrg = $derived(new Folder('Vsrg', null, filteredSongs.filter(song => !isInFolder(folders, song) && song.type === 'vsrg')))

    const unselectedColor = $derived(ThemeProvider.layer('menu_background', 0.35).lighten(0.2))
    const unselectedColorText = $derived(ThemeProvider.getTextColorFromBackground(unselectedColor).toString())
    const folderColor = $derived(ThemeProvider.getText('menu_background').toString())

    // `{...componentProps} data={song}` merges to `Omit<T, 'data'> & {data: SongStorable}` - old's
    // own generic bound (`T extends {data: SongStorable}`) guarantees this always structurally
    // equals T for any real instantiation, but TypeScript can't prove that reduction for an
    // unresolved generic T (the same class of limitation FilePicker.svelte's own `pick` alias
    // works around). One documented cast here, reused at all 6 SongComponent call sites below,
    // rather than repeating the same unprovable-but-correct assertion at each site.
    function rowProps(song: SongStorable): T {
        return {...componentProps, data: song} as T
    }
</script>

<div class={className} style={style}>
    <Row justify="between" gap="0.5rem">
        <SongMenuSearch
            value={searchValue}
            onInput={(v) => searchValue = v}
            backgroundColor={unselectedColor.toString()}
            textColor={unselectedColorText}
        />
        {#if onCreateFolder}
            <AppButton onclick={onCreateFolder}>{t('menu:create_folder')}</AppButton>
        {/if}
    </Row>

    {#if !exclude?.includes('composed')}
        <SongFolder
            backgroundColor={unselectedColor.toString()}
            headerColor={unselectedColorText}
            color={folderColor}
            data={noFolderComposed}
            isDefault={true}
            defaultOpen={baseType === 'composed'}
        >
            <SongFolderContent>
                {#each noFolderComposed.songs as song (song.id)}
                    <SongComponent {...rowProps(song)} />
                {/each}
                {#if noFolderComposed.songs.length === 0}
                    <div style="padding:0.2rem;font-size:0.9rem">{t('menu:hint_no_recorded_songs')}</div>
                {/if}
            </SongFolderContent>
        </SongFolder>
    {/if}

    {#if !exclude?.includes('recorded')}
        <SongFolder
            backgroundColor={unselectedColor.toString()}
            headerColor={unselectedColorText}
            color={folderColor}
            data={noFolderRecorded}
            isDefault={true}
            defaultOpen={baseType === 'recorded'}
        >
            <SongFolderContent>
                {#each noFolderRecorded.songs as song (song.id)}
                    <SongComponent {...rowProps(song)} />
                {/each}
                {#if noFolderRecorded.songs.length === 0}
                    <div style="padding:0.2rem;font-size:0.9rem">{t('menu:hint_no_recorded_songs')}</div>
                {/if}
            </SongFolderContent>
        </SongFolder>
    {/if}

    {#if !exclude?.includes('vsrg')}
        <!-- PRESERVED QUIRK: old's defaultOpen here checks `baseType === 'recorded'`, the SAME
             condition as the Recorded folder above, not `baseType === 'vsrg'` - a copy-paste bug in
             the original JSX (verified against the raw blob), reproduced byte-for-byte rather than
             silently corrected. -->
        <SongFolder
            backgroundColor={unselectedColor.toString()}
            headerColor={unselectedColorText}
            color={folderColor}
            data={noFolderVsrg}
            isDefault={true}
            defaultOpen={baseType === 'recorded'}
        >
            <SongFolderContent>
                {#each noFolderVsrg.songs as song (song.id)}
                    <SongComponent {...rowProps(song)} />
                {/each}
                {#if noFolderVsrg.songs.length === 0}
                    <div style="padding:0.2rem;font-size:0.9rem">{t('menu:hint_no_songs_in_folder')}</div>
                {/if}
            </SongFolderContent>
        </SongFolder>
    {/if}

    {#each folders as folder (folder.id)}
        {@const composed = folder.songs.filter(song => song.type === 'composed')}
        {@const recorded = folder.songs.filter(song => song.type === 'recorded')}
        {@const vsrg = folder.songs.filter(song => song.type === 'vsrg')}
        <SongFolder
            backgroundColor={unselectedColor.toString()}
            headerColor={unselectedColorText}
            color={folderColor}
            data={folder}
        >
            {#if !exclude?.includes('composed') && composed.length > 0}
                <SongFolderContent title="Composed">
                    {#each composed as song (song.id)}
                        <SongComponent {...rowProps(song)} />
                    {/each}
                </SongFolderContent>
            {/if}
            {#if !exclude?.includes('recorded') && recorded.length > 0}
                <SongFolderContent title="Recorded">
                    {#each recorded as song (song.id)}
                        <SongComponent {...rowProps(song)} />
                    {/each}
                </SongFolderContent>
            {/if}
            {#if !exclude?.includes('vsrg') && vsrg.length > 0}
                <SongFolderContent title="Vsrg">
                    {#each vsrg as song (song.id)}
                        <SongComponent {...rowProps(song)} />
                    {/each}
                </SongFolderContent>
            {/if}
            <!-- PRESERVED QUIRK: this emptiness check ignores `exclude` entirely (it looks at the
                 raw composed/recorded/vsrg counts, not at whether those types are individually
                 excluded from rendering above) - if a folder contains ONLY an excluded type, old
                 shows neither the type's content (excluded) nor this empty message (the raw count
                 isn't actually zero), leaving a folder header with a blank body. Reproduced exactly. -->
            {#if composed.length === 0 && recorded.length === 0 && vsrg.length === 0}
                <div style="padding:0.7rem;padding-top:0;font-size:0.9rem">{t('menu:folder_empty')}</div>
            {/if}
        </SongFolder>
    {/each}
</div>
