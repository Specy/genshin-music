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
function ThemePage() {
    const [theme, setTheme] = useState(ThemeStore)
    const [userThemes, setUserThemes] = useState<Theme[]>([])
    const [selected, setSelected] = useState('')
    
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data, () => {
            setTheme({ ...ThemeStore })
        })
        const dispose2 = observe(ThemeStore.state.other, () => {
            setTheme({ ...ThemeStore })
        })
        async function getThemes(){
            setUserThemes(await DB.getThemes())
        }
        getThemes()
        return () => {
            dispose()
            dispose2()
        }
    }, [])

    function handleChange(name: ThemeKeys, value: string) {
        ThemeStore.set(name, value)
    }

    function handleImport(file: FileElement[]) {
        if (file.length) ThemeStore.loadFromJson(file[0].data)
    }

    async function downloadTheme(){
        ThemeStore.download(ThemeStore.getOther('name'))
    }
    async function addNewTheme(){
        const name = await asyncPrompt('How do you want to name the theme?')
        if(name){
            const newTheme = new BaseTheme(name)
            const id = await DB.addTheme(newTheme.toObject())
            newTheme.state.other.id = id
            setUserThemes(await DB.getThemes())
            ThemeStore.loadFromJson(newTheme.toObject())
        }
    }
    async function handleThemeDelete(theme: Theme){
        if(await asyncConfirm(`Are you sure you want to delete the theme ${theme.other.name}?`)){
            DB.removeTheme({id: theme.other.id})
            setUserThemes(await DB.getThemes())
        }
    }
    return <div className="default-page">
        <SimpleMenu />
        <div className="default-content">

            <div style={{ display: 'flex', alignItems: 'center' }}>
                <AppButton onClick={downloadTheme} style={{ margin: '0.25rem' }}>
                    Download Theme
                </AppButton>
                <FilePicker onChange={handleImport} as='json'>
                    <AppButton style={{ margin: '0.25rem' }}>
                        Import Theme
                    </AppButton>
                </FilePicker>
                <div style={{marginLeft: '1rem'}}>
                    {ThemeStore.getOther('name')}
                </div>
            </div>
            <div style={{ margin: '1rem' }}>
                Press the color that you want to choose, then press save once you are done.
                <br />
                Use the lower slider if you only want to change the color but keep the tonality.
            </div>
            {theme.toArray().map(e =>
                <ThemePropriety
                    {...e}
                    key={e.name}
                    selected={selected === e.name}
                    onChange={handleChange}
                    setSelectedProp={setSelected}
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
            <div style={{ fontSize: '1.5rem', marginTop: '3rem' }}>
                Your Themes
            </div>
            <div className="theme-preview-wrapper">
                {userThemes.map(theme => 
                        <ThemePreview 
                            onDelete={handleThemeDelete}
                            key={theme.other.id}
                            theme={theme}
                            onClick={ThemeStore.loadFromTheme}
                        />   
                    )}
                <button className="new-theme" onClick={addNewTheme}>
                    <FaPlus />            
                </button>
            </div>
            <div style={{ fontSize: '1.5rem', marginTop: '3rem' }}>
                Preview
            </div>
            <div className="theme-app-preview">
                <Main />
            </div>
        </div>
    </div>
}


export default ThemePage