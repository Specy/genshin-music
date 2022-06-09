import { useCallback, useEffect, useState } from 'react'
import { FaMusic, FaTimes, FaCog, FaTrash, FaCrosshairs, FaDownload, FaInfo, FaSearch, FaHome, FaPen, FaEllipsisH, FaRegCircle } from 'react-icons/fa';
import { FaDiscord, FaGithub } from 'react-icons/fa';
import { RiPlayListFill } from 'react-icons/ri'
import { FileDownloader, parseSong } from "lib/Tools"
import { APP_NAME, IS_MIDI_AVAILABLE } from "appConfig"
import { SongStore } from 'stores/SongStore'
import { HelpTab } from 'components/HelpTab'
import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'
import SettingsRow from 'components/SettingsRow'
import DonateButton from 'components/DonateButton'
import LibrarySearchedSong from 'components/LibrarySearchedSong'
import { SongActionButton } from 'components/SongActionButton'
import Analytics from 'lib/Analytics';
import HomeStore from 'stores/HomeStore';
import LoggerStore from 'stores/LoggerStore';
import { AppButton } from 'components/AppButton';
import { SongMenu } from 'components/SongMenu';
import { Link } from 'react-router-dom'
import { SerializedSong, Song } from 'lib/Song';
import { ComposedSong, SerializedComposedSong } from 'lib/ComposedSong';
import { SettingUpdate, SettingUpdateKey, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { MainPageSettingsDataType } from 'lib/BaseSettings';
import { useTheme } from 'lib/Hooks/useTheme';
import { SearchedSongType } from 'types/GeneralTypes';
import { FileElement, FilePicker } from 'components/FilePicker';
import { SerializedSongType } from 'types/SongTypes';
import "./menu.css"
import { ThemeStoreClass } from 'stores/ThemeStore';
import { KeyboardEventData, KeyboardProvider } from 'lib/Providers/KeyboardProvider';
import { hasTooltip, Tooltip } from "components/Tooltip"
import { HelpTooltip } from 'components/HelpTooltip';
import { FloatingDropdown, FloatingDropdownRow, FloatingDropdownText } from 'components/FloatingDropdown';
import { Midi } from '@tonejs/midi';
import { asyncConfirm } from 'components/AsyncPrompts';
interface MenuProps {
    functions: {
        addSong: (song: Song | ComposedSong) => void
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string) => void
        handleSettingChange: (override: SettingUpdate) => void
        changeVolume: (override: SettingVolumeUpdate) => void
    }
    data: {
        settings: MainPageSettingsDataType
        songs: SerializedSongType[]
    }
}

export type MenuTabs = 'Help' | 'Library' | 'Songs' | 'Settings' | 'Home'

function Menu({ functions, data }: MenuProps) {
    const [open, setOpen] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Songs')
    const [searchInput, setSearchInput] = useState('')
    const [searchedSongs, setSearchedSongs] = useState<SearchedSongType[]>([])
    const [searchStatus, setSearchStatus] = useState('')
    const [isPersistentStorage, setPeristentStorage] = useState(false)
    const [theme] = useTheme()
    const { handleSettingChange, addSong, removeSong, renameSong } = functions
    useEffect(() => {
        async function checkStorage() {
            if (navigator.storage && navigator.storage.persist) {
                let isPersisted = await navigator.storage.persisted()
                if (!isPersisted) isPersisted = await navigator.storage.persist()
                setPeristentStorage(isPersisted)
            }
        }
        checkStorage()
    }, [])
    const handleKeyboard = useCallback(({ letter, shift, code }: KeyboardEventData) => {
        //@ts-ignore
        document.activeElement?.blur()
        if (letter === 'M' && shift) setOpen(!open)
        if (code === 'Escape') setOpen(false)
    }, [open])

    useEffect(() => {
        KeyboardProvider.listen(handleKeyboard)
        return () => KeyboardProvider.unlisten(handleKeyboard)
    }, [handleKeyboard])

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
            return LoggerStore.error(fetchedSongs.error)

        }
        setSearchStatus('success')
        setSearchedSongs(fetchedSongs as SearchedSongType[])
        Analytics.songSearch({ name: searchInput })
    }
    const toggleMenu = (override?: boolean | null) => {
        if (typeof override !== "boolean") override = null
        const newState = override !== null ? override : !open
        setOpen(newState)
    }
    const selectSideMenu = (selection?: MenuTabs) => {
        if (selection === selectedMenu && open) {
            return setOpen(false)
        }
        clearSearch()
        if (selection) setSelectedMenu(selection)
        setOpen(true)
        Analytics.UIEvent('menu', { tab: selection })
    }
    const importSong = (files: FileElement<SerializedSongType[] | SerializedSongType>[]) => {
        for (const file of files) {
            try {
                const songs = (Array.isArray(file.data) ? file.data : [file.data]) as SerializedSongType[]
                for (const song of songs) {
                    addSong(parseSong(song))
                    Analytics.userSongs('import', { name: song?.name, page: 'player' })
                }
            } catch (e) {
                console.error(e)
                if (file.file.name.includes?.(".mid")) {
                    return LoggerStore.error("Midi files should be imported in the composer")
                }
                logImportError()
            }
        }
    }
    const downloadSong = async (song: ComposedSong | Song | Midi) => {
        if (song instanceof Midi) {
            const agrees = await asyncConfirm(
                `If you use MIDI, the song will loose some information, if you want to share the song with others,
                use the other format (button above). Do you still want to download?`
            )
            if(!agrees) return
            return FileDownloader.download(
                new Blob([song.toArray()],{ type: "audio/midi"}), 
                song.name + ".mid"
            )
        }
        const songName = song.name
        const converted = [APP_NAME === 'Sky' ? song.toOldFormat() : song.serialize()]
        const json = JSON.stringify(converted)
        FileDownloader.download(json, `${songName}.${APP_NAME.toLowerCase()}sheet.json`)
        LoggerStore.success("Song downloaded")
        Analytics.userSongs('download', { name: songName, page: 'player' })
    }
    const logImportError = useCallback((error?: any) => {
        if (error) console.error(error)
        LoggerStore.error(
            `Error importing song, invalid format (Only supports the ${APP_NAME.toLowerCase()}sheet.json format)`,
            8000
        )
    }, [])
    function downloadAllSongs() {
        try {
            const toDownload = data.songs.map(song => {
                if (APP_NAME === 'Sky') {
                    return song.data.isComposedVersion
                        ? ComposedSong.deserialize(song as SerializedComposedSong).toOldFormat()
                        : Song.deserialize(song as SerializedSong).toOldFormat()
                }
                return song
            })
            const json = JSON.stringify(toDownload)
            const date = new Date().toISOString().split('T')[0]
            FileDownloader.download(json, `${APP_NAME}_Backup_${date}.json`)
            LoggerStore.success("Song backup downloaded")
        } catch (e) {
            console.error(e)
            LoggerStore.error("Error downloading songs")
        }
    }

    const sideClass = open ? "side-menu menu-open" : "side-menu"
    const layer1Color = theme.layer('menu_background', 0.35).lighten(0.2)
    const layer2Color = theme.layer('menu_background', 0.32).desaturate(0.4)
    return <div className="menu-wrapper">
        <div className="menu menu-visible menu-main-page" >
            {open &&
                <MenuItem action={toggleMenu} className='close-menu'>
                    <FaTimes className="icon" />
                </MenuItem>
            }
            <MenuItem<MenuTabs> data="Help" action={selectSideMenu} className="margin-top-auto">
                <FaInfo className="icon" />
            </MenuItem>
            <MenuItem<MenuTabs> data="Library" action={selectSideMenu}>
                <RiPlayListFill className='icon' />
            </MenuItem>
            <MenuItem<MenuTabs> data="Songs" action={selectSideMenu} >
                <FaMusic className="icon" />
            </MenuItem>
            <MenuItem<MenuTabs> data="Settings" action={selectSideMenu}>
                <FaCog className="icon" />
            </MenuItem>
            <MenuItem<MenuTabs> data="Home" action={HomeStore.open}>
                <FaHome className="icon" />
            </MenuItem>
        </div>
        <div className={sideClass}>
            <MenuPanel title="No selection" current={selectedMenu}>
            </MenuPanel>
            <MenuPanel title="Songs" current={selectedMenu}>
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
                    <Link to='Composer' style={{ marginLeft: 'auto' }}>
                        <AppButton>
                            Compose song
                        </AppButton>
                    </Link>
                    <FilePicker<SerializedSongType | SerializedSongType[]>
                        onChange={importSong}
                        onError={logImportError}
                        as='json'
                        multiple={true}
                    >
                        <AppButton>
                            Import song
                        </AppButton>
                    </FilePicker>

                </div>
                <SongMenu<SongRowProps>
                    songs={data.songs}
                    baseType='recorded'
                    SongComponent={SongRow}
                    componentProps={{
                        theme,
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

            <MenuPanel title="Settings" current={selectedMenu}>
                {Object.entries(data.settings).map(([key, data]) => {
                    return <SettingsRow
                        key={key}
                        objKey={key as SettingUpdateKey}
                        data={data}
                        changeVolume={functions.changeVolume}
                        update={handleSettingChange}
                    />
                })}
                <div className='settings-row-wrap'>
                    {IS_MIDI_AVAILABLE &&
                        <Link to={'MidiSetup'}>
                            <AppButton style={{ width: 'fit-content' }}>
                                Connect MIDI keyboard
                            </AppButton>
                        </Link>
                    }
                    <Link to={'Theme'}>
                        <AppButton style={{ width: 'fit-content' }}>
                            Change app theme
                        </AppButton>
                    </Link>
                </div>
                <div style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }}>
                    {isPersistentStorage ? "Storage is persisted" : "Storage is not persisted"}
                </div>
                <DonateButton />
            </MenuPanel>

            <MenuPanel title="Library" current={selectedMenu}>
                <div>
                    Here you can find songs to learn, they are provided by the sky-music library.
                </div>
                <div className='library-search-row' >
                    <input
                        className='library-search-input'
                        style={{ backgroundColor: layer1Color.toString() }}
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
                        style={{ backgroundColor: layer1Color.toString() }}
                    >
                        <FaTimes />
                    </button>
                    <button
                        className='library-search-btn'
                        onClick={searchSongs}
                        style={{ backgroundColor: layer1Color.toString() }}
                    >
                        <FaSearch />
                    </button>
                </div>
                <div className='library-search-songs-wrapper' style={{ backgroundColor: layer2Color.toString() }}>
                    {searchStatus === "success" ?
                        searchedSongs.length > 0
                            ? searchedSongs.map(song =>
                                <LibrarySearchedSong
                                    theme={theme}
                                    key={song.file}
                                    data={song}
                                    importSong={addSong}
                                    onClick={SongStore.play}
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
            </MenuPanel>
            <MenuPanel title="Help" current={selectedMenu}>
                <div className='help-icon-wrapper'>
                    <a href='https://discord.gg/Arsf65YYHq' >
                        <FaDiscord className='help-icon' />
                    </a>
                    <a href='https://github.com/Specy/genshin-music' >
                        <FaGithub className='help-icon' />
                    </a>
                </div>
                <HelpTab />
                <DonateButton />
            </MenuPanel>
        </div>
    </div>
}



interface SongRowProps {
    data: SerializedSongType
    theme: ThemeStoreClass
    functions: {
        removeSong: (name: string, id: string) => void
        renameSong: (newName: string, id: string,) => void
        toggleMenu: (override?: boolean) => void
        downloadSong: (song: Song | ComposedSong | Midi) => void
    }
}

function SongRow({ data, functions, theme }: SongRowProps) {
    const { removeSong, toggleMenu, downloadSong, renameSong } = functions
    const buttonStyle = { backgroundColor: theme.layer('primary', 0.15).hex() }
    const [isRenaming, setIsRenaming] = useState(false)
    const [songName, setSongName] = useState(data.name)
    useEffect(() => {
        setSongName(data.name)
    }, [data.name])
    return <div className="song-row">
        <div className={`song-name ${hasTooltip(true)}`} onClick={() => {
            if (isRenaming) return
            SongStore.play(parseSong(data), 0)
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
                onClick={() => {
                    const parsed = parseSong(data)
                    SongStore.practice(parsed, 0, parsed.notes.length)
                    toggleMenu(false)
                }}
                tooltip='Practice'
                style={buttonStyle}
            >
                <FaCrosshairs />
            </SongActionButton>

            <SongActionButton onClick={() => {
                const parsed = parseSong(data)
                SongStore.approaching(parsed, 0, parsed.notes.length)
                toggleMenu(false)

            }}
                tooltip='Approach mode'
                style={buttonStyle}
            >
                <FaRegCircle />
            </SongActionButton>
            <FloatingDropdown
                Icon={FaEllipsisH}
                style={buttonStyle}
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
                    <FaPen style={{ marginRight: "0.4rem" }} size={14}/>
                    <FloatingDropdownText text={isRenaming ? "Save" : "Rename"}/>
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => downloadSong(parseSong(data))}>
                    <FaDownload style={{ marginRight: "0.4rem" }} size={14}/>
                    <FloatingDropdownText text='Download' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => downloadSong(parseSong(data).toMidi())}>
                    <FaDownload style={{ marginRight: "0.4rem" }} size={14}/>
                    <FloatingDropdownText text='Download MIDI' />
                </FloatingDropdownRow>
                <FloatingDropdownRow onClick={() => removeSong(data.name, data.id!)}>
                    <FaTrash color="#ed4557" style={{ marginRight: "0.4rem" }} size={14}/>
                    <FloatingDropdownText text='Delete' />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
}


export default Menu