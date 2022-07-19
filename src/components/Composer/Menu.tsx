import { memo, useCallback, useEffect, useState } from 'react'
import { FaMusic, FaSave, FaCog, FaHome, FaTrash, FaDownload, FaTimes, FaPen, FaEllipsisH, FaFolder, FaBars, FaClone } from 'react-icons/fa';
import { APP_NAME } from 'appConfig'
import { MenuItem } from 'components/Miscellaneous/MenuItem'
import MenuPanel from 'components/Layout/MenuPanel'
import DonateButton from 'components/Miscellaneous/DonateButton'
import Memoized from 'components/Utility/Memoized';
import { IS_MIDI_AVAILABLE } from 'appConfig';
import Analytics from 'lib/Analytics';
import { logger } from 'stores/LoggerStore';
import { AppButton } from 'components/Inputs/AppButton';
import { SongMenu } from 'components/Layout/SongMenu';
import { ComposerSettingsDataType } from 'lib/BaseSettings';
import { SettingUpdate, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { Pages } from 'types/GeneralTypes';
import { useTheme } from 'lib/Hooks/useTheme';
import { ThemeStoreClass } from 'stores/ThemeStore';
import { hasTooltip, Tooltip } from 'components/Utility/Tooltip';
import { HelpTooltip } from 'components/Utility/HelpTooltip';
import { FloatingDropdown, FloatingDropdownRow, FloatingDropdownText } from 'components/Utility/FloatingDropdown';
import { Midi } from '@tonejs/midi';
import { asyncConfirm, asyncPrompt } from 'components/Utility/AsyncPrompts';
import { SettingsPane } from "components/Settings/SettingsPane";
import { SerializedSong } from 'lib/Songs/Song';
import { useFolders } from 'lib/Hooks/useFolders';
import { Folder } from 'lib/Folder';
import { songsStore } from 'stores/SongsStore';
import { folderStore } from 'stores/FoldersStore';
import { useSongs } from 'lib/Hooks/useSongs';
import { KeyboardProvider } from 'lib/Providers/KeyboardProvider';
import useClickOutside from 'lib/Hooks/useClickOutside';
import isMobile from 'is-mobile';
import { fileService } from 'lib/Services/FileService';
import { songService } from 'lib/Services/SongService';

const isOnMobile = isMobile()
interface MenuProps {
    data: {
        settings: ComposerSettingsDataType,
        hasChanges: boolean,
        isRecordingAudio: boolean
    }
    functions: {
        loadSong: (song: SerializedSong) => void
        renameSong: (newName: string, id: string) => void
        createNewSong: () => void
        changePage: (page: Pages | 'Home') => void
        updateThisSong: () => void
        handleSettingChange: (data: SettingUpdate) => void
        changeVolume: (data: SettingVolumeUpdate) => void
        changeMidiVisibility: (visible: boolean) => void
        startRecordingAudio: (override?: boolean) => void
    }
}
export type MenuTabs = 'Songs' | 'Help' | 'Settings' | 'Home'
function Menu({ data, functions }: MenuProps) {
    const [isOpen, setOpen] = useState(false)
    const [isVisible, setVisible] = useState(false)
    const [songs] = useSongs()
    const [folders] = useFolders()
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Settings')
    const { loadSong, changePage, renameSong, handleSettingChange, changeVolume, createNewSong, changeMidiVisibility, updateThisSong } = functions
    const [theme] = useTheme()
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setOpen(false)
        if (isOnMobile) setVisible(false)
    }, { active: isOpen, ignoreFocusable: true })

    useEffect(() => {
        KeyboardProvider.register("Escape", () => {
            setOpen(false)
            setVisible(false)
        }, { id: "composer_menu" })
        return () => KeyboardProvider.unregisterById("composer_menu")
    }, [])

    const toggleMenu = useCallback((override?: boolean) => {
        if (typeof override !== "boolean") override = undefined
        const newState = override !== undefined ? override : !isOpen
        setOpen(newState)
        setVisible(newState)
    }, [isOpen])

    const removeSong = useCallback(async (name: string, id: string) => {
        const confirm = await asyncConfirm("Are you sure you want to delete the song: " + name)
        if (confirm) {
            await songsStore.removeSong(id)
            Analytics.userSongs('delete', { name: name, page: 'composer' })
        }
    }, [])
    const createFolder = useCallback(async () => {
        const name = await asyncPrompt("Write the folder name")
        if (!name) return
        folderStore.createFolder(name)
    }, [])

    const selectSideMenu = useCallback((selection?: MenuTabs) => {
        if (selection === selectedMenu && isOpen) {
            return setOpen(false)
        }
        setOpen(true)
        if (selection) {
            setSelectedMenu(selection)
            Analytics.UIEvent('menu', { tab: selection })
        }
    }, [isOpen, selectedMenu])

    const downloadSong = useCallback(async (song: SerializedSong | Midi) => {
        try {
            if (song instanceof Midi) {
                const agrees = await asyncConfirm(
                    `If you use MIDI, the song will loose some information, if you want to share the song with others, use the other format (button above). Do you still want to download?`
                )
                if (!agrees) return
                return fileService.downloadMidi(song)
            }
            song.data.appName = APP_NAME
            const songName = song.name
            const parsed = songService.parseSong(song)
            const converted = [APP_NAME === 'Sky' ? parsed.toOldFormat() : parsed.serialize()]
            fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`)
            logger.success("Song downloaded")
            Analytics.userSongs('download', { name: parsed.name, page: 'composer' })
        } catch (e) {
            console.log(e)
            logger.error('Error downloading song')
        }
    }, [])
    const sideClass = isOpen ? "side-menu menu-open" : "side-menu"
    const songFunctions = {
        loadSong,
        removeSong,
        toggleMenu,
        downloadSong,
        renameSong
    }
    const hasUnsaved = data.hasChanges ? "margin-top-auto not-saved" : "margin-top-auto"
    const menuClass = isVisible ? "menu menu-visible" : "menu"
    return <>
        <div className="hamburger" onClick={() => setVisible(!isVisible)}>
            <Memoized>
                <FaBars />
            </Memoized>
        </div>
        <div className="menu-wrapper" ref={menuRef}>

            <div className={menuClass}>
                <MenuItem onClick={() => toggleMenu(false)} className='close-menu' ariaLabel='Close menu'>
                    <FaTimes className="icon" />
                </MenuItem>
                <MenuItem onClick={updateThisSong} className={hasUnsaved} ariaLabel='Save'>
                    <Memoized>
                        <FaSave className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={() => selectSideMenu("Songs")} isActive={isOpen && selectedMenu === "Songs"} ariaLabel='Song menu'>
                    <Memoized>
                        <FaMusic className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={() => selectSideMenu("Settings")} isActive={isOpen && selectedMenu === "Settings"} ariaLabel='Settings menu'>
                    <Memoized>
                        <FaCog className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={() => changePage('Home')} ariaLabel='Open home menu'>
                    <Memoized>
                        <FaHome className="icon" />
                    </Memoized>
                </MenuItem>
            </div>
            <div className={sideClass}>

                <MenuPanel current={selectedMenu} id="Songs">
                    <div className="songs-buttons-wrapper">
                        <HelpTooltip>
                            <ul>
                                <li>Click the song name to load it</li>
                                <li>You can use different instruments for each layer</li>
                                <li>Tempo changers help you make faster parts of a song without having very high bpm</li>
                                <li>You can quickly create a song by importing a MIDI file and editing it</li>
                                <li>
                                    You can add breakpoints to the timeline (the bar below the composer) to quickly jump
                                    between parts of a song
                                </li>
                            </ul>
                        </HelpTooltip>
                        <AppButton
                            onClick={() => { changeMidiVisibility(true); toggleMenu() }}
                            style={{ marginLeft: 'auto' }}
                        >
                            Create from MIDI
                        </AppButton>
                        <AppButton onClick={createNewSong}>
                            Create new song
                        </AppButton>
                    </div>
                    <SongMenu<SongRowProps>
                        songs={songs}
                        SongComponent={SongRow}
                        style={{ marginTop: '0.6rem' }}
                        componentProps={{
                            theme,
                            folders,
                            functions: songFunctions
                        }}
                    />
                    <div className='row' style={{ justifyContent: "flex-end" }}>
                        <AppButton onClick={createFolder}>
                            Create folder
                        </AppButton>
                    </div>

                    <div className="songs-buttons-wrapper" style={{ marginTop: 'auto' }}>
                        <AppButton
                            style={{ marginTop: '0.5rem' }}
                            className={`record-btn`}
                            onClick={() => functions.startRecordingAudio(!data.isRecordingAudio)}
                            toggled={data.isRecordingAudio}
                        >
                            {data.isRecordingAudio ? "Stop recording audio" : "Start recording audio"}

                        </AppButton>
                    </div>
                </MenuPanel>
                <MenuPanel current={selectedMenu} id="Settings">
                    <SettingsPane
                        settings={data.settings}
                        onUpdate={handleSettingChange}
                        changeVolume={changeVolume}
                    />
                    <div className='settings-row-wrap'>
                        {IS_MIDI_AVAILABLE &&
                            <AppButton
                                onClick={() => changePage('MidiSetup')}
                                style={{ width: 'fit-content' }}
                            >
                                Connect MIDI keyboard
                            </AppButton>
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
    </>
}


interface SongRowProps {
    data: SerializedSong
    theme: ThemeStoreClass
    folders: Folder[]
    functions: {
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string) => void
        toggleMenu: (override: boolean) => void
        loadSong: (song: SerializedSong) => void
        downloadSong: (song: SerializedSong | Midi) => void
    }
}

function SongRow({ data, functions, theme, folders }: SongRowProps) {
    const { removeSong, toggleMenu, renameSong, loadSong, downloadSong } = functions
    const buttonStyle = { backgroundColor: theme.layer('primary', 0.15).hex() }
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={() => {
            if (isRenaming) return
            loadSong(data)
            toggleMenu(false)
        }}>
            {isRenaming
                ? <input
                    className={`song-name-input ${isRenaming ? "song-rename" : ""}`}
                    disabled={!isRenaming}
                    onChange={(e) => setSongName(e.target.value)}
                    style={{ width: "100%", color: "var(--primary-text)" }}
                    value={songName}
                />
                : <div style={{ marginLeft: '0.3rem' }}>
                    {songName}
                </div>
            }
            <Tooltip>
                {isRenaming ? "Song name" : "Open in composer"}
            </Tooltip>
        </div>
        <div className="song-buttons-wrapper">
            <FloatingDropdown
                Icon={FaEllipsisH}
                ignoreClickOutside={isRenaming}

                style={buttonStyle}
                tooltip="More options"
                onClose={() => setIsRenaming(false)}
            >
                <AppButton
                    className='row row-centered'
                    style={{ padding: "0.4rem" }}
                    onClick={() => {
                        if (isRenaming) {
                            renameSong(songName, data.id!)
                            setIsRenaming(false)
                        }
                        setIsRenaming(!isRenaming)
                    }}
                >
                    <FaPen style={{ marginRight: "0.4rem" }} />
                    <FloatingDropdownText text={isRenaming ? "Save" : "Rename"} />
                </AppButton>
                <FloatingDropdownRow style={{ padding: '0 0.4rem' }}>
                    <FaFolder style={{ marginRight: "0.4rem" }} />
                    <select className='dropdown-select'
                        value={data.folderId || "_None"}
                        onChange={(e) => {
                            const id = e.target.value
                            songsStore.addSongToFolder(data, id !== "_None" ? id : null)
                        }}
                    >
                        <option value={"_None"}>
                            None
                        </option>
                        {folders.map(folder =>
                            <option key={folder.id} value={folder.id!}>{folder.name}</option>
                        )}
                    </select>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => downloadSong(data)}>
                    <FaDownload style={{ marginRight: "0.4rem" }} />
                    <FloatingDropdownText text='Download' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => downloadSong(songService.parseSong(data).toMidi())}>
                    <FaDownload style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Download MIDI' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => songsStore.addSong(songService.parseSong(data))}
                >
                    <FaClone style={{ marginRight: "0.4rem" }} />
                    <FloatingDropdownText text='Clone song' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => removeSong(data.name, data.id!)}>
                    <FaTrash color="#ed4557" style={{ marginRight: "0.4rem" }} />
                    <FloatingDropdownText text='Delete' />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}

export default memo(Menu, (p, n) => {
    return p.data.settings === n.data.settings &&
        p.data.hasChanges === n.data.hasChanges && p.data.isRecordingAudio === n.data.isRecordingAudio
})