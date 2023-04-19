import { AppButton } from "$cmp/Inputs/AppButton";
import MenuPanel from "$cmp/Layout/MenuPanel";
import { SongMenu } from "$cmp/Layout/SongMenu";
import { MenuItem } from "$cmp/Miscellaneous/MenuItem";
import { SettingsPane } from "$cmp/Settings/SettingsPane";
import { asyncConfirm } from "$cmp/Utility/AsyncPrompts";
import { FloatingDropdownRow, FloatingDropdownText, FloatingDropdown } from "$cmp/Utility/FloatingDropdown";
import Memoized from "$cmp/Utility/Memoized";
import { hasTooltip, Tooltip } from "$cmp/Utility/Tooltip";
import Analytics from "$lib/Stats";
import { VsrgPlayerSettingsDataType } from "$lib/BaseSettings";
import { Folder } from "$lib/Folder";
import useClickOutside from "$lib/Hooks/useClickOutside";
import { useFolders } from "$lib/Hooks/useFolders";
import { useSongs } from "$lib/Hooks/useSongs";
import { useTheme } from "$lib/Hooks/useTheme";
import { fileService } from "$lib/Services/FileService";
import { songService } from "$lib/Services/SongService";
import { SongStorable } from "$lib/Songs/Song";
import { VsrgSong } from "$lib/Songs/VsrgSong";
import { VsrgSongSelectType } from "$/pages/vsrg-player";
import { memo, useCallback, useEffect, useState } from "react";
import { FaBars, FaCog, FaDownload, FaEllipsisH, FaFolder, FaHome, FaMusic, FaPen, FaTimes, FaTrash } from "react-icons/fa";
import Link from "next/link";
import {homeStore} from "$stores/HomeStore";
import { songsStore } from "$stores/SongsStore";
import { Theme } from "$stores/ThemeStore/ThemeProvider";
import { SettingUpdate } from "$types/SettingsPropriety";
import { logger } from "$stores/LoggerStore";
import isMobile from "is-mobile";
import { useDefaultConfig } from "$lib/Hooks/useConfig";

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
    const { IS_MOBILE } = useDefaultConfig()
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        if(isMobile()) return setIsVisible(false)
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
                <MenuItem onClick={() => homeStore.open()} ariaLabel='Open home menu'>
                    <Memoized>
                        <FaHome className="icon" />
                    </Memoized>
                </MenuItem>
            </div>
            <div className={sideClass}>

                <MenuPanel current={selectedMenu} id="Songs">
                    <div className="row">
                        <Link href='vsrg-composer'>
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
                        {!IS_MOBILE &&
                            <Link href='keybinds'>
                                <AppButton>
                                    Change keybinds
                                </AppButton>
                            </Link>
                        }
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
    data: SongStorable
    theme: Theme
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
        <div className={`song-name ${hasTooltip(true)}`} onClick={async () => {
            if (isRenaming) return
            const song = await songService.fromStorableSong(data)
            if(!song) return logger.error("Could not find song")
            onSongSelect(song as VsrgSong, 'play')
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
                        onChange={async (e) => {
                            const id = e.target.value
                            const song = await songService.getOneSerializedFromStorable(data)
                            if(!song) return logger.error("Could not find song")
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
                    if(!song) return logger.error("Could not find song")
                    fileService.downloadSong(song, data.name)
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