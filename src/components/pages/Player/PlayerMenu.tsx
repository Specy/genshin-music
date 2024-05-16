import {useCallback, useEffect, useState} from 'react'
import {
    FaCog,
    FaCrosshairs,
    FaDiscord,
    FaDownload,
    FaEdit,
    FaEllipsisH,
    FaFolder,
    FaGithub,
    FaHome,
    FaMusic,
    FaPen,
    FaQuestion,
    FaRegCircle,
    FaSearch,
    FaTimes,
    FaTrash
} from 'react-icons/fa';
import {RiPlayListFill} from 'react-icons/ri'
import {APP_NAME} from "$config"
import {playerStore} from '$stores/PlayerStore'
import {ComposerShortcuts, HelpTab, PlayerShortcuts} from '$cmp/pages/Index/HelpTab'
import {MenuButton, MenuItem} from '$cmp/shared/Menu/MenuItem'
import {MenuPanel, MenuPanelWrapper} from '$cmp/shared/Menu/MenuPanel'
import DonateButton from '$cmp/shared/Miscellaneous/DonateButton'
import LibrarySearchedSong from '$cmp/shared/Miscellaneous/LibrarySearchedSong'
import {SongActionButton} from '$cmp/shared/Inputs/SongActionButton'
import Analytics from '$lib/Analytics';
import {homeStore} from '$stores/HomeStore';
import {logger} from '$stores/LoggerStore';
import {AppButton} from '$cmp/shared/Inputs/AppButton';
import {SongMenu} from '$cmp/shared/pagesLayout/SongMenu';
import Link from 'next/link'
import {RecordedSong, SerializedRecordedSong} from '$lib/Songs/RecordedSong';
import {ComposedSong, UnknownSerializedComposedSong} from '$lib/Songs/ComposedSong';
import {SettingUpdate, SettingVolumeUpdate} from '$types/SettingsPropriety';
import {PlayerSettingsDataType} from '$lib/BaseSettings';
import {useTheme} from '$lib/Hooks/useTheme';
import {SearchedSongType} from '$types/GeneralTypes';
import {FileElement, FilePicker} from '$cmp/shared/Inputs/FilePicker';
import {Theme} from '$stores/ThemeStore/ThemeProvider';
import {hasTooltip, Tooltip} from "$cmp/shared/Utility/Tooltip"
import {HelpTooltip} from '$cmp/shared/Utility/HelpTooltip';
import {FloatingDropdown, FloatingDropdownRow, FloatingDropdownText} from '$cmp/shared/Utility/FloatingDropdown';
import {Midi} from '@tonejs/midi';
import {asyncConfirm, asyncPrompt} from '$cmp/shared/Utility/AsyncPrompts';
import {SettingsPane} from '$cmp/shared/Settings/SettingsPane';
import {SerializedSong, SongStorable, SongType} from '$lib/Songs/Song';
import {songsStore} from '$stores/SongsStore';
import {Folder} from '$lib/Folder';
import {useFolders} from '$lib/Hooks/useFolders';
import {folderStore} from '$stores/FoldersStore';
import {useSongs} from '$lib/Hooks/useSongs';
import useClickOutside from '$lib/Hooks/useClickOutside';
import {fileService} from '$lib/Services/FileService';
import {songService} from '$lib/Services/SongService';
import {RecordedOrComposed} from '$types/SongTypes';
import {_folderService} from '$lib/Services/FolderService';
import {settingsService} from '$lib/Services/SettingsService';
import {useConfig} from '$lib/Hooks/useConfig';
import {createShortcutListener} from '$stores/KeybindsStore';
import sh from '$cmp/pages/Index/HelpTab/HelpTab.module.css'
import {isAudioFormat, isMidiFormat, isVideoFormat} from '$lib/utils/Utilities';
import {useRouter} from 'next/router';
import {MenuContextProvider, MenuSidebar} from "$cmp/shared/Menu/MenuContent";
import {useTranslation} from "react-i18next";
import {Separator} from "$cmp/shared/separator/Separator";
import {DefaultLanguageSelector} from "$cmp/shared/i18n/LanguageSelector";

interface MenuProps {
    functions: {
        addSong: (song: RecordedSong | ComposedSong) => void
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string) => void
        handleSettingChange: (override: SettingUpdate) => void
        changeVolume: (override: SettingVolumeUpdate) => void
    }
    data: {
        settings: PlayerSettingsDataType
    }
    inPreview?: boolean
}

