import { useCallback, useEffect, useState } from "react";
import { defaultThemes, SerializedTheme, ThemeKeys, ThemeProvider } from "$/stores/ThemeStore/ThemeProvider";
import { observe } from "mobx";
import { AppButton } from "$cmp/Inputs/AppButton";
import { FileElement, FilePicker } from "$cmp/Inputs/FilePicker"
import Player from "$pages/Player";
import Composer from "$pages/Composer";
import { asyncConfirm, asyncPrompt } from "$cmp/Utility/AsyncPrompts";
import { ThemePropriety } from "../../components/Theme/ThemePropriety";

import cloneDeep from 'lodash.clonedeep'
import { ThemePreview } from "../../components/Theme/ThemePreview";
import { FaPlus } from "react-icons/fa";
import { BaseTheme } from "$/stores/ThemeStore/ThemeProvider";
import { logger } from "$stores/LoggerStore";
import { ThemeInput } from "../../components/Theme/ThemeInput";
import { useTheme } from "$lib/Hooks/useTheme";
import './Theme.css'
import { AppBackground } from "$cmp/Layout/AppBackground";
import { Title } from "$cmp/Miscellaneous/Title";
import { DefaultPage } from "$cmp/Layout/DefaultPage";
import { useObservableArray } from "$/lib/Hooks/useObservable";
import { themeStore } from "$/stores/ThemeStore/ThemeStore";


function ThemePage() {
    const [theme, setTheme] = useTheme()
    const userThemes = useObservableArray<SerializedTheme>(themeStore.themes)
    const [selectedProp, setSelectedProp] = useState('')
    const [selectedPagePreview, setSelectedPagePreview] = useState<"player" | "composer">("player")
    useEffect(() => {
        return observe(ThemeProvider.state.other, () => {
            setTheme({ ...ThemeProvider })
        })
    }, [])
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

    async function handleImport(file: FileElement<SerializedTheme>[]) {
        if (file.length) {
            const theme = file[0].data as SerializedTheme
            try {
                if (theme.data && theme.other) {
                    const sanitized = ThemeProvider.sanitize(theme)
                    const id = await themeStore.addTheme(sanitized)
                    sanitized.other.id = id
                    sanitized.id = id
                    ThemeProvider.loadFromJson(sanitized)
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
        const id = await themeStore.addTheme(newTheme.serialize())
        newTheme.state.other.id = id
        newTheme.state.id = id
        ThemeProvider.loadFromJson(newTheme.serialize())
        return id
    }
    async function handleThemeDelete(theme: SerializedTheme) {
        if (await asyncConfirm(`Are you sure you want to delete the theme ${theme.other.name}?`)) {
            if (ThemeProvider.getId() === theme.id) {
                ThemeProvider.wipe()
            }
            themeStore.removeThemeById(theme.id!)
        }
    }

    return <DefaultPage>
        <Title text="Themes" />
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
            onLeave={() => ThemeProvider.save()}
        />
        <div style={{textAlign:'center', marginTop: '1rem'}}>
            <span style={{color: 'var(--red)'}}>
            Warning
            </span>: GIF backgrounds could reduce performance
        </div>
        <div style={{ fontSize: '1.5rem', marginTop: '2rem' }}>
            Your Themes
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
                style={{ position: 'absolute', right: 0, top: 0, zIndex: 90 }}
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
                    <Composer inPreview={true} />
                </AppBackground>
            }
        </div>
    </DefaultPage>
}


export default ThemePage