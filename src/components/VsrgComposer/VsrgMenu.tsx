import { AppButton } from "components/Inputs/AppButton";
import { SongActionButton } from "components/Inputs/SongActionButton";
import MenuPanel from "components/Layout/MenuPanel";
import { SongMenu } from "components/Layout/SongMenu";
import { MenuItem } from "components/Miscellaneous/MenuItem";
import { SettingsPane } from "components/Settings/SettingsPane";
import { asyncConfirm } from "components/Utility/AsyncPrompts";
import { FloatingDropdownRow, FloatingDropdownText, FloatingDropdown } from "components/Utility/FloatingDropdown";
import Memoized from "components/Utility/Memoized";
import { hasTooltip, Tooltip } from "components/Utility/Tooltip";
import isMobile from "is-mobile";
import Analytics from "lib/Analytics";
import { VsrgComposerSettingsDataType } from "lib/BaseSettings";
import { Folder } from "lib/Folder";
import useClickOutside from "lib/Hooks/useClickOutside";
import { useFolders } from "lib/Hooks/useFolders";
import { useSongs } from "lib/Hooks/useSongs";
import { useTheme } from "lib/Hooks/useTheme";
import { fileService } from "lib/Services/FileService";
import { songService } from "lib/Services/SongService";
import { SerializedSong } from "lib/Songs/Song";
import { VsrgSong } from "lib/Songs/VsrgSong";
import { memo, useCallback, useEffect, useState } from "react";
import { FaBars, FaCog, FaDownload, FaEllipsisH, FaFolder, FaHome, FaMusic, FaPen, FaRegCircle, FaSave, FaTimes, FaTrash } from "react-icons/fa";
import HomeStore from "stores/HomeStore";
import { songsStore } from "stores/SongsStore";
import { ThemeStoreClass } from "stores/ThemeStore";
import { SettingUpdate } from "types/SettingsPropriety";

type MenuTabs = 'Songs' | 'Settings'
const isOnMobile = isMobile()

interface VsrgMenuProps{
    settings: VsrgComposerSettingsDataType
    hasChanges: boolean
    handleSettingChange: (override: SettingUpdate) => void
    onSave: () => void
    onSongOpen: (song: VsrgSong) => void
    onCreateSong: () => void
}



function VsrgMenu({ onSave, onSongOpen, settings, handleSettingChange, hasChanges, onCreateSong}: VsrgMenuProps){
    const [isOpen, setOpen] = useState(false)
    const [isVisible, setVisible] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Settings')
    const [folders] = useFolders()
    const [songs] = useSongs()
    const [theme] = useTheme()
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setOpen(false)
        if (isOnMobile) setVisible(false)
    }, { active: isOpen, ignoreFocusable: true })

    const toggleMenu = useCallback((override?: boolean) => {
        if (typeof override !== "boolean") override = undefined
        const newState = override !== undefined ? override : !isOpen
        setOpen(newState)
        setVisible(newState)
    }, [isOpen])
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
    const menuClass = isVisible ? "menu menu-visible" : "menu"
    const sideClass = isOpen ? "side-menu menu-open" : "side-menu"
    const hasUnsaved = hasChanges ? "margin-top-auto not-saved" : "margin-top-auto"
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
                <MenuItem onClick={onSave} className={hasUnsaved} ariaLabel='Save'>
                    <Memoized>
                        <FaSave className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem   
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
                        <AppButton onClick={onCreateSong}>
                            Create song
                        </AppButton>
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
                </MenuPanel>
            </div>
        </div>
    </>
}
export default memo(VsrgMenu, (p, n) => {
    return p.settings === n.settings && p.hasChanges === n.hasChanges
})



interface SongRowProps {
    data: SerializedSong
    theme: ThemeStoreClass
    folders: Folder[]
    functions: {
        onClick: (song: VsrgSong) => void
        toggleMenu: (override?: boolean) => void
    }
}

function SongRow({ data, functions, theme, folders }: SongRowProps) {
    const { toggleMenu, onClick } = functions
    const buttonStyle = { backgroundColor: theme.layer('primary', 0.15).hex() }
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    if(data.type !== 'vsrg') return <div className="row">
        Invalid song
    </div>
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={() => {
            if (isRenaming) return
            onClick(songService.parseSong(data) as VsrgSong)
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
                <FloatingDropdownRow onClick={async() => {
                    const confirm = await asyncConfirm("Are you sure you want to delete this song?")
                    if(!confirm) return
                    songsStore.removeSong(data.id!)
                }}>
                    <FaTrash color="#ed4557" style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Delete' />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}

