import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {SongActionButton} from "$cmp/shared/Inputs/SongActionButton";
import MenuPanel from "$cmp/shared/pagesLayout/MenuPanel";
import {SongMenu} from "$cmp/shared/pagesLayout/SongMenu";
import {MenuItem} from "$cmp/shared/Miscellaneous/MenuItem";
import {SettingsPane} from "$cmp/shared/Settings/SettingsPane";
import {asyncConfirm} from "$cmp/shared/Utility/AsyncPrompts";
import {FloatingDropdown, FloatingDropdownRow, FloatingDropdownText} from "$cmp/shared/Utility/FloatingDropdown";
import {HelpTooltip} from "$cmp/shared/Utility/HelpTooltip";
import Memoized from "$cmp/shared/Utility/Memoized";
import {hasTooltip, Tooltip} from "$cmp/shared/Utility/Tooltip";
import isMobile from "is-mobile";
import Analytics from "$lib/Stats";
import {VsrgComposerSettingsDataType} from "$lib/BaseSettings";
import {Folder} from "$lib/Folder";
import useClickOutside from "$lib/Hooks/useClickOutside";
import {useFolders} from "$lib/Hooks/useFolders";
import {useSongs} from "$lib/Hooks/useSongs";
import {useTheme} from "$lib/Hooks/useTheme";
import {fileService} from "$lib/Services/FileService";
import {songService} from "$lib/Services/SongService";
import {RecordedSong} from "$lib/Songs/RecordedSong";
import {SerializedSong, SongStorable} from "$lib/Songs/Song";
import {VsrgSong, VsrgTrackModifier} from "$lib/Songs/VsrgSong";
import {memo, useCallback, useEffect, useState} from "react";
import {
    FaBars,
    FaCog,
    FaDownload,
    FaEllipsisH,
    FaFolder,
    FaHome,
    FaMusic,
    FaPen,
    FaQuestion,
    FaSave,
    FaTimes,
    FaTrash
} from "react-icons/fa";
import {homeStore} from "$stores/HomeStore";
import {songsStore} from "$stores/SongsStore";
import {Theme} from "$stores/ThemeStore/ThemeProvider";
import {SettingUpdate} from "$types/SettingsPropriety";
import {TrackModifier} from "./TrackModifier";
import {VsrgComposerHelp} from "./VsrgComposerHelp";
import {logger} from "$stores/LoggerStore";
import ss from "$cmp/shared/Settings/Settings.module.css"
import {APP_NAME} from "$config";

type MenuTabs = 'Songs' | 'Settings' | 'Help'

interface VsrgMenuProps {
    settings: VsrgComposerSettingsDataType
    hasChanges: boolean
    audioSong: RecordedSong | null
    trackModifiers: VsrgTrackModifier[]
    setAudioSong: (song: SerializedSong | null) => void
    handleSettingChange: (override: SettingUpdate) => void
    onSave: () => void
    onSongOpen: (song: VsrgSong) => void
    onCreateSong: () => void
    onTrackModifierChange: (trackModifier: VsrgTrackModifier, index: number, recalculate: boolean) => void
}


function VsrgMenu({
                      onSave,
                      onSongOpen,
                      settings,
                      handleSettingChange,
                      hasChanges,
                      onCreateSong,
                      setAudioSong,
                      audioSong,
                      trackModifiers,
                      onTrackModifierChange
                  }: VsrgMenuProps) {
    const [isOpen, setOpen] = useState(false)
    const [isVisible, setVisible] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Settings')
    const [folders] = useFolders()
    const [songs] = useSongs()
    const [theme] = useTheme()
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setOpen(false)
        if (isMobile()) setVisible(false)
    }, {active: (isOpen && isVisible), ignoreFocusable: true})
    const toggleMenu = useCallback((override?: boolean) => {
        if (typeof override !== "boolean") override = undefined
        setVisible((old) => override !== undefined ? override : !old)
    }, [])

    const selectSideMenu = useCallback((selection?: MenuTabs) => {
        if (selection === selectedMenu && isOpen) {
            return setOpen(false)
        }
        setOpen(true)
        if (selection) {
            setSelectedMenu(selection)
            Analytics.UIEvent('menu', {tab: selection})
        }
    }, [isOpen, selectedMenu])
    const menuClass = isVisible ? "menu menu-visible" : "menu"
    const sideClass = (isOpen && isVisible) ? "side-menu menu-open" : "side-menu"
    return <>
        <div className="hamburger vsrg-hamburger" onClick={() => setVisible(!isVisible)}>
            <Memoized>
                <FaBars/>
            </Memoized>
        </div>
        <div className="menu-wrapper" ref={menuRef}>
            <div className={menuClass}>
                <MenuItem onClick={() => toggleMenu(false)} className='close-menu' ariaLabel='Close menu'>
                    <FaTimes className="icon"/>
                </MenuItem>
                <MenuItem onClick={onSave} className={`margin-top-auto ${hasChanges ? "not-saved" : ""}`}
                          ariaLabel='Save'>
                    <Memoized>
                        <FaSave className="icon"/>
                    </Memoized>
                </MenuItem>
                <MenuItem
                    onClick={() => selectSideMenu("Help")}
                    isActive={isOpen && selectedMenu === "Help"}
                    ariaLabel='Help'
                >
                    <Memoized>
                        <FaQuestion className="icon"/>
                    </Memoized>
                </MenuItem>
                <MenuItem
                    onClick={() => selectSideMenu("Songs")}
                    isActive={isOpen && selectedMenu === "Songs"}
                    ariaLabel='Song menu'
                >
                    <Memoized>
                        <FaMusic className="icon"/>
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={() => selectSideMenu("Settings")} isActive={isOpen && selectedMenu === "Settings"}
                          ariaLabel='Settings menu'>
                    <Memoized>
                        <FaCog className="icon"/>
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={homeStore.open} ariaLabel='Open home menu'
                          style={{border: "solid 0.1rem var(--secondary)"}}>
                    <Memoized>
                        <FaHome className="icon"/>
                    </Memoized>
                </MenuItem>

            </div>
            <div className={sideClass}>
                <MenuPanel current={selectedMenu} id="Help">
                    <VsrgComposerHelp/>
                </MenuPanel>
                <MenuPanel current={selectedMenu} id="Songs">
                    <div className="row">
                        <AppButton onClick={onCreateSong}>
                            Create song
                        </AppButton>
                    </div>
                    <SongMenu<SongRowProps>
                        songs={songs}
                        exclude={['composed', 'recorded']}
                        style={{marginTop: '0.6rem'}}
                        SongComponent={SongRow}
                        componentProps={{
                            theme,
                            folders,
                            functions: {
                                onClick: onSongOpen,
                                toggleMenu
                            }
                        }}
                    />
                </MenuPanel>
                <MenuPanel current={selectedMenu} id="Settings">
                    <SettingsPane
                        settings={settings}
                        onUpdate={handleSettingChange}
                    />
                    <div className="column vsrg-select-song-wrapper">
                        <h1 className={`${ss['settings-group-title']} row-centered`}>
                            Background Song
                            <HelpTooltip buttonStyle={{width: '1.2rem', height: '1.2rem', marginLeft: '0.5rem'}}>
                                You can select one of your songs to be played on the background
                            </HelpTooltip>
                        </h1>
                        {audioSong === null
                            ? <span>
                                No background song selected
                            </span>
                            : <div className="column vsrg-composer-selected-song">
                                <div className="row"
                                     style={{
                                         borderBottom: '2px solid var(--secondary)',
                                         paddingBottom: '0.4rem',
                                         marginBottom: '0.4rem'
                                     }}
                                >
                                    <span className="song-name" style={{cursor: 'default'}}>
                                        {audioSong.name}
                                    </span>
                                    <SongActionButton
                                        onClick={() => setAudioSong(null)}
                                        ariaLabel="Remove background song"
                                        tooltip="Remove background song"
                                        style={{backgroundColor: 'var(--red-bg)', margin: 0}}
                                    >
                                        <FaTimes/>
                                    </SongActionButton>
                                </div>
                                <div className="row-centered space-between">
                                    <span>
                                        Pitch
                                    </span>
                                    <span>
                                        {audioSong.pitch}
                                    </span>
                                </div>
                                <div className="row-centered space-between">
                                    <span>
                                        BPM
                                    </span>
                                    <span>
                                        {audioSong.bpm}
                                    </span>
                                </div>
                                <span style={{marginTop: '0.4rem'}}>
                                    Instrument modifiers
                                </span>
                                {trackModifiers.map((trackModifier, i) =>
                                    <TrackModifier
                                        key={i}
                                        theme={theme}
                                        data={trackModifier}
                                        onChange={(t) => onTrackModifierChange(t, i, false)}
                                        onVisibilityChange={(visible) => {
                                            onTrackModifierChange(trackModifier.set({hidden: visible}), i, true)
                                        }}
                                    />
                                )}

                            </div>
                        }
                        <SongMenu<SeelctSongRowProps>
                            songs={songs}
                            exclude={['vsrg']}
                            style={{marginTop: '0.6rem'}}
                            SongComponent={SelectSongRow}
                            componentProps={{
                                onClick: setAudioSong
                            }}
                        />
                    </div>

                </MenuPanel>
            </div>
        </div>
    </>
}

export default memo(VsrgMenu, (p, n) => {
    return p.settings === n.settings && p.hasChanges === n.hasChanges && p.audioSong === n.audioSong && p.trackModifiers === n.trackModifiers
})


interface SeelctSongRowProps {
    data: SongStorable
    onClick: (song: SerializedSong) => void
}

function SelectSongRow({data, onClick}: SeelctSongRowProps) {
    return <>
        <div
            className={`song-row ${hasTooltip(true)}`}
            onClick={async () => {
                const song = await songService.getOneSerializedFromStorable(data)
                if (!song) return logger.error("Could not find song")
                onClick(song)
            }}
            style={{cursor: 'pointer'}}
        >
            <div className={`song-name`}>
                {data.name}
            </div>
            <Tooltip>
                Click to select as background song
            </Tooltip>
        </div>
    </>
}


interface SongRowProps {
    data: SongStorable
    theme: Theme
    folders: Folder[]
    functions: {
        onClick: (song: VsrgSong) => void
        toggleMenu: (override?: boolean) => void
    }
}

function SongRow({data, functions, theme, folders}: SongRowProps) {
    const {toggleMenu, onClick} = functions
    const buttonStyle = {backgroundColor: theme.layer('primary', 0.15).toString()}
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    if (data.type !== 'vsrg') return <div className="row">
        Invalid song
    </div>
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={async () => {
            if (isRenaming) return
            const song = await songService.fromStorableSong(data)
            if (!song) return logger.error("Could not find song")
            onClick(song as VsrgSong)
            toggleMenu(false)
        }}>
            {isRenaming
                ? <input
                    className={`song-name-input ${isRenaming ? "song-rename" : ""}`}
                    disabled={!isRenaming}
                    onChange={(e) => setSongName(e.target.value)}
                    style={{width: "100%", color: "var(--primary-text)"}}
                    value={songName}
                />
                : <div style={{marginLeft: '0.3rem'}}>
                    {songName}
                </div>
            }
            <Tooltip>
                {isRenaming ? "Song name" : "Play song"}
            </Tooltip>
        </div>


        <div className="song-buttons-wrapper">
            <FloatingDropdown
                Icon={FaEllipsisH}
                style={buttonStyle}
                ignoreClickOutside={isRenaming}
                tooltip="More options"
                onClose={() => setIsRenaming(false)}
            >
                <FloatingDropdownRow
                    onClick={() => {
                        if (isRenaming) {
                            songsStore.renameSong(data.id!, songName)
                            setIsRenaming(false)
                        }
                        setIsRenaming(!isRenaming)
                    }}
                >
                    <FaPen style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text={isRenaming ? "Save" : "Rename"}/>
                </FloatingDropdownRow>
                <FloatingDropdownRow style={{padding: '0 0.4rem'}}>
                    <FaFolder style={{marginRight: "0.4rem"}}/>
                    <select className='dropdown-select'
                            value={data.folderId || "_None"}
                            onChange={async (e) => {
                                const id = e.target.value
                                const song = await songService.getOneSerializedFromStorable(data)
                                if (!song) return logger.error("Could not find song")
                                songsStore.addSongToFolder(song, id !== "_None" ? id : null)
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
                <FloatingDropdownRow onClick={async () => {
                    const song = await songService.getOneSerializedFromStorable(data)
                    if (!song) return logger.error("Could not find song")
                    fileService.downloadSong(song, `${data.name}.${APP_NAME.toLowerCase()}sheet`)
                }}>
                    <FaDownload style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text='Download'/>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={async () => {
                    const confirm = await asyncConfirm("Are you sure you want to delete this song?")
                    if (!confirm) return
                    songsStore.removeSong(data.id!)
                }}>
                    <FaTrash color="#ed4557" style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text='Delete'/>
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}

