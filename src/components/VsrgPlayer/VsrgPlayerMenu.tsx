import { AppButton } from "components/Inputs/AppButton";
import { SongActionButton } from "components/Inputs/SongActionButton";
import MenuPanel from "components/Layout/MenuPanel";
import { SongMenu } from "components/Layout/SongMenu";
import { MenuItem } from "components/Miscellaneous/MenuItem";
import { SettingsPane } from "components/Settings/SettingsPane";
import { asyncConfirm } from "components/Utility/AsyncPrompts";
import { FloatingDropdownRow, FloatingDropdownText, FloatingDropdown } from "components/Utility/FloatingDropdown";
import { HelpTooltip } from "components/Utility/HelpTooltip";
import Memoized from "components/Utility/Memoized";
import { hasTooltip, Tooltip } from "components/Utility/Tooltip";
import isMobile from "is-mobile";
import Analytics from "lib/Analytics";
import { VsrgComposerSettingsDataType, VsrgPlayerSettingsDataType } from "lib/BaseSettings";
import { Folder } from "lib/Folder";
import useClickOutside from "lib/Hooks/useClickOutside";
import { useFolders } from "lib/Hooks/useFolders";
import { useSongs } from "lib/Hooks/useSongs";
import { useTheme } from "lib/Hooks/useTheme";
import { fileService } from "lib/Services/FileService";
import { songService } from "lib/Services/SongService";
import { RecordedSong } from "lib/Songs/RecordedSong";
import { SerializedSong } from "lib/Songs/Song";
import { VsrgSong } from "lib/Songs/VsrgSong";
import { VsrgSongSelectType } from "pages/VsrgPlayer";
import { memo, useCallback, useEffect, useState } from "react";
import { FaBars, FaCog, FaDownload, FaEllipsisH, FaFolder, FaHome, FaMusic, FaPen, FaTimes, FaTrash } from "react-icons/fa";
import { Link } from "react-router-dom";
import HomeStore from "stores/HomeStore";
import { songsStore } from "stores/SongsStore";
import { ThemeStore } from "stores/ThemeStore";
import { SettingUpdate } from "types/SettingsPropriety";

type MenuTabs = 'Songs' | 'Settings'

interface VsrgMenuProps {
    settings: VsrgPlayerSettingsDataType
    onSongSelect: (song: VsrgSong, type: VsrgSongSelectType) => void
    onSettingsUpdate: (update: SettingUpdate) => void
}



function VsrgMenu({ onSongSelect, settings, onSettingsUpdate }: VsrgMenuProps) {
    const [isOpen, setOpen] = useState(false)
    const [isVisible, setIsVisible] = useState(true)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Settings')
    const [folders] = useFolders()
    const [songs] = useSongs()
    const [theme] = useTheme()
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setOpen(false)
    }, { active: isOpen && isVisible, ignoreFocusable: true })


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

    const sideClass = (isOpen && isVisible) ? "side-menu menu-open" : "side-menu"
    return <>
        <div className="menu-wrapper" ref={menuRef}>
            <div
                className="hamburger-top"
                onClick={() => setIsVisible(!isVisible)}
            >
                <Memoized>
                    <FaBars />
                </Memoized>
            </div>
            <div className={`menu ${isVisible ? "menu-visible" : ""}`}>
                <MenuItem
                    onClick={() => {
                        setIsVisible(false)
                    }}
                    ariaLabel="Close Menu"
                >
                    <FaTimes className='icon' />
                </MenuItem>
                <MenuItem
                    style={{ marginTop: 'auto' }}
                    onClick={() => selectSideMenu("Songs")}
                    isActive={isOpen && selectedMenu === "Songs"}
                    ariaLabel='Song menu'
                >
                    <Memoized>
                        <FaMusic className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={() => selectSideMenu("Settings")} isActive={isOpen && selectedMenu === "Settings"} ariaLabel='Settings menu'>
                    <Memoized>
                        <FaCog className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={() => HomeStore.open()} ariaLabel='Open home menu'>
                    <Memoized>
                        <FaHome className="icon" />
                    </Memoized>
                </MenuItem>
            </div>
            <div className={sideClass}>

                <MenuPanel current={selectedMenu} id="Songs">
                    <div className="row">
                        <Link to='/VsrgComposer'>
                            <AppButton>
                                Create song
                            </AppButton>
                        </Link>

                    </div>
                    <SongMenu<SongRowProps>
                        songs={songs}
                        exclude={['composed', 'recorded']}
                        style={{ marginTop: '0.6rem' }}
                        SongComponent={SongRow}
                        componentProps={{
                            theme,
                            folders,
                            functions: {
                                setMenuVisible: setIsVisible,
                                onSongSelect
                            }
                        }}
                    />
                </MenuPanel>
                <MenuPanel current={selectedMenu} id="Settings">
                    <SettingsPane
                        settings={settings}
                        onUpdate={onSettingsUpdate}
                    />
                    <div className="row" style={{
                        marginTop: '0.6rem',
                        justifyContent: 'flex-end'
                    }}>
                        <Link to={'/Keybinds'}>
                            <AppButton>
                                Change keybinds
                            </AppButton>
                        </Link>
                    </div>

                </MenuPanel>
            </div>
        </div>
    </>
}
export default memo(VsrgMenu, (p, n) => {
    return p.settings === n.settings
})



interface SongRowProps {
    data: SerializedSong
    theme: ThemeStore
    folders: Folder[]
    functions: {
        onSongSelect: (song: VsrgSong, type: VsrgSongSelectType) => void
        setMenuVisible: (override: boolean) => void
    }
}

function SongRow({ data, functions, theme, folders }: SongRowProps) {
    const { setMenuVisible, onSongSelect } = functions
    const buttonStyle = { backgroundColor: theme.layer('primary', 0.15).hex() }
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    if (data.type !== 'vsrg') return <div className="row">
        Invalid song
    </div>
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={() => {
            if (isRenaming) return
            onSongSelect(songService.parseSong(data) as VsrgSong, 'play')
            setMenuVisible(false)
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
                    <FaPen style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text={isRenaming ? "Save" : "Rename"} />
                </FloatingDropdownRow>
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
                <FloatingDropdownRow onClick={() => {
                    fileService.downloadSong(data, data.name)
                }}>
                    <FaDownload style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Download' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={async () => {
                    const confirm = await asyncConfirm("Are you sure you want to delete this song?")
                    if (!confirm) return
                    songsStore.removeSong(data.id!)
                }}>
                    <FaTrash color="#ed4557" style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Delete' />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}