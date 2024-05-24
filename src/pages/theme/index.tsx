import {useCallback, useState} from "react";
import {BaseTheme, defaultThemes, SerializedTheme, ThemeKeys, ThemeProvider} from "$stores/ThemeStore/ThemeProvider";
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {FileElement, FilePicker} from "$cmp/shared/Inputs/FilePicker"
import Player from "$pages/player";
import Composer from "$pages/composer";
import {asyncConfirm, asyncPrompt} from "$cmp/shared/Utility/AsyncPrompts";
import {ThemePropriety} from "$cmp/pages/Theme/ThemePropriety";
import cloneDeep from 'lodash.clonedeep'
import {ThemePreview} from "$cmp/pages/Theme/ThemePreview";
import {FaPlus} from "react-icons/fa";
import {logger} from "$stores/LoggerStore";
import {ThemeInput} from "$cmp/pages/Theme/ThemeInput";
import {useTheme} from "$lib/Hooks/useTheme";
import {AppBackground} from "$cmp/shared/pagesLayout/AppBackground";
import {PageMetadata} from "$cmp/shared/Miscellaneous/PageMetadata";
import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {useObservableArray} from "$lib/Hooks/useObservable";
import {themeStore} from "$stores/ThemeStore/ThemeStore";
import {fileService} from "$lib/Services/FileService";
import {useTranslation} from "react-i18next";
import {useSetPageVisited} from "$cmp/shared/PageVisit/pageVisit";


function ThemePage() {
    useSetPageVisited('theme')
    const {t} = useTranslation(["theme", "home", "common"])
    const [theme] = useTheme()
    const userThemes = useObservableArray<SerializedTheme>(themeStore.themes)
    const [selectedProp, setSelectedProp] = useState('')
    const [selectedPagePreview, setSelectedPagePreview] = useState<"player" | "composer">("player")

    async function handleChange(name: ThemeKeys, value: string) {
        if (!ThemeProvider.isEditable()) {
            if (value === ThemeProvider.get(name).toString()) return
            const themeName = await asyncPrompt('Creating a new theme from this default theme, write the name:')
            if (themeName === null) return
            await cloneTheme(themeName)
        }
        ThemeProvider.set(name, value)
        await ThemeProvider.save()
    }

    async function handlePropReset(key: ThemeKeys) {
        ThemeProvider.reset(key)
        await ThemeProvider.save()
    }

    async function handleImport(files: FileElement<SerializedTheme>[]) {
        for (const file of files) {
            const theme = file.data as SerializedTheme
            try {
                await fileService.importAndLog(theme)
            } catch (e) {
                logImportError()
            }
        }
    }

    const logImportError = useCallback((error?: any) => {
        if (error) console.error(error)
        logger.error(t('error_importing_theme'), 4000)
    }, [t])

    async function cloneTheme(name: string) {
        const theme = new BaseTheme(name)
        theme.state = cloneDeep(ThemeProvider.state)
        theme.state.other.name = name
        theme.state.editable = true
        await addNewTheme(theme)
    }

    async function handleNewThemeClick() {
        const name = await asyncPrompt(t('choose_theme_name'))
        if (name !== null && name !== undefined) {
            const theme = new BaseTheme(name)
            await addNewTheme(theme)
        }
    }

    async function addNewTheme(newTheme: BaseTheme) {
        const theme = newTheme.serialize()
        const id = await themeStore.addTheme(theme)
        theme.id = id
        ThemeProvider.loadFromJson(theme, id)
        ThemeProvider.save()
        return id
    }

    async function handleThemeDelete(theme: SerializedTheme) {
        if (await asyncConfirm(t('confirm_delete_theme',{theme_name: theme.other.name}))) {
            if (ThemeProvider.getId() === theme.id) {
                ThemeProvider.wipe()
            }
            await themeStore.removeThemeById(theme.id!)
        }
    }

    return <DefaultPage>
        <PageMetadata text={t('home:themes_name')}
                      description="Change the theme of the app, set all colors and backgrounds, make elements translucent and share/import themes"/>
        <div style={{display: 'flex', alignItems: 'center'}}>
            <FilePicker onPick={handleImport} as='json' onError={logImportError}>
                <AppButton style={{margin: '0.25rem'}}>
                    {t('import_theme')}
                </AppButton>
            </FilePicker>
            <div style={{marginLeft: '1rem'}}>
                {ThemeProvider.getOther('name')}
            </div>
        </div>
        <div style={{marginTop: '2.2rem'}}>
        </div>
        {theme.toArray().map(e =>
            <ThemePropriety
                {...e}
                key={e.name}
                isSelected={selectedProp === e.name}
                canReset={ThemeProvider.isEditable()}
                isModified={!theme.isDefault(e.name)}
                onChange={handleChange}
                setSelectedProp={setSelectedProp}
                handlePropReset={handlePropReset}
            />
        )}
        <ThemeInput
            name={t('theme_prop.background_image')}
            value={theme.getOther('backgroundImageMain')}
            disabled={!ThemeProvider.isEditable()}
            onChange={(e) => ThemeProvider.setBackground(e, 'Main')}
        />
        <ThemeInput
            name={t('theme_prop.composer_background_image')}
            value={theme.getOther('backgroundImageComposer')}
            disabled={!ThemeProvider.isEditable()}
            onChange={(e) => ThemeProvider.setBackground(e, 'Composer')}
        />
        <ThemeInput
            name={t('theme_prop.theme_name')}
            value={theme.getOther('name')}
            disabled={!ThemeProvider.isEditable()}
            onChange={(e) => ThemeProvider.setOther('name', e)}
            onLeave={() => ThemeProvider.save()}
        />
        <div style={{textAlign: 'center', marginTop: '1rem'}}>
            <span style={{color: 'var(--red)'}}>
                {t('common:warning')}
            </span>: {t('opaque_performance_warning')}
        </div>
        <div style={{fontSize: '1.5rem', marginTop: '2rem'}}>
            {t('your_themes')}
        </div>
        <div className="theme-preview-wrapper">
            {userThemes.map(theme =>
                <ThemePreview
                    onDelete={handleThemeDelete}
                    current={theme.id === ThemeProvider.getId()}
                    key={theme.id}
                    theme={theme}
                    downloadable={true}
                    onClick={(theme) => {
                        ThemeProvider.loadFromTheme(theme)
                        ThemeProvider.save()
                    }}
                />
            )}
            <button className="new-theme" onClick={handleNewThemeClick}>
                <FaPlus size={30}/>
                {t('new_theme')}
            </button>
        </div>
        <div style={{fontSize: '1.5rem', marginTop: '2rem'}}>
            {t('default_themes')}
        </div>
        <div className="theme-preview-wrapper">
            {defaultThemes.map(theme =>
                <ThemePreview
                    key={theme.id}
                    theme={theme}
                    current={theme.id === ThemeProvider.getId()}
                    onClick={(theme) => {
                        ThemeProvider.loadFromTheme(theme)
                        ThemeProvider.save()
                    }}
                />
            )}
        </div>
        <div style={{fontSize: '1.5rem', marginTop: '2rem'}}>
            {t('preview')}
        </div>
        <div className="theme-app-preview">
            <AppButton
                className="box-shadow"
                toggled={true}
                style={{position: 'absolute', right: 0, top: 0, zIndex: 90}}
                onClick={() => setSelectedPagePreview(selectedPagePreview === 'composer' ? 'player' : 'composer')}
            >
                {selectedPagePreview === 'composer' ? t('view_player') : t('view_composer')}
            </AppButton>
            {selectedPagePreview === "player" &&
                <AppBackground page="Main">
                    <Player inPreview={true}/>
                </AppBackground>
            }
            {selectedPagePreview === "composer" &&
                <AppBackground page="Composer">
                    <Composer inPreview={true}/>
                </AppBackground>
            }
        </div>
        {/*Keep this at the bottom because it gets overwritten by the preview apps above */}
        <PageMetadata text={t('home:themes_name')}
                      description="Change the app theme, set the different colors, backgrounds, opacity and customisations"/>
    </DefaultPage>
}


export default ThemePage