export type MenuTabs = 'Help' | 'Library' | 'Songs' | 'Settings' | 'Home'
const excludedSongs: SongType[] = ['vsrg']

function Menu({functions, data, inPreview}: MenuProps) {
    const {t} = useTranslation(['player', 'question', 'confirm', 'settings', 'menu', 'common', 'logs', 'tutorials'])
    const router = useRouter()
    const [songs] = useSongs()
    const [isOpen, setOpen] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Songs')
    const [searchInput, setSearchInput] = useState('')
    const [searchedSongs, setSearchedSongs] = useState<SearchedSongType[]>([])
    const [searchStatus, setSearchStatus] = useState('')
    const {IS_MIDI_AVAILABLE} = useConfig()
    const [isPersistentStorage, setPeristentStorage] = useState(false)
    const [theme] = useTheme()
    const [folders] = useFolders()
    const {handleSettingChange, addSong, removeSong, renameSong} = functions
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setOpen(false)
    }, {active: isOpen, ignoreFocusable: true})

    useEffect(() => {
        async function checkStorage() {
            if (navigator.storage && navigator.storage.persist) {
                let isPersisted = await navigator.storage.persisted()
                if (!isPersisted) isPersisted = await navigator.storage.persist()
                setPeristentStorage(isPersisted)
            }
        }

        checkStorage()
        return createShortcutListener("player", "player_menu", ({shortcut}) => {
            const {name} = shortcut
            if (name === "close_menu") setOpen(false)
            if (name === "toggle_menu") setOpen((prev) => !prev)
        })
    }, [])

    function clearSearch() {
        setSearchInput('')
        setSearchStatus('')
        setSearchedSongs([])
    }

    const searchSongs = async () => {
        if (searchStatus === "Searching...") return
        if (searchInput.trim().length === 0) {
            return setSearchStatus(t('logs:no_empty_name'))
        }
        setSearchStatus('Searching...')
        const fetchedSongs = await fetch('https://sky-music.herokuapp.com/api/songs?search=' + encodeURI(searchInput))
            .then(data => data.json()) as any
        if (fetchedSongs.error) {
            setSearchStatus(t('logs:no_empty_name'))
            return logger.error(fetchedSongs.error)

        }
        setSearchStatus('success')
        setSearchedSongs(fetchedSongs as SearchedSongType[])
        Analytics.songSearch({name: searchInput})
    }
    const toggleMenu = (override?: boolean | null) => {
        if (typeof override !== "boolean") override = null
        const newState = override !== null ? override : !isOpen
        setOpen(newState)
    }
    const importSong = async (files: FileElement<SerializedSong[] | SerializedSong>[]) => {
        for (const file of files) {
            try {
                const songs = (Array.isArray(file.data) ? file.data : [file.data]) as SerializedSong[]
                await fileService.importAndLog(songs)
            } catch (e) {
                console.error(e)
                logger.error(t("logs:error_importing_file_generic"), 8000)
            }
        }
    }
    const downloadSong = async (song: ComposedSong | RecordedSong | Midi) => {
        if (song instanceof Midi) {
            const agrees = await asyncConfirm(t('menu:midi_download_warning'))
            if (!agrees) return
            return fileService.downloadMidi(song)
        }
        const songName = song.name
        const converted = [APP_NAME === 'Sky' ? song.toOldFormat() : song.serialize()]
        fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`)
        logger.success(t('logs:song_downloaded'))
        Analytics.userSongs('download', {page: 'player'})
    }
    const createFolder = useCallback(async () => {
        const name = await asyncPrompt(t('question:enter_folder_name'))
        if (!name) return
        folderStore.createFolder(name)
    }, [t])

    const askForComposerImport = useCallback(async (file: File) => {
        const fileName = file.name || "unknown"
        if (isAudioFormat(fileName) || isVideoFormat(fileName) || isMidiFormat(fileName)) {
            const confirm = await asyncConfirm(t('midi_or_audio_import_redirect_warning'))
            if (confirm) {
                router.push('/composer?showMidi=true')
            }
        }
    }, [router, t])
    const JSONImportError = useCallback(async (error?: any, files?: File[]) => {
        if (error) console.error(error)
        if (files) {
            const first = files[0]
            if (first) return askForComposerImport(first)
            else return logger.error(t('logs:error_importing_invalid_format'), 8000)
        } else {
            logger.error(t('logs:error_importing_invalid_format'), 8000)
        }

    }, [askForComposerImport, t])

    async function downloadAllSongs() {
        try {
            const songs = await songService.getSongs();
            const toDownload = songs.map(song => {
                if (APP_NAME === 'Sky') {
                    if (song.type === 'composed') return ComposedSong.deserialize(song as UnknownSerializedComposedSong).toOldFormat()
                    if (song.type === 'recorded') return RecordedSong.deserialize(song as SerializedRecordedSong).toOldFormat()
                }
                return song
            })
            const date = new Date().toISOString().split('T')[0]
            const folders = await _folderService.getFolders()
            const files = [...folders, ...toDownload]
            if (files.length === 0) return logger.warn(t('logs:no_songs_to_backup'))
            fileService.downloadFiles(files, `${APP_NAME}_Backup_${date}.${APP_NAME.toLowerCase()}backup`)
            logger.success(t('logs:song_backup_downloaded'))
            settingsService.setLastBackupWarningTime(Date.now())
        } catch (e) {
            console.error(e)
            logger.error(t('logs:error_downloading_songs'))
        }
    }

    const layer1Color = theme.layer('menu_background', 0.35).lighten(0.2)
    const layer2Color = theme.layer('menu_background', 0.32).desaturate(0.4)
    const layer1ColorText = theme.getTextColorFromBackground(layer1Color)
    const layer2ColorText = theme.getTextColorFromBackground(layer2Color)

    return <MenuContextProvider
        style={inPreview ? {position: "absolute"} : {}}
        current={selectedMenu}
        setCurrent={setSelectedMenu}
        open={isOpen}
        setOpen={setOpen}
        visible={true}
        ref={menuRef}
    >
        <MenuSidebar opacity={'0.9'}>
            {isOpen &&
                <MenuButton onClick={toggleMenu} className='close-menu' ariaLabel={t('menu:close_menu')}>
                    <FaTimes className="icon"/>
                </MenuButton>
            }
            <MenuItem id={'Help'} style={{marginTop: 'auto'}} ariaLabel={t('menu:open_info_menu')}>
                <FaQuestion className="icon"/>
            </MenuItem>
            <MenuItem id={'Library'} ariaLabel={t('menu:open_library_menu')}>
                <RiPlayListFill className='icon'/>
            </MenuItem>
            <MenuItem id={'Songs'} ariaLabel={t('menu:open_songs_menu')}>
                <FaMusic className="icon"/>
            </MenuItem>
            <MenuItem id={'Settings'} ariaLabel={t('menu:open_settings_menu')}>
                <FaCog className="icon"/>
            </MenuItem>
            <MenuButton
                onClick={homeStore.open}
                ariaLabel={t('menu:open_home_menu')}
                style={{border: "solid 0.1rem var(--secondary)"}}
            >
                <FaHome className="icon"/>
            </MenuButton>
        </MenuSidebar>
        <MenuPanelWrapper style={inPreview ? {position: 'absolute'} : {}}>
            <MenuPanel title="No selection" id='No selection'>
                {t('menu:select_menu')}
            </MenuPanel>
            <MenuPanel id='Songs'>
                <div className="songs-buttons-wrapper">
                    <HelpTooltip>
                        <ul>
                            <li>{t('tutorials:player.li_1')}</li>
                            <li>{t('tutorials:player.li_2')}</li>
                            <li>{t('tutorials:player.li_3')}</li>
                            <li><FaCrosshairs style={{marginRight: '0.2rem'}}/>: {t('tutorials:player.li_4')}</li>
                            <li><FaRegCircle style={{marginRight: '0.2rem'}}/>: {t('tutorials:player.li_5')}</li>
                            {IS_MIDI_AVAILABLE &&
                                <li>{t('tutorials:player.li_6')}</li>
                            }
                        </ul>
                    </HelpTooltip>
                    <Link href='/composer' style={{marginLeft: 'auto'}}>
                        <AppButton>
                            {t('menu:compose_song')}
                        </AppButton>
                    </Link>
                    <FilePicker<SerializedSong | SerializedSong[]>
                        onPick={importSong}
                        onError={JSONImportError}
                        as='json'
                        multiple={true}
                    >
                        <AppButton>
                            {t('menu:import_song_sheet')}
                        </AppButton>
                    </FilePicker>

                </div>
                <SongMenu<SongRowProps>
                    songs={songs}
                    exclude={excludedSongs}
                    onCreateFolder={createFolder}
                    style={{marginTop: '0.6rem'}}
                    SongComponent={SongRow}
                    componentProps={{
                        theme,
                        folders,
                        functions: {removeSong, toggleMenu, downloadSong, renameSong}
                    }}
                />
                <div style={{
                    marginTop: "auto",
                    paddingTop: '0.5rem',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <AppButton
                        style={{marginLeft: 'auto'}}
                        onClick={downloadAllSongs}

                    >
                        {t('menu:download_all_songs_backup')}
                    </AppButton>
                </div>
            </MenuPanel>

            <MenuPanel id='Settings'>
                <SettingsPane
                    settings={data.settings}
                    changeVolume={functions.changeVolume}
                    onUpdate={handleSettingChange}
                />
                <Separator background={'var(--secondary)'} height={'0.1rem'} verticalMargin={'0.5rem'}/>
                <div className='settings-row-wrap'>
                    {t('settings:select_language')} <DefaultLanguageSelector/>
                </div>
                <div className='settings-row-wrap'>
                    {IS_MIDI_AVAILABLE &&
                        <Link href='/keybinds'>
                            <AppButton style={{width: 'fit-content'}}>
                                {t('menu:connect_midi_keyboard')}
                            </AppButton>
                        </Link>
                    }
                    <Link href='/theme'>
                        <AppButton style={{width: 'fit-content'}}>
                            {t('menu:change_app_theme')}
                        </AppButton>
                    </Link>
                </div>
                <div style={{marginTop: '0.4rem', marginBottom: '0.6rem'}} className={hasTooltip(true)}>
                    {isPersistentStorage ? t('settings:memory_persisted') : t('settings:memory_not_persisted')}
                    {isPersistentStorage
                        ? <Tooltip position='top' style={{maxWidth: 'unset'}}>
                            {t('settings:memory_persisted_description')}

                        </Tooltip>
                        : <Tooltip position='top'>
                            {t('settings:memory_not_persisted_description')}
                        </Tooltip>
                    }

                </div>
                <DonateButton/>
            </MenuPanel>

            <MenuPanel title="Library" id='Library'>
                <div>
                    {t('song_search_description')}
                </div>
                <div className='library-search-row'>
                    <input
                        className='library-search-input'
                        style={{backgroundColor: layer1Color.toString(), color: layer1ColorText.toString()}}
                        placeholder='Song name'
                        onKeyDown={(e) => {
                            //TODO make this a form
                            if (e.code === "Enter") searchSongs()
                        }}
                        onInput={(e: any) => setSearchInput(e.target.value)}
                        value={searchInput}
                    />
                    <button
                        className='library-search-btn'
                        onClick={clearSearch}
                        style={{backgroundColor: layer1Color.toString(), color: layer1ColorText.toString()}}
                    >
                        <FaTimes/>
                    </button>
                    <button
                        className='library-search-btn'
                        onClick={searchSongs}
                        style={{backgroundColor: layer1Color.toString(), color: layer1ColorText.toString()}}
                    >
                        <FaSearch/>
                    </button>
                </div>
                {(searchStatus || searchedSongs.length > 0) &&
                    <div
                        className='library-search-songs-wrapper'
                        style={{
                            backgroundColor: layer2Color.toString(),
                            color: layer2ColorText.toString(),
                            marginBottom: "0.5rem"
                        }}
                    >
                        {searchStatus === "success" ?
                            searchedSongs.length > 0
                                ? searchedSongs.map(song =>
                                    <LibrarySearchedSong
                                        theme={theme}
                                        key={song.file}
                                        data={song}
                                        importSong={addSong}
                                        onClick={playerStore.play}
                                    />
                                )
                                : <div className='library-search-result-text'>
                                    {t('song_search_no_results')}
                                </div>
                            : <div className='library-search-result-text'>
                                {searchStatus}
                            </div>
                        }
                    </div>
                }
                <DonateButton style={{marginTop: "auto"}}/>

            </MenuPanel>
            <MenuPanel title={t('common:help')} id='Help'>
                <div className={sh['help-icon-wrapper']}>
                    <a href='https://discord.gg/Arsf65YYHq' target={"_blank"}>
                        <FaDiscord className={sh['help-icon']}/>
                    </a>
                    <a href='https://github.com/Specy/genshin-music' target={"_blank"}>
                        <FaGithub className={sh['help-icon']}/>
                    </a>
                </div>
                <HelpTab/>
                <PlayerShortcuts/>
                <ComposerShortcuts/>
                <DonateButton style={{marginTop: "0.5rem"}}/>
            </MenuPanel>
        </MenuPanelWrapper>
    </MenuContextProvider>
}


interface SongRowProps {
    data: SongStorable
    theme: Theme
    folders: Folder[]
    functions: {
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string,) => void
        toggleMenu: (override?: boolean) => void
        downloadSong: (song: RecordedSong | ComposedSong | Midi) => void
    }
}

function SongRow({data, functions, theme, folders}: SongRowProps) {
    const {t} = useTranslation(['player', 'common', 'menu', 'logs', 'settings'])
    const {removeSong, toggleMenu, downloadSong, renameSong} = functions
    const buttonStyle = {backgroundColor: theme.layer('primary', 0.15).toString()}
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    if (data.type === 'vsrg') return <div className='row'>
        {t('menu:invalid_song')}
    </div>
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={async () => {
            if (isRenaming) return
            playerStore.play(await songService.fromStorableSong(data) as RecordedOrComposed, 0)
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
                {isRenaming ? t('menu:song_name') : t('menu:play_song')}
            </Tooltip>
        </div>
        <div className="song-buttons-wrapper">
            <SongActionButton
                onClick={async () => {
                    const parsed = await songService.fromStorableSong(data) as RecordedOrComposed
                    playerStore.practice(parsed, 0, parsed.notes.length)
                    toggleMenu(false)
                }}
                ariaLabel={t('practice_mode_description', {song_name: data.name})}
                tooltip={t('practice_mode')}
                style={buttonStyle}
            >
                <FaCrosshairs/>
            </SongActionButton>

            <SongActionButton
                onClick={async () => {
                    const parsed = await songService.fromStorableSong(data) as RecordedOrComposed
                    playerStore.approaching(parsed, 0, parsed.notes.length)
                    toggleMenu(false)
                }}
                tooltip={t('approach_mode')}
                ariaLabel={t("approach_mode_description", {song_name: data.name})}
                style={buttonStyle}
            >
                <FaRegCircle/>
            </SongActionButton>
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
                            renameSong(songName, data.id!)
                            setIsRenaming(false)
                        }
                        setIsRenaming(!isRenaming)
                    }}
                >
                    <FaPen style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text={isRenaming ? t('common:save') : t('common:rename')}/>
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
                            {t('common:none')}
                        </option>
                        {folders.map(folder =>
                            <option key={folder.id} value={folder.id!}>{folder.name}</option>
                        )}
                    </select>
                </FloatingDropdownRow>
                <Link
                    href={{
                        pathname: "/composer",
                        query: {
                            songId: data.id,
                        }
                    }}
                    style={{width: '100%'}}
                >
                    <FloatingDropdownRow
                        style={{width: '100%'}}
                        onClick={() => {
                            if (data?.type === 'recorded') logger.warn(t('logs:converting_recorded_to_composed_warning'), 5000)
                        }}
                    >
                        <FaEdit style={{marginRight: "0.4rem"}} size={14}/>
                        <FloatingDropdownText text={t('common:edit_song')}/>
                    </FloatingDropdownRow>
                </Link>
                <FloatingDropdownRow onClick={async () => {
                    const song = await songService.fromStorableSong(data) as RecordedOrComposed
                    downloadSong(song)
                }}>
                    <FaDownload style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text={t('common:download')}/>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={async () => {
                    const song = await songService.fromStorableSong(data) as RecordedOrComposed
                    downloadSong(song.toMidi())
                }}>
                    <FaDownload style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text={t('common:download_midi')}/>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => removeSong(data.name, data.id!)}>
                    <FaTrash color="#ed4557" style={{marginRight: "0.4rem"}} size={14}/>
                    <FloatingDropdownText text={t('common:delete')}/>
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}


export default Menu