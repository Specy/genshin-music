import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {MenuPanel, MenuPanelWrapper} from "$cmp/shared/Menu/MenuPanel";
import {SongMenu} from "$cmp/shared/pagesLayout/SongMenu";
import {MenuButton, MenuItem} from "$cmp/shared/Menu/MenuItem";
import {SettingsPane} from "$cmp/shared/Settings/SettingsPane";
import {asyncConfirm} from "$cmp/shared/Utility/AsyncPrompts";
import {FloatingDropdown, FloatingDropdownRow, FloatingDropdownText} from "$cmp/shared/Utility/FloatingDropdown";
import {MemoizedIcon} from "$cmp/shared/Utility/Memoized";
import {hasTooltip, Tooltip} from "$cmp/shared/Utility/Tooltip";
import {VsrgPlayerSettingsDataType} from "$lib/BaseSettings";
import {Folder} from "$lib/Folder";
import useClickOutside from "$lib/Hooks/useClickOutside";
import {useFolders} from "$lib/Hooks/useFolders";
import {useSongs} from "$lib/Hooks/useSongs";
import {useTheme} from "$lib/Hooks/useTheme";
import {fileService} from "$lib/Services/FileService";
import {songService} from "$lib/Services/SongService";
import {SongStorable} from "$lib/Songs/Song";
import {VsrgSong} from "$lib/Songs/VsrgSong";
import {VsrgSongSelectType} from "$pages/vsrg-player";
import {memo, useEffect, useState} from "react";
import {
    FaBars,
    FaCog,
    FaDownload,
    FaEllipsisH,
    FaFolder,
    FaHome,
    FaMusic,
    FaPen,
    FaTimes,
    FaTrash
} from "react-icons/fa";
import Link from "next/link";
import {songsStore} from "$stores/SongsStore";
import {Theme} from "$stores/ThemeStore/ThemeProvider";
import {SettingUpdate} from "$types/SettingsPropriety";
import {logger} from "$stores/LoggerStore";
import {useConfig} from "$lib/Hooks/useConfig";
import {APP_NAME} from "$config";
import {MenuContextProvider, MenuSidebar} from "$cmp/shared/Menu/MenuContent";
import {homeStore} from "$stores/HomeStore";
import {useTranslation} from "react-i18next";
import {i18n} from "$i18n/i18n";
import {AppLink} from "$cmp/shared/link/AppLink";
import {Separator} from "$cmp/shared/separator/Separator";

type MenuTabs = 'Songs' | 'Settings'

interface VsrgMenuProps {
    settings: VsrgPlayerSettingsDataType
    onSongSelect: (song: VsrgSong, type: VsrgSongSelectType) => void
    onSettingsUpdate: (update: SettingUpdate) => void
}


