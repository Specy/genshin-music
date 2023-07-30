import { useCallback, useEffect, useState } from 'react'
import { FaMusic, FaTimes, FaCog, FaTrash, FaCrosshairs, FaDownload, FaInfo, FaSearch, FaHome, FaPen, FaEllipsisH, FaRegCircle, FaFolder, FaEdit } from 'react-icons/fa';
import { FaDiscord, FaGithub } from 'react-icons/fa';
import { RiPlayListFill } from 'react-icons/ri'
import { APP_NAME } from "$config"
import { playerStore } from '$stores/PlayerStore'
import { HelpTab } from '$cmp/HelpTab'
import { MenuItem } from '$cmp/Miscellaneous/MenuItem'
import MenuPanel from '$cmp/Layout/MenuPanel'
import DonateButton from '$cmp/Miscellaneous/DonateButton'
import LibrarySearchedSong from '$cmp/Miscellaneous/LibrarySearchedSong'
import { SongActionButton } from '$cmp/Inputs/SongActionButton'
import Analytics from '$lib/Stats';
import { homeStore } from '$stores/HomeStore';
import { logger } from '$stores/LoggerStore';
import { AppButton } from '$cmp/Inputs/AppButton';
import { SongMenu } from '$cmp/Layout/SongMenu';
import Link from 'next/link'
import { SerializedRecordedSong, RecordedSong } from '$lib/Songs/RecordedSong';
import { ComposedSong, UnknownSerializedComposedSong } from '$lib/Songs/ComposedSong';
import { SettingUpdate, SettingVolumeUpdate } from '$types/SettingsPropriety';
import { PlayerSettingsDataType } from '$lib/BaseSettings';
import { useTheme } from '$lib/Hooks/useTheme';
import { SearchedSongType } from '$types/GeneralTypes';
import { FileElement, FilePicker } from '$cmp/Inputs/FilePicker';
import { Theme } from '$stores/ThemeStore/ThemeProvider';
import { hasTooltip, Tooltip } from "$cmp/Utility/Tooltip"
import { HelpTooltip } from '$cmp/Utility/HelpTooltip';
import { FloatingDropdown, FloatingDropdownRow, FloatingDropdownText } from '$cmp/Utility/FloatingDropdown';
import { Midi } from '@tonejs/midi';
import { asyncConfirm, asyncPrompt } from '$cmp/Utility/AsyncPrompts';
import { SettingsPane } from '$cmp/Settings/SettingsPane';
import { SerializedSong, SongStorable, SongType } from '$lib/Songs/Song';
import { songsStore } from '$stores/SongsStore';
import { Folder } from '$lib/Folder';
import { useFolders } from '$lib/Hooks/useFolders';
import { folderStore } from '$stores/FoldersStore';
import { useSongs } from '$lib/Hooks/useSongs';
import useClickOutside from '$lib/Hooks/useClickOutside';
import { fileService } from '$lib/Services/FileService';
import { songService } from '$lib/Services/SongService';
import { RecordedOrComposed } from '$types/SongTypes';
import { _folderService } from '$lib/Services/FolderService';
import { settingsService } from '$lib/Services/SettingsService';
import { useConfig } from '$lib/Hooks/useConfig';
import { createShortcutListener } from '$stores/KeybindsStore';
import sh from '$cmp/HelpTab/HelpTab.module.css'
import { isAudioFormat, isMidiFormat, isVideoFormat } from '$lib/Utilities';
import { useRouter } from 'next/router';
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

function Menu({ functions, data, inPreview }: MenuProps) {
    const router = useRouter()
    const [songs] = useSongs()
    const [isOpen, setOpen] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Songs')
    const [searchInput, setSearchInput] = useState('')
    const [searchedSongs, setSearchedSongs] = useState<SearchedSongType[]>([])
    const [searchStatus, setSearchStatus] = useState('')
    const { IS_MIDI_AVAILABLE } = useConfig()
    const [isPersistentStorage, setPeristentStorage] = useState(false)
    const [theme] = useTheme()
    const [folders] = useFolders()
    const { handleSettingChange, addSong, removeSong, renameSong } = functions
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setOpen(false)
    }, { active: isOpen, ignoreFocusable: true })

    useEffect(() => {
        async function checkStorage() {
            if (navigator.storage && navigator.storage.persist) {
                let isPersisted = await navigator.storage.persisted()
                if (!isPersisted) isPersisted = await navigator.storage.persist()
                setPeristentStorage(isPersisted)
            }
        }
        checkStorage()
        return createShortcutListener("player", "player_menu", ({ shortcut }) => {
            const { name } = shortcut
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
            return setSearchStatus('Please write a non empty name')
        }
        setSearchStatus('Searching...')
        const fetchedSongs = await fetch('https://sky-music.herokuapp.com/api/songs?search=' + encodeURI(searchInput))
            .then(data => data.json()) as any
        if (fetchedSongs.error) {
            setSearchStatus('Please write a non empty name')
            return logger.error(fetchedSongs.error)

        }
        setSearchStatus('success')
        setSearchedSongs(fetchedSongs as SearchedSongType[])
        Analytics.songSearch({ name: searchInput })
    }
    const toggleMenu = (override?: boolean | null) => {
        if (typeof override !== "boolean") override = null
        const newState = override !== null ? override : !isOpen
        setOpen(newState)
    }
    const selectSideMenu = (selection?: MenuTabs) => {
        if (selection === selectedMenu && isOpen) {
            return setOpen(false)
        }
        clearSearch()
        if (selection) setSelectedMenu(selection)
        setOpen(true)
        Analytics.UIEvent('menu', { tab: selection })
    }
    const importSong = async (files: FileElement<SerializedSong[] | SerializedSong>[]) => {
        for (const file of files) {
            try {
                const songs = (Array.isArray(file.data) ? file.data : [file.data]) as SerializedSong[]
                await fileService.importAndLog(songs)
            } catch (e) {
                console.error(e)
                logger.error("Error importing file", 8000)
            }
        }
    }
    const downloadSong = async (song: ComposedSong | RecordedSong | Midi) => {
        if (song instanceof Midi) {
            const agrees = await asyncConfirm(
                `If you use MIDI, the song will loose some accuracy, if you want to share the song with others, use the other format (button above). Do you still want to download?`
            )
            if (!agrees) return
            return fileService.downloadMidi(song)
        }
        const songName = song.name
        const converted = [APP_NAME === 'Sky' ? song.toOldFormat() : song.serialize()]
        fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`)
        logger.success("Song downloaded")
        Analytics.userSongs('download', { page: 'player' })
    }
    const createFolder = useCallback(async () => {
        const name = await asyncPrompt("Write the folder name")
        if (!name) return
        folderStore.createFolder(name)
    }, [])

    const askForComposerImport = useCallback(async (file: File) => {
        const fileName = file.name || "unknown"
        if (isAudioFormat(fileName) || isVideoFormat(fileName) || isMidiFormat(fileName)) {
            const confirm = await asyncConfirm("You cannot directly import this file format. MIDI, Video and Audio files need to be converted in the composer, do you want to open it?")
            if (confirm) {
                router.push('/composer?showMidi=true')
            }
        }
    }, [router])
    const JSONImportError = useCallback(async (error?: any, files?: File[]) => {
        if (error) console.error(error)
        if (files) {
            const first = files[0]
            if (first) return askForComposerImport(first)
            else return logger.error("Error importing file, invalid format", 8000)
        } else {
            logger.error(`Error importing file, invalid format`, 8000)
        }

    }, [askForComposerImport])
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
            if (files.length === 0) return logger.warn("There are no songs to backup")
            fileService.downloadFiles(files, `${APP_NAME}_Backup_${date}.${APP_NAME.toLowerCase()}backup`)
            logger.success("Song backup downloaded")
            settingsService.setLastBackupWarningTime(Date.now())
        } catch (e) {
            console.error(e)
            logger.error("Error downloading songs")
        }
    }

    const sideClass = isOpen ? "side-menu menu-open" : "side-menu"
    const layer1Color = theme.layer('menu_background', 0.35).lighten(0.2)
    const layer2Color = theme.layer('menu_background', 0.32).desaturate(0.4)
    const layer1ColorText = theme.getTextColorFromBackground(layer1Color)
    const layer2ColorText = theme.getTextColorFromBackground(layer2Color)
    return <div className={`menu-wrapper ${inPreview ? "menu-wrapper-absolute" : ""}`} ref={menuRef}>
        <div className="menu menu-visible menu-main-page" >
            {isOpen &&
                <MenuItem onClick={toggleMenu} className='close-menu' ariaLabel='Close menu'>
                    <FaTimes className="icon" />
                </MenuItem>
            }
            <MenuItem onClick={() => selectSideMenu("Help")} className="margin-top-auto" isActive={selectedMenu === "Help" && isOpen} ariaLabel='Open info menu'>
                <FaInfo className="icon" />
            </MenuItem>
            <MenuItem onClick={() => selectSideMenu("Library")} isActive={selectedMenu === "Library" && isOpen} ariaLabel='Open library menu'>
                <RiPlayListFill className='icon' />
            </MenuItem>
            <MenuItem onClick={() => selectSideMenu("Songs")} isActive={selectedMenu === "Songs" && isOpen} ariaLabel='Open songs menu'>
                <FaMusic className="icon" />
            </MenuItem>
            <MenuItem onClick={() => selectSideMenu("Settings")} isActive={selectedMenu === "Settings" && isOpen} ariaLabel='Open settings'>
                <FaCog className="icon" />
            </MenuItem>
            <MenuItem onClick={homeStore.open} ariaLabel='Open home menu'>
                <FaHome className="icon" />
            </MenuItem>
        </div>
        <div className={sideClass}>
            <MenuPanel title="No selection" current={selectedMenu} id='No selection'>
                Select a menu
            </MenuPanel>
            <MenuPanel current={selectedMenu} id='Songs'>
                <div className="songs-buttons-wrapper">
                    <HelpTooltip>
                        <ul>
                            <li>Click the song name to play it</li>
                            <li>
                                You can import songs made by other users (does not accept audio files).
                                Or you can download yours to share
                            </li>
                            <li>To create your song, you can record the notes you play or create one in the composer</li>
                            <li><FaCrosshairs style={{ marginRight: '0.2rem' }} />: Start the practice mode</li>
                            <li><FaRegCircle style={{ marginRight: '0.2rem' }} />: Start the approaching notes mode</li>
                            {IS_MIDI_AVAILABLE &&
                                <li>You can connect a MIDI keyboard to play</li>
                            }
                        </ul>
                    </HelpTooltip>
                    <Link href='/composer' style={{ marginLeft: 'auto' }}>
                        <AppButton>
                            Compose song
                        </AppButton>
                    </Link>
                    <FilePicker<SerializedSong | SerializedSong[]>
                        onPick={importSong}
                        onError={JSONImportError}
                        as='json'
                        multiple={true}
                    >
                        <AppButton>
                            Import song sheet
                        </AppButton>
                    </FilePicker>

                </div>
                <SongMenu<SongRowProps>
                    songs={songs}
                    exclude={excludedSongs}
                    onCreateFolder={createFolder}
                    style={{ marginTop: '0.6rem' }}
                    SongComponent={SongRow}
                    componentProps={{
                        theme,
                        folders,
                        functions: { removeSong, toggleMenu, downloadSong, renameSong }
                    }}
                />
                <div style={{ marginTop: "auto", paddingTop: '0.5rem', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                    <AppButton
                        style={{ marginLeft: 'auto' }}
                        onClick={downloadAllSongs}

                    >
                        Download all songs (backup)
                    </AppButton>
                </div>
            </MenuPanel>

            <MenuPanel current={selectedMenu} id='Settings'>
                <SettingsPane
                    settings={data.settings}
                    changeVolume={functions.changeVolume}
                    onUpdate={handleSettingChange}
                />
                <div className='settings-row-wrap'>
                    {IS_MIDI_AVAILABLE &&
                        <Link href='/keybinds'>
                            <AppButton style={{ width: 'fit-content' }}>
                                Connect MIDI keyboard
                            </AppButton>
                        </Link>
                    }
                    <Link href='/theme'>
                        <AppButton style={{ width: 'fit-content' }}>
                            Change app theme
                        </AppButton>
                    </Link>
                </div>
                <div style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }} className={hasTooltip(true)}>
                    {isPersistentStorage ? "Storage is persisted" : "Storage is not persisted"}
                    {isPersistentStorage
                        ? <Tooltip position='top' style={{ maxWidth: 'unset' }}>
                            Your data is persisted in the browser, the browser should not automatically clear it.
                            Always make sure to download a backup sometimes, especially when you will not use the app
                            for a long time
                        </Tooltip>
                        : <Tooltip position='top'>
                            The browser didn't allow to store data persistently, it might happen that you will loose data
                            when cache is automatically cleared. To get persistent storage, add the app to the home screen.
                            If that still doesn't work, make sure you do a backup often
                        </Tooltip>
                    }

                </div>
                <DonateButton />
            </MenuPanel>

            <MenuPanel title="Library" current={selectedMenu} id='Library'>
                <div>
                    Here you can find songs to learn, they are provided by the sky-music library.
                </div>
                <div className='library-search-row' >
                    <input
                        className='library-search-input'
                        style={{ backgroundColor: layer1Color.toString(), color: layer1ColorText.toString() }}
                        placeholder='Song name'
                        onKeyDown={(e) => {
                            if (e.code === "Enter") searchSongs()
                        }}
                        onInput={(e: any) => setSearchInput(e.target.value)}
                        value={searchInput}
                    />
                    <button
                        className='library-search-btn'
                        onClick={clearSearch}
                        style={{ backgroundColor: layer1Color.toString(), color: layer1ColorText.toString() }}
                    >
                        <FaTimes />
                    </button>
                    <button
                        className='library-search-btn'
                        onClick={searchSongs}
                        style={{ backgroundColor: layer1Color.toString(), color: layer1ColorText.toString() }}
                    >
                        <FaSearch />
                    </button>
                </div>
                {(searchStatus || searchedSongs.length > 0) &&
                    <div className='library-search-songs-wrapper' style={{ backgroundColor: layer2Color.toString(), color: layer2ColorText.toString() }}>
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
                                    No results
                                </div>
                            : <div className='library-search-result-text'>
                                {searchStatus}
                            </div>
                        }
                    </div>

                }

            </MenuPanel>
            <MenuPanel title="Help" current={selectedMenu} id='Help'>
                <div className={sh['help-icon-wrapper']}>
                    <a href='https://discord.gg/Arsf65YYHq' >
                        <FaDiscord className={sh['help-icon']} />
                    </a>
                    <a href='https://github.com/Specy/genshin-music' >
                        <FaGithub className={sh['help-icon']} />
                    </a>
                </div>
                <HelpTab />
                <DonateButton />
            </MenuPanel>
        </div>
    </div>
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

function SongRow({ data, functions, theme, folders }: SongRowProps) {
    const { removeSong, toggleMenu, downloadSong, renameSong } = functions
    const buttonStyle = { backgroundColor: theme.layer('primary', 0.15).toString() }
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    if (data.type === 'vsrg') return <div className='row'>
        Invalid song
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
            <SongActionButton
                onClick={async () => {
                    const parsed = await songService.fromStorableSong(data) as RecordedOrComposed
                    playerStore.practice(parsed, 0, parsed.notes.length)
                    toggleMenu(false)
                }}
                ariaLabel={`Practice song ${data.name}`}
                tooltip='Practice'
                style={buttonStyle}
            >
                <FaCrosshairs />
            </SongActionButton>

            <SongActionButton onClick={async () => {
                const parsed = await songService.fromStorableSong(data) as RecordedOrComposed
                playerStore.approaching(parsed, 0, parsed.notes.length)
                toggleMenu(false)

            }}
                tooltip='Approach mode'
                ariaLabel={`Play in Approach mode the song ${data.name}`}
                style={buttonStyle}
            >
                <FaRegCircle />
            </SongActionButton>
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
                            renameSong(songName, data.id!)
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
                <Link
                    href={{
                        pathname: "composer",
                        query: {
                            songId: data.id,
                        }
                    }}
                    style={{ width: '100%' }}
                >
                    <FloatingDropdownRow
                        style={{ width: '100%' }}
                        onClick={() => {
                            if (data?.type === 'recorded') logger.warn('Converting recorded song to composed, audio might not be accurate')
                        }}
                    >
                        <FaEdit style={{ marginRight: "0.4rem" }} size={14} />
                        <FloatingDropdownText text='Edit song' />
                    </FloatingDropdownRow>
                </Link>
                <FloatingDropdownRow onClick={async () => {
                    const song = await songService.fromStorableSong(data) as RecordedOrComposed
                    downloadSong(song)
                }}>
                    <FaDownload style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Download' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={async () => {
                    const song = await songService.fromStorableSong(data) as RecordedOrComposed
                    downloadSong(song.toMidi())
                }}>
                    <FaDownload style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Download MIDI' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => removeSong(data.name, data.id!)}>
                    <FaTrash color="#ed4557" style={{ marginRight: "0.4rem" }} size={14} />
                    <FloatingDropdownText text='Delete' />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}


export default Menu