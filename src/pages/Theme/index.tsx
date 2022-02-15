import { useEffect, useState } from "react";
import { ThemeKeys, ThemeStore } from "stores/ThemeStore";
import { observe } from "mobx";
import { SimpleMenu } from "components/SimpleMenu";
import { AppButton } from "components/AppButton";
import { FileElement, FilePicker } from "components/FilePicker"
import Main from "pages/Main";
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts";
import { ThemePropriety } from "./Components/ThemePropriety";
import './Theme.css'
import { DB } from "Database";

import { Theme } from "stores/ThemeStore";
import { ThemePreview } from "./Components/ThemePreview";
import { FaPlus } from "react-icons/fa";
import { BaseTheme } from "stores/ThemeStore";
import LoggerStore from "stores/LoggerStore";
function ThemePage() {
    const [theme, setTheme] = useState(ThemeStore)
    const [userThemes, setUserThemes] = useState<Theme[]>([])
    const [selectedProp, setSelectedProp] = useState('')

    useEffect(() => {
        const dispose = observe(ThemeStore.state.data, () => {
            setTheme({ ...ThemeStore })
        })
        const dispose2 = observe(ThemeStore.state.other, () => {
            setTheme({ ...ThemeStore })
        })
        async function getThemes() {
            setUserThemes(await DB.getThemes())
        }
        getThemes()
        return () => {
            dispose()
            dispose2()
        }
    }, [])

    async function handleChange(name: ThemeKeys, value: string) {
        if (ThemeStore.getId() === ThemeStore.baseTheme.other.id) {
            if(await addNewTheme() === null) return 
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

    async function handleImport(file: FileElement[]) {
        if (file.length) {
            const theme = file[0].data as Theme
            try {
                if (theme.data && theme.other) {
                    const id = await DB.addTheme(theme)
                    theme.other.id = id
                    theme.other.name = theme.other.name || 'Unnamed'
                    ThemeStore.loadFromJson(theme)
                    setUserThemes(await DB.getThemes())
                } else {
                    LoggerStore.error('There was an error importing this theme')
                }
            } catch (e) {
                LoggerStore.error('There was an error importing this theme')
            }
        }
    }

    async function addNewTheme() {
        const name = await asyncPrompt('How do you want to name the theme?')
        if (!name) return null
        const newTheme = new BaseTheme(name)
        const id = await DB.addTheme(newTheme.toObject())
        newTheme.state.other.id = id
        ThemeStore.loadFromJson(newTheme.toObject())
        setUserThemes(await DB.getThemes())
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
            {theme.toArray().map(e =>
                <ThemePropriety
                    {...e}
                    key={e.name}
                    selected={selectedProp === e.name}
                    onChange={handleChange}
                    setSelectedProp={setSelectedProp}
                    handlePropReset={handlePropReset}
                    modified={e.value !== theme.baseTheme.data[e.name].value}
                />
            )}
            <div className="theme-row">
                <div>
                    Background image (URL)
                </div>
                <input
                    className="app-button"
                    style={{ width: '9rem' }}
                    placeholder="Write here"
                    value={theme.getOther('backgroundImageMain')}
                    onChange={(e) => ThemeStore.setBackground(e.target.value, 'Main')}
                />
            </div>
            <div className="theme-row">
                <div>
                    Composer Background image (URL)
                </div>
                <input
                    className="app-button"
                    style={{ width: '9rem' }}
                    placeholder="Write here"
                    value={theme.getOther('backgroundImageComposer')}
                    onChange={(e) => ThemeStore.setBackground(e.target.value, 'Composer')}
                />
            </div>
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
                        onClick={(theme) => {
                            ThemeStore.loadFromTheme(theme)
                            ThemeStore.save()
                        }}
                    />
                )}
                <button className="new-theme" onClick={addNewTheme}>
                    <FaPlus size={30} />
                    New theme
                </button>
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