import { useCallback, useEffect, useState } from "react";
import { defaultThemes, ThemeKeys, ThemeProvider } from "stores/ThemeStore";
import { observe } from "mobx";
import { SimpleMenu } from "components/Layout/SimpleMenu";
import { AppButton } from "components/Inputs/AppButton";
import { FileElement, FilePicker } from "components/Inputs/FilePicker"
import Player from "pages/Player";
import Composer from "pages/Composer";
import { asyncConfirm, asyncPrompt } from "components/Utility/AsyncPrompts";
import { ThemePropriety } from "./Components/ThemePropriety";

import cloneDeep from 'lodash.clonedeep'
import { Theme } from "stores/ThemeStore";
import { ThemePreview } from "./Components/ThemePreview";
import { FaPlus } from "react-icons/fa";
import { BaseTheme } from "stores/ThemeStore";
import { logger } from "stores/LoggerStore";
import { ThemeInput } from "./Components/ThemeInput";
import { useTheme } from "lib/Hooks/useTheme";
import './Theme.css'
import { AppBackground } from "components/Layout/AppBackground";
import { themeService } from "lib/Services/ThemeService";
import { Title } from "components/Miscellaneous/Title";


function ThemePage() {
    const [theme, setTheme] = useTheme()
    const [userThemes, setUserThemes] = useState<Theme[]>([])
    const [selectedProp, setSelectedProp] = useState('')
    const [selectedPagePreview, setSelectedPagePreview] = useState<"player" | "composer">("player")
    useEffect(() => {
        const dispose2 = observe(ThemeProvider.state.other, () => {
            setTheme({ ...ThemeProvider })
        })
        async function getThemes() {
            setUserThemes(await themeService.getThemes())
        }
        getThemes()
        return () => {
            dispose2()
        }
    }, [setTheme])
    async function handleChange(name: ThemeKeys, value: string) {
        if (!ThemeProvider.isEditable()) {
            if (value === ThemeProvider.get(name).toString()) return
            const themeName = await asyncPrompt('Creating a new theme from this default theme, write the name:')
            if (themeName === null) return
            await cloneTheme(themeName)
        }
        ThemeProvider.set(name, value)
        await ThemeProvider.save()
        setUserThemes(await themeService.getThemes())
    }
    async function handlePropReset(key: ThemeKeys) {
        ThemeProvider.reset(key)
        await ThemeProvider.save()
        setUserThemes(await themeService.getThemes())
    }

    async function handleImport(file: FileElement<Theme>[]) {
        if (file.length) {
            const theme = file[0].data as Theme
            try {
                if (theme.data && theme.other) {
                    const sanitized = ThemeProvider.sanitize(theme)
                    const id = await themeService.addTheme(sanitized)
                    sanitized.other.id = id
                    ThemeProvider.loadFromJson(sanitized)
                    setUserThemes(await themeService.getThemes())
                } else {
                    logImportError()
                }
            } catch (e) {
                logImportError()
            }
        }
    }
    const logImportError = useCallback((error?: any) => {
        if (error) console.error(error)
        logger.error('There was an error importing this theme, is it the correct file?', 4000)
    }, [])
    async function cloneTheme(name: string) {
        const theme = new BaseTheme(name)
        theme.state = cloneDeep(ThemeProvider.state)
        theme.state.other.name = name
        theme.state.editable = true
        await addNewTheme(theme)
    }
    async function handleNewThemeClick() {
        const name = await asyncPrompt('How do you want to name the theme?')
        if (name !== null && name !== undefined) {
            const theme = new BaseTheme(name)
            await addNewTheme(theme)
        }
    }
    async function addNewTheme(newTheme: BaseTheme) {
        const id = await themeService.addTheme(newTheme.toObject())
        newTheme.state.other.id = id
        ThemeProvider.loadFromJson(newTheme.toObject())
        setUserThemes(await themeService.getThemes())
        return id
    }
    async function handleThemeDelete(theme: Theme) {
        if (await asyncConfirm(`Are you sure you want to delete the theme ${theme.other.name}?`)) {
            if (ThemeProvider.getId() === theme.other.id) {
                ThemeProvider.wipe()
            }
            await themeService.removeTheme({ id: theme.other.id })
            setUserThemes(await themeService.getThemes())
        }
    }

    return <div className="default-page">
        <Title text="Themes" />
        <SimpleMenu />
        <div className="default-content">

            <div style={{ display: 'flex', alignItems: 'center' }}>
                <FilePicker onChange={handleImport} as='json' onError={logImportError}>
                    <AppButton style={{ margin: '0.25rem' }}>
                        Import Theme
                    </AppButton>
                </FilePicker>
                <div style={{ marginLeft: '1rem' }}>
                    {ThemeProvider.getOther('name')}
                </div>
            </div>
            <div style={{ marginTop: '2.2rem' }}>
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
                name="Background image (URL)"
                value={theme.getOther('backgroundImageMain')}
                disabled={!ThemeProvider.isEditable()}
                onChange={(e) => ThemeProvider.setBackground(e, 'Main')}
            />
            <ThemeInput
                name="Composer Background image (URL)"
                value={theme.getOther('backgroundImageComposer')}
                disabled={!ThemeProvider.isEditable()}
                onChange={(e) => ThemeProvider.setBackground(e, 'Composer')}
            />
            <ThemeInput
                name="Theme name"
                value={theme.getOther('name')}
                disabled={!ThemeProvider.isEditable()}
                onChange={(e) => ThemeProvider.setOther('name', e)}
                onLeave={async () => {
                    await ThemeProvider.save()
                    setUserThemes(await themeService.getThemes())
                }}
            />
            <div style={{ fontSize: '1.5rem', marginTop: '2rem' }}>
                Your Themes
            </div>
            <div className="theme-preview-wrapper">
                {userThemes.map(theme =>
                    <ThemePreview
                        onDelete={handleThemeDelete}
                        current={theme.other.id === ThemeProvider.getId()}
                        key={theme.other.id}
                        theme={theme}
                        downloadable={true}
                        onClick={(theme) => {
                            ThemeProvider.loadFromTheme(theme)
                            ThemeProvider.save()
                        }}
                    />
                )}
                <button className="new-theme" onClick={handleNewThemeClick}>
                    <FaPlus size={30} />
                    New theme
                </button>
            </div>
            <div style={{ fontSize: '1.5rem', marginTop: '2rem' }}>
                Default Themes
            </div>
            <div className="theme-preview-wrapper">
                {defaultThemes.map(theme =>
                    <ThemePreview
                        key={theme.other.id}
                        theme={theme}
                        current={theme.other.id === ThemeProvider.getId()}
                        onClick={(theme) => {
                            ThemeProvider.loadFromTheme(theme)
                            ThemeProvider.save()
                        }}
                    />
                )}
            </div>
            <div style={{ fontSize: '1.5rem', marginTop: '2rem' }}>
                Preview
            </div>
            <div className="theme-app-preview">
                <AppButton 
                    className="box-shadow" 
                    toggled={true}
                    style={{position: 'absolute', right: 0, top: 0, zIndex: 90}}
                    onClick={() => setSelectedPagePreview(selectedPagePreview === 'composer' ? 'player' : 'composer')}
                >
                    {selectedPagePreview === 'composer' ? 'View player' : 'View composer'}
                </AppButton>
                {selectedPagePreview === "player" &&
                    <AppBackground page="Main">
                        <Player />
                    </AppBackground>
                }
                {selectedPagePreview === "composer" &&
                    <AppBackground page="Composer">
                        <Composer inPreview={true}/>
                    </AppBackground>
                }
            </div>
        </div>
    </div>
}


export default ThemePage