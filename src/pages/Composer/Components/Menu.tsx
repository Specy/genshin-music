import React, {  useCallback, useEffect, useState } from 'react'
import { FaMusic, FaSave, FaCog, FaHome, FaTrash, FaDownload, FaTimes } from 'react-icons/fa';
import { FileDownloader } from "lib/Utils"
import { ComposedSong } from 'lib/Utils/ComposedSong';
import { Song } from 'lib/Utils/Song';
import { APP_NAME } from 'appConfig'
import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'
import SettingsRow from 'components/SettingsRow'
import DonateButton from 'components/DonateButton'
import Memoized from 'components/Memoized';
import { IS_MIDI_AVAILABLE } from 'appConfig';
import Analytics from 'lib/Analytics';
import LoggerStore from 'stores/LoggerStore';
import { AppButton } from 'components/AppButton';
import { SongMenu } from 'components/SongMenu';
import { ComposerSettingsDataType } from 'lib/BaseSettings';
import { SettingsPropriety } from 'types/SettingsPropriety';

interface MenuProps {
    data: {
        songs: ComposedSong[] | Song[]
        currentSong: ComposedSong | Song
        settings: ComposerSettingsDataType,
        hasChanges: boolean, 
        menuOpen: boolean, 
        isRecordingAudio: boolean
    }
    functions: {
        loadSong: (song: ComposedSong | Song) => void
        removeSong: (name: string) => void
        createNewSong: () => void
        changePage: (page: string) => void
        updateSong: (song: ComposedSong | Song) => void
        handleSettingChange: (setting: SettingsPropriety) => void
        toggleMenuVisible: () => void
        changeVolume: (data: {
            key: string, 
            value: number
        }) => void
        changeMidiVisibility: (visible: boolean) => void
        startRecordingAudio: (override?: boolean) => void
    }
}
type MenuTabs = 'Songs' | 'Help' | 'Settings' | 'Home'
function Menu({ data, functions }: MenuProps) {
    const [open, setOpen] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Settings')
    const { loadSong, removeSong, changePage, handleSettingChange, changeVolume, createNewSong, changeMidiVisibility, toggleMenuVisible } = functions


    const handleKeyboard = useCallback((event: KeyboardEvent) => {
        let key = event.code
        //@ts-ignore
        if (document.activeElement.tagName === "INPUT") return
        //@ts-ignore
        document.activeElement?.blur()
        switch (key) {
            case "Escape": {
                if (open) toggleMenuVisible()
                setOpen(false)
                break
            }
            default: break;
        }
    }, [open, toggleMenuVisible])

    useEffect(() => {
        window.addEventListener("keydown", handleKeyboard)
        return () => window.removeEventListener('keydown', handleKeyboard)
    }, [handleKeyboard])

    const toggleMenu = (override: boolean | undefined) => {
        if (typeof override !== "boolean") override = undefined
        const newState = override !== undefined ? override : !open
        setOpen(newState)
        if (newState === false) toggleMenuVisible()

    }
    const selectSideMenu = (selection:MenuTabs) => {
        if (selection === selectedMenu && open) {
            return setOpen(false)
        }
        setOpen(true)
        setSelectedMenu(selection)
        Analytics.UIEvent('menu', { tab: selection })
    }
    const downloadSong = (song: ComposedSong | Song) => {
        song.data.appName = APP_NAME
        const songName = song.name
        const converted = [APP_NAME === 'Sky'? song.toOldFormat() : song.serialize()]
        const json = JSON.stringify(converted)
        FileDownloader.download(json, `${songName}.${APP_NAME.toLowerCase()}sheet.json`)
        LoggerStore.success("Song downloaded")
        Analytics.userSongs('download', { name: song?.name, page: 'composer' })
    }
    const updateSong = () => {
        this.props.functions.updateSong(this.props.data.currentSong)
    }
    const sideClass = open ? "side-menu menu-open" : "side-menu"
    const songFunctions = {
        loadSong,
        removeSong,
        toggleMenu,
        downloadSong
    }
    let hasUnsaved = data.hasChanges ? "margin-top-auto not-saved" : "margin-top-auto"
    let menuClass = data.menuOpen ? "menu menu-visible" : "menu"
    return <div className="menu-wrapper">
        <div className={menuClass}>
            <MenuItem action={() => toggleMenu(false)} className='close-menu'>
                <FaTimes className="icon" />
            </MenuItem>
            <MenuItem type="Save" action={updateSong} className={hasUnsaved}>
                <Memoized>
                    <FaSave className="icon" />
                </Memoized>
            </MenuItem>
            <MenuItem type="Songs" action={selectSideMenu}>
                <Memoized>
                    <FaMusic className="icon" />
                </Memoized>
            </MenuItem>
            <MenuItem type="Settings" action={selectSideMenu}>
                <Memoized>
                    <FaCog className="icon" />
                </Memoized>
            </MenuItem>
            <MenuItem type="Home" action={() => changePage("home")}>
                <Memoized>
                    <FaHome className="icon" />
                </Memoized>
            </MenuItem>
        </div>
        <div className={sideClass}>
            <MenuPanel title="No selection" current={selectedMenu}>
            </MenuPanel>
            <MenuPanel title="Songs" current={selectedMenu}>

                <div className="songs-buttons-wrapper">
                    <button className="genshin-button" onClick={() => { changeMidiVisibility(true); this.toggleMenu() }}>
                        Create from MIDI
                    </button>
                    <button className="genshin-button" onClick={createNewSong}>
                        Create new song
                    </button>
                </div>
                <SongMenu
                    songs={data.songs}
                    SongComponent={SongRow}
                    baseType='composed'
                    componentProps={{
                        functions: songFunctions
                    }}
                />
                <div className="songs-buttons-wrapper" style={{ marginTop: 'auto' }}>
                    <button
                        className={`genshin-button record-btn ${data.isRecordingAudio ? "selected" : ""}`}
                        onClick={() => functions.startRecordingAudio(!data.isRecordingAudio)}
                    >
                        {data.isRecordingAudio ? "Stop recording audio" : "Start recording audio"}
                    </button>
                </div>

            </MenuPanel>
            <MenuPanel title="Settings" current={selectedMenu}>
                {Object.entries(data.settings).map(([key, data]) => {
                    return <SettingsRow
                        key={key}
                        objKey={key}
                        data={data}
                        changeVolume={changeVolume}
                        update={handleSettingChange}
                    />
                })}
                <div className='settings-row-wrap'>
                    {IS_MIDI_AVAILABLE &&
                        <button
                            className='genshin-button'
                            onClick={() => changePage('MidiSetup')}
                            style={{ width: 'fit-content' }}
                        >
                            Connect MIDI keyboard
                        </button>
                    }
                    <AppButton
                        onClick={() => changePage('Theme')}
                        style={{ width: 'fit-content' }}
                    >
                        Change app theme
                    </AppButton>
                </div>
                <DonateButton />
            </MenuPanel>
        </div>
    </div>
}



function SongRow(props) {
    const { data, functions } = props
    const { removeSong, toggleMenu, loadSong, downloadSong } = functions
    return <div className="song-row">
        <div className="song-name" onClick={() => {
            loadSong(data)
            toggleMenu(false)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => downloadSong(data)}>
                <Memoized>
                    <FaDownload />
                </Memoized>
            </button>
            <button className="song-button" onClick={() => removeSong(data.name)}>
                <Memoized>
                    <FaTrash color="#ed4557" />
                </Memoized>
            </button>
        </div>
    </div>
}



export default Menu