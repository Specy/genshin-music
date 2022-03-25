import { useEffect, useState } from "react";
import { defaultThemes, ThemeKeys, ThemeStore } from "stores/ThemeStore";
import { observe } from "mobx";
import { SimpleMenu } from "components/SimpleMenu";
import { AppButton } from "components/AppButton";
import { FileElement, FilePicker } from "components/FilePicker"
import Main from "pages/Player";
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts";
import { ThemePropriety } from "./Components/ThemePropriety";
import { DB } from "Database";
import cloneDeep from 'lodash.clonedeep'
import { Theme } from "stores/ThemeStore";
import { ThemePreview } from "./Components/ThemePreview";
import { FaPlus } from "react-icons/fa";
import { BaseTheme } from "stores/ThemeStore";
import LoggerStore from "stores/LoggerStore";
import { ThemeInput } from "./Components/ThemeInput";
import { useTheme } from "lib/hooks/useTheme";
import './Theme.css'


function ThemePage() {
    const [theme, setTheme] = useTheme()
    const [userThemes, setUserThemes] = useState<Theme[]>([])
    const [selectedProp, setSelectedProp] = useState('')

    useEffect(() => {
        const dispose2 = observe(ThemeStore.state.other, () => {
            setTheme({ ...ThemeStore })
        })
        async function getThemes() {
            setUserThemes(await DB.getThemes())
        }
        getThemes()
        return () => {
            dispose2()
        }
    }, [setTheme])
    async function handleChange(name: ThemeKeys, value: string) {
        if (!ThemeStore.isEditable()) {
            if (value === ThemeStore.get(name).toString()) return
            const themeName = await asyncPrompt('Creating a new theme from this default theme, write the name:')
            if (themeName === null) return
            await cloneTheme(themeName)
        }
        ThemeStore.set(name, value)
        await ThemeStore.save()
        setUserThemes(await DB.getThemes())
    }
    async function handlePropReset(key: ThemeKeys) {
        ThemeStore.reset(key)
        await ThemeStore.save()
        setUserThemes(await DB.getThemes())
    }

    async function handleImport(file: FileElement<Theme>[]) {
        if (file.length) {
            const theme = file[0].data as Theme
            try {
                if (theme.data && theme.other) {
                    const sanitized = ThemeStore.sanitize(theme)
                    const id = await DB.addTheme(sanitized)
                    sanitized.other.id = id
                    ThemeStore.loadFromJson(sanitized)
                    setUserThemes(await DB.getThemes())
                } else {
                    LoggerStore.error('There was an error importing this theme')
                }
            } catch (e) {
                LoggerStore.error('There was an error importing this theme')
            }
        }
    }

    async function cloneTheme(name: string) {
        const theme = new BaseTheme(name)
        theme.state = cloneDeep(ThemeStore.state)
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
        const id = await DB.addTheme(newTheme.toObject())
        newTheme.state.other.id = id
        ThemeStore.loadFromJson(newTheme.toObject())
        setUserThemes(await DB.getThemes())
        return id
    }
    async function handleThemeDelete(theme: Theme) {
        if (await asyncConfirm(`Are you sure you want to delete the theme ${theme.other.name}?`)) {
            if (ThemeStore.getId() === theme.other.id) {
                ThemeStore.wipe()
            }
            await DB.removeTheme({ id: theme.other.id })
            setUserThemes(await DB.getThemes())
        }
    }

    return <div className="default-page">
        <SimpleMenu />
        <div className="default-content">

            <div style={{ display: 'flex', alignItems: 'center' }}>
                <FilePicker onChange={handleImport} as='json'>
                    <AppButton style={{ margin: '0.25rem' }}>
                        Import Theme
                    </AppButton>
                </FilePicker>
                <div style={{ marginLeft: '1rem' }}>
                    {ThemeStore.getOther('name')}
                </div>
            </div>
            <div style={{ marginTop: '2.2rem' }}>
            </div>
            {theme.toArray().map(e =>
                <ThemePropriety
                    {...e}
                    key={e.name}
                    isSelected={selectedProp === e.name}
                    canReset={ThemeStore.isEditable()}
                    isModified={!theme.isDefault(e.name)}
                    onChange={handleChange}
                    setSelectedProp={setSelectedProp}
                    handlePropReset={handlePropReset}
                />
            )}
            <ThemeInput
                name="Background image (URL)"
                value={theme.getOther('backgroundImageMain')}
                disabled={!ThemeStore.isEditable()}
                onChange={(e) => ThemeStore.setBackground(e, 'Main')}
            />
            <ThemeInput
                name="Composer Background image (URL)"
                value={theme.getOther('backgroundImageComposer')}
                disabled={!ThemeStore.isEditable()}
                onChange={(e) => ThemeStore.setBackground(e, 'Composer')}
            />
            <ThemeInput
                name="Theme name"
                value={theme.getOther('name')}
                disabled={!ThemeStore.isEditable()}
                onChange={(e) => ThemeStore.setOther('name', e)}
                onLeave={async () => {
                    await ThemeStore.save()
                    setUserThemes(await DB.getThemes())
                }}
            />
            <div style={{ fontSize: '1.5rem', marginTop: '2rem' }}>
                Your Themes
            </div>
            <div className="theme-preview-wrapper">
                {userThemes.map(theme =>
                    <ThemePreview
                        onDelete={handleThemeDelete}
                        current={theme.other.id === ThemeStore.getId()}
                        key={theme.other.id}
                        theme={theme}
                        downloadable={true}
                        onClick={(theme) => {
                            ThemeStore.loadFromTheme(theme)
                            ThemeStore.save()
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
                        current={theme.other.id === ThemeStore.getId()}
                        onClick={(theme) => {
                            ThemeStore.loadFromTheme(theme)
                            ThemeStore.save()
                        }}
                    />
                )}
            </div>
            <div style={{ fontSize: '1.5rem', marginTop: '2rem' }}>
                Preview
            </div>
            <div className="theme-app-preview">
                <Main />
            </div>
        </div>
    </div>
}


export default ThemePage