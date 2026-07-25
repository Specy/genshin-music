<script lang="ts">
    import {onMount} from 'svelte'
    import cloneDeep from 'lodash.clonedeep'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import FilePicker, {type FileElement} from '$cmp/inputs/FilePicker.svelte'
    import Card from '$cmp/layout/Card.svelte'
    import AppBackground from '$cmp/theme/AppBackground.svelte'
    import Player from '$cmp/pages/Player/Player.svelte'
    import ThemePropriety from '$cmp/pages/theme/ThemePropriety.svelte'
    import ThemeInput from '$cmp/pages/theme/ThemeInput.svelte'
    import ThemePreview from '$cmp/pages/theme/ThemePreview.svelte'
    import {
        BaseTheme,
        ThemeProvider as theme,
        defaultThemes,
        type SerializedTheme,
        type ThemeKeys
    } from '$core/theme/ThemeProvider.svelte'
    import {asyncConfirm, asyncPrompt} from '$stores/AsyncPromptStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {themeStore} from '$stores/ThemeStore.svelte'
    import {fileService} from '$core/Services/FileService'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/app/_client-pages/theme/index.tsx (220 lines). `useTheme()` (a mobx-observe -> React-
    // state bridge, `[theme] = useTheme()`) is dropped entirely: `ThemeProvider` (imported here as
    // `theme`, the same alias convention `BaseNote.svelte`/`AppBackground.svelte`/every other
    // ThemeProvider consumer already uses) is ITSELF `$state`-backed (`ThemeProvider.svelte.ts`) -
    // reading its accessor methods directly inside the template already tracks fine-grained
    // reactivity, the hook's whole job. `useObservableArray(themeStore.themes)` -> `themeStore.themes`
    // directly (a live `$state` array, ThemeStore.svelte.ts).
    //
    // DOCUMENTED DEVIATION, UPDATED BY PHASE 4b TASK 7: the live Player/Composer preview at the
    // bottom (`<Player inPreview/>` / `<Composer inPreview/>`) was STUBBED with a themed placeholder
    // `Card` for both pages while neither existed yet. Player now exists (Phase 4b) - the `'player'`
    // branch below renders the real `<Player inPreview/>` (see that component's own header comment
    // for why it never wires `AppBackground` itself: this page supplies it, exactly like old's
    // `PageBackground` route wrapper did). The `'composer'` branch STILL renders
    // `{@render previewStub('Composer')}` - Composer doesn't exist until Phase 4c - so this remains a
    // documented, temporary asymmetry between the two branches, not an inconsistency. Everything
    // else on this page is (and was already) full-function (CRUD, clone-on-edit prompt flow,
    // background image URLs, import/export). Ledger note for 4c: swap the remaining
    // `{#snippet previewStub('Composer')}` call for the real `<Composer inPreview/>` - the
    // surrounding structure (toggle button, `AppBackground` wrapping, `.theme-app-preview` container)
    // is already wired to old's exact shape so that swap should be a drop-in, the same way Player's
    // swap was here.
    onMount(() => {
        setPageVisited('theme')
    })

    let selectedProp = $state<ThemeKeys | ''>('')
    let selectedPagePreview = $state<'player' | 'composer'>('player')

    async function handleChange(name: ThemeKeys, value: string) {
        if (!theme.isEditable()) {
            if (value === theme.get(name).toString()) return
            const themeName = await asyncPrompt('Creating a new theme from this default theme, write the name:')
            if (themeName === null) return
            await cloneTheme(themeName)
        }
        theme.set(name, value)
        await theme.save()
    }

    async function handlePropReset(key: ThemeKeys) {
        theme.reset(key)
        await theme.save()
    }

    async function handleImport(files: FileElement<SerializedTheme>[]) {
        for (const file of files) {
            const importedTheme = file.data
            try {
                await fileService.importAndLog(importedTheme)
            } catch (e) {
                logImportError(e)
            }
        }
    }

    function logImportError(error?: unknown) {
        if (error) console.error(error)
        logger.error(t('theme:error_importing_theme'), 4000)
    }

    async function cloneTheme(name: string) {
        const newTheme = new BaseTheme(name)
        newTheme.state = cloneDeep(theme.state)
        newTheme.state.other.name = name
        newTheme.state.editable = true
        await addNewTheme(newTheme)
    }

    async function handleNewThemeClick() {
        const name = await asyncPrompt(t('theme:choose_theme_name'))
        if (name !== null && name !== undefined) {
            const newTheme = new BaseTheme(name)
            await addNewTheme(newTheme)
        }
    }

    async function addNewTheme(newTheme: BaseTheme) {
        const serialized = newTheme.serialize()
        const id = await themeStore.addTheme(serialized)
        serialized.id = id
        theme.loadFromJson(serialized, id)
        theme.save()
        return id
    }

    async function handleThemeDelete(savedTheme: SerializedTheme) {
        if (await asyncConfirm(t('theme:confirm_delete_theme', {theme_name: savedTheme.other.name}))) {
            if (theme.getId() === savedTheme.id) {
                theme.wipe()
            }
            await themeStore.removeThemeById(savedTheme.id!)
        }
    }

    function loadSavedTheme(savedTheme: SerializedTheme) {
        theme.loadFromTheme(savedTheme)
        theme.save()
    }
</script>

{#snippet previewStub(pageLabel: string)}
    <!-- Composer-only now (Phase 4b Task 7 swapped the 'player' branch below for the real
         <Player inPreview/>) - still generic over `pageLabel` since nothing else about this
         snippet is Composer-specific; 4c's swap removes this snippet's last caller entirely. -->
    <Card
        className="theme-preview-stub"
        background="var(--primary)"
        color="var(--primary-text)"
        style="width:100%;height:100%;align-items:center;justify-content:center;text-align:center;padding:2rem"
    >
        <div style="font-size:1.3rem">{pageLabel}</div>
        <div style="margin-top:0.5rem;opacity:0.8">Preview — arrives with the composer port (4c).</div>
    </Card>
{/snippet}

<DefaultPage>
    <PageMetadata
        text={t('home:themes_name')}
        description="Change the theme of the app, set all colors and backgrounds, make elements translucent and share/import themes"
    />
    <div style="display:flex;align-items:center">
        <FilePicker onPick={handleImport} as="json" onError={logImportError}>
            <AppButton style="margin:0.25rem">
                {t('theme:import_theme')}
            </AppButton>
        </FilePicker>
        <div style="margin-left:1rem">
            {theme.getOther('name')}
        </div>
    </div>
    <div style="margin-top:2.2rem"></div>
    {#each theme.toArray() as prop (prop.name)}
        <ThemePropriety
            name={prop.name}
            value={prop.value}
            isSelected={selectedProp === prop.name}
            canReset={theme.isEditable()}
            isModified={!theme.isDefault(prop.name)}
            onChange={handleChange}
            setSelectedProp={(name) => (selectedProp = name)}
            {handlePropReset}
        />
    {/each}
    <ThemeInput
        name={t('theme:theme_prop.background_image')}
        value={theme.getOther('backgroundImageMain')}
        disabled={!theme.isEditable()}
        onChange={(e) => theme.setBackground(e, 'Main')}
    />
    <ThemeInput
        name={t('theme:theme_prop.composer_background_image')}
        value={theme.getOther('backgroundImageComposer')}
        disabled={!theme.isEditable()}
        onChange={(e) => theme.setBackground(e, 'Composer')}
    />
    <ThemeInput
        name={t('theme:theme_prop.theme_name')}
        value={theme.getOther('name')}
        disabled={!theme.isEditable()}
        onChange={(e) => theme.setOther('name', e)}
        onLeave={() => theme.save()}
    />
    <div style="text-align:center;margin-top:1rem">
        <span style="color:var(--red)">{t('common:warning')}</span>: {t('theme:opaque_performance_warning')}
    </div>
    <div style="font-size:1.5rem;margin-top:2rem">
        {t('theme:your_themes')}
    </div>
    <div class="theme-preview-wrapper">
        {#each themeStore.themes as savedTheme (savedTheme.id)}
            <ThemePreview
                onDelete={handleThemeDelete}
                current={savedTheme.id === theme.getId()}
                theme={savedTheme}
                downloadable={true}
                onClick={loadSavedTheme}
            />
        {/each}
        <button class="new-theme" onclick={handleNewThemeClick}>
            <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="30" width="30" xmlns="http://www.w3.org/2000/svg"><path d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/></svg>
            {t('theme:new_theme')}
        </button>
    </div>
    <div style="font-size:1.5rem;margin-top:2rem">
        {t('theme:default_themes')}
    </div>
    <div class="theme-preview-wrapper">
        {#each defaultThemes as savedTheme (savedTheme.id)}
            <ThemePreview theme={savedTheme} current={savedTheme.id === theme.getId()} onClick={loadSavedTheme} />
        {/each}
    </div>
    <div style="font-size:1.5rem;margin-top:2rem">
        {t('theme:preview')}
    </div>
    <div class="theme-app-preview">
        <AppButton
            className="box-shadow"
            toggled={true}
            style="position:absolute;right:0;top:0;z-index:90"
            onclick={() => (selectedPagePreview = selectedPagePreview === 'composer' ? 'player' : 'composer')}
        >
            {selectedPagePreview === 'composer' ? t('theme:view_player') : t('theme:view_composer')}
        </AppButton>
        {#if selectedPagePreview === 'player'}
            <AppBackground page="Main">
                <Player inPreview />
            </AppBackground>
        {:else}
            <AppBackground page="Composer">
                {@render previewStub('Composer')}
            </AppBackground>
        {/if}
    </div>
    <!-- Keep this at the bottom, same as old - its position after both preview branches above is
         load-bearing: Svelte compiles a <title> inside <svelte:head> to a plain
         `document.title = ...` assignment rather than an inserted DOM node (verified against
         node_modules/svelte's own compiler + SSR renderer source), so when several PageMetadata
         instances are mounted together the latest one to run simply overwrites the rest - no
         extra <title> element is ever created. The 'player' branch is no longer a stub (Phase 4b
         Task 7 swapped it for the real <Player inPreview/> above) and it DOES render its own
         competing PageMetadata (`home:player_name`, "Player") - this trailing call still runs
         after it, so the resolved title correctly stays "Themes" (verified live: SSR HTML and the
         hydrated DOM both show exactly one <title>, reading "Themes", not "Player"). The
         'composer' branch is unchanged - still `previewStub`, pending Phase 4c - so it renders no
         competing title of its own yet; once 4c swaps in the real <Composer inPreview/> the same
         last-wins ordering applies, so it must stay mounted above this call too. -->
    <PageMetadata
        text={t('home:themes_name')}
        description="Change the app theme, set the different colors, backgrounds, opacity and customisations"
    />
</DefaultPage>