function VsrgMenu({onSongSelect, settings, onSettingsUpdate}: VsrgMenuProps) {
    const {t} = useTranslation(['menu', 'common', 'settings'])
    const [isOpen, setOpen] = useState(false)
    const [isVisible, setIsVisible] = useState(true)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Settings')
    const [folders] = useFolders()
    const [songs] = useSongs()
    const [theme] = useTheme()
    const {IS_MOBILE} = useConfig()
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setIsVisible(false)
    }, {active: isOpen && isVisible, ignoreFocusable: true})
    return <>
        <MenuContextProvider
            ref={menuRef}
            current={selectedMenu}
            setCurrent={setSelectedMenu}
            open={isOpen}
            setOpen={setOpen}
            visible={isVisible}
        >
            <div
                className="hamburger-top"
                onClick={() => setIsVisible(true)}
            >
                <MemoizedIcon icon={FaBars}/>
            </div>
            <MenuSidebar>
                <MenuButton
                    onClick={() => {
                        setIsVisible(false)
                    }}
                    ariaLabel={t('close_menu')}
                >
                    <MemoizedIcon icon={FaTimes} className={'icon'}/>
                </MenuButton>
                <MenuItem
                    style={{marginTop: 'auto'}}
                    id={'Songs'}
                    ariaLabel={t('song_menu')}
                >
                    <MemoizedIcon icon={FaMusic} className={'icon'}/>
                </MenuItem>

                <MenuItem id={'Settings'} ariaLabel={t('settings_menu')}>
                    <MemoizedIcon icon={FaCog} className={'icon'}/>
                </MenuItem>
                <MenuButton
                    onClick={homeStore.open}
                    ariaLabel={t('open_home_menu')}
                    style={{border: "solid 0.1rem var(--secondary)"}}
                >
                    <MemoizedIcon icon={FaHome} className={'icon'}/>
                </MenuButton>
            </MenuSidebar>
            <MenuPanelWrapper>
                <MenuPanel id="Songs">
                    <div className="row">
                        <Link href='/vsrg-composer'>
                            <AppButton>
                                {t('common:create_song')}
                            </AppButton>
                        </Link>

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
                                setMenuVisible: setIsVisible,
                                onSongSelect
                            }
                        }}
                    />
                </MenuPanel>
                <MenuPanel id="Settings">
                    <SettingsPane
                        settings={settings}
                        onUpdate={onSettingsUpdate}
                    />
                    {!IS_MOBILE && <>
                        <Separator background={'var(--secondary)'} height={'0.1rem'} verticalMargin={'0.5rem'}/>
                        <AppLink href={'/keybinds'} style={{marginLeft: 'auto'}}>
                            <AppButton>
                                {t('settings:change_keybinds')}
                            </AppButton>
                        </AppLink>
                    </>
                    }
                </MenuPanel>
            </MenuPanelWrapper>
        </MenuContextProvider>
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

function SongRow({data, functions, theme, folders}: SongRowProps) {
    const {t} = useTranslation(['common', 'logs', 'settings', 'menu', 'confirm'])
    const {setMenuVisible, onSongSelect} = functions
    const buttonStyle = {backgroundColor: theme.layer('primary', 0.15).toString()}
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    if (data.type !== 'vsrg') return <div className="row">
        {t('menu:invalid_song')}
    </div>
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={async () => {
            if (isRenaming) return
            const song = await songService.fromStorableSong(data)
            if (!song) return logger.error(i18n.t('logs:could_not_find_song'))
            onSongSelect(song as VsrgSong, 'play')
            setMenuVisible(false)
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
                {isRenaming ? t('menu:song_name') : t('menu:play_song')}
            </Tooltip>
        </div>
        <div className="song-buttons-wrapper">
            <FloatingDropdown
                Icon={FaEllipsisH}
                style={buttonStyle}
                ignoreClickOutside={isRenaming}
                tooltip={t('settings:more_options')}
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
                    <FloatingDropdownText text={isRenaming ? t("common:save") : t('common:rename')}/>
                </FloatingDropdownRow>
                <FloatingDropdownRow style={{padding: '0 0.4rem'}}>
                    <FaFolder style={{marginRight: "0.4rem"}}/>
                    <select className='dropdown-select'
                            value={data.folderId || "_None"}
                            onChange={async (e) => {
                                const id = e.target.value
                                const song = await songService.getOneSerializedFromStorable(data)
                                if (!song) return logger.error(t('logs:could_not_find_song'))
                                songsStore.addSongToFolder(song, id !== "_None" ? id : null)
                            }}
                    >
                        <option value={"_None"}>
                            {i18n.t("common:none")}
                        </option>
                        {folders.map(folder =>
                            <option key={folder.id} value={folder.id!}>{folder.name}</option>
                        )}
                    </select>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={async () => {
                    const song = await songService.getOneSerializedFromStorable(data)
                    if (!song) return logger.error(t('logs:could_not_find_song'))
                    fileService.downloadSong(song, `${data.name}.${APP_NAME.toLowerCase()}sheet`)
                }}>
                    <FaDownload style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text={t("common:download")}/>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={async () => {
                    const confirm = await asyncConfirm(t('confirm:delete_song', {song_name: data.name}))
                    if (!confirm) return
                    songsStore.removeSong(data.id!)
                }}>
                    <FaTrash color="#ed4557" style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text={t('common:delete')}/>
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}