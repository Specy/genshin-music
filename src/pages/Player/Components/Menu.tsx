import { useCallback, useEffect, useState } from 'react'
import { FaMusic, FaTimes, FaCog, FaTrash, FaCrosshairs, FaDownload, FaInfo, FaSearch, FaHome } from 'react-icons/fa';
import { FaDiscord, FaGithub } from 'react-icons/fa';
import { BsCircle } from 'react-icons/bs'
import { RiPlayListFill } from 'react-icons/ri'
import { FileDownloader, prepareSongImport } from "lib/Utils/Tools"
import { APP_NAME, IS_MIDI_AVAILABLE } from "appConfig"
import { SongStore } from 'stores/SongStore'
import { HelpTab } from 'components/HelpTab'
import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'
import SettingsRow from 'components/SettingsRow'
import DonateButton from 'components/DonateButton'
import LibrarySearchedSong from 'components/LibrarySearchedSong'
import Analytics from 'lib/Analytics';
import HomeStore from 'stores/HomeStore';
import LoggerStore from 'stores/LoggerStore';
import { AppButton } from 'components/AppButton';
import { SongMenu } from 'components/SongMenu';
import { Link } from 'react-router-dom'
import type { Song } from 'lib/Utils/Song';
import { ComposedSong } from 'lib/Utils/ComposedSong';
import { SettingUpdate, SettingUpdateKey, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { MainPageSettingsDataType } from 'lib/BaseSettings';
import { useTheme } from 'lib/hooks/useTheme';
import { SearchedSongType } from 'types/GeneralTypes';
import { FileElement, FilePicker } from 'components/FilePicker';
import { SerializedSongType } from 'types/SongTypes';
import "./menu.css"

interface MenuProps {
    functions: {
        addSong: (song: Song | ComposedSong) => void
        removeSong: (name: string) => void
        changePage: (page: string) => void
        handleSettingChange: (override: SettingUpdate) => void
        changeVolume: (override: SettingVolumeUpdate) => void
    }
    data: {
        settings: MainPageSettingsDataType
        songs: (ComposedSong | Song)[]
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
    const { handleSettingChange, changePage, addSong, removeSong } = functions
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
    const handleKeyboard = useCallback((event: KeyboardEvent) => {
        let key = event.code
        if (document.activeElement?.tagName === "INPUT") return
        //@ts-ignore
        document.activeElement?.blur()
        if (event.shiftKey) {
            switch (key) {
                case "KeyM": {
                    setOpen(!open)
                    break
                }
                default: break;
            }
        } else {
            switch (key) {
                case "Escape": {
                    setOpen(false)
                    break
                }
                default: break;
            }
        }
    }, [open])

    useEffect(() => {
        window.addEventListener("keydown", handleKeyboard)
        return () => window.removeEventListener('keydown', handleKeyboard)
    }, [handleKeyboard])

    function clearSearch(){
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
        //TODO change this to the custom file picker
        for (const file of files) {
            try {
                const songs = (Array.isArray(file.data) ? file.data : [file.data]) as SerializedSongType[]
                for (const song of songs) {
                    addSong(prepareSongImport(song))
                    Analytics.userSongs('import', { name: song?.name, page: 'player' })
                }
            } catch (e) {
                console.error(e)
                if (file.file.name.includes?.(".mid")) {
                    return LoggerStore.error("Midi files should be imported in the composer")
                }
                LoggerStore.error(
                    `Error importing song, invalid format (Only supports the ${APP_NAME.toLowerCase()}sheet.json format)`,
                    8000
                )
            }
        }
    }
    const downloadSong = (song: ComposedSong | Song) => {
        const songName = song.name
        const converted = [APP_NAME === 'Sky' ? song.toOldFormat() : song.serialize()]
        const json = JSON.stringify(converted)
        FileDownloader.download(json, `${songName}.${APP_NAME.toLowerCase()}sheet.json`)
        LoggerStore.success("Song downloaded")
        Analytics.userSongs('download', { name: songName, page: 'player' })
    }

    function downloadAllSongs(){
        const toDownload = data.songs.map(song => {
            return APP_NAME === 'Sky' ? song.toOldFormat() : song.serialize()
        })
        const json = JSON.stringify(toDownload)
        const date = new Date().toISOString().split('T')[0]
        FileDownloader.download(json, `${APP_NAME}_Backup_${date}.json`)
        LoggerStore.success("Song backup downloaded")
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
                    <Link to='Composer'>
                        <AppButton>
                            Compose song
                        </AppButton>
                    </Link>
                    <FilePicker<SerializedSongType | SerializedSongType[]>
                        onChange={importSong} 
                        as='json'
                        multiple={true}
                    >
                        <AppButton>
                            Import song
                        </AppButton>
                    </FilePicker>

                </div>
                <SongMenu
                    songs={data.songs}
                    baseType='recorded'
                    SongComponent={SongRow}
                    componentProps={{
                        functions: {
                            removeSong,
                            toggleMenu,
                            downloadSong
                        }

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
                        <AppButton
                            onClick={() => changePage('MidiSetup')}
                            style={{ width: 'fit-content' }}>
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
                <div style={{ marginTop: '0.4rem', marginBottom: '0.6rem' }}>
                    {isPersistentStorage ? "Storage is persisted" : "Storage is not persisted"}
                </div>
                <DonateButton />

            </MenuPanel>

            <MenuPanel title="Library" current={selectedMenu}>
                <div>
                    Here you can find songs to learn, they are provided by the sky-music library.
                </div>
                <div className='library-search-row' style={{}} >
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
    data: Song | ComposedSong
    functions: {
        removeSong: (name: string) => void
        toggleMenu: (override?: boolean) => void
        downloadSong: (song: Song | ComposedSong) => void
    }
}

function SongRow({ data, functions }: SongRowProps) {
    const { removeSong, toggleMenu, downloadSong } = functions

    return <div className="song-row">
        <div className="song-name" onClick={() => {
            SongStore.play(data, 0)
            toggleMenu(false)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => {
                SongStore.practice(data, 0, data.notes.length)
                toggleMenu(false)
            }}
            >
                <FaCrosshairs />
            </button>

            <button className="song-button" onClick={() => {
                SongStore.approaching(data, 0, data.notes.length)
                toggleMenu(false)
            }}
            >
                <BsCircle />
            </button>
            <button className="song-button" onClick={() => downloadSong(data)}>
                <FaDownload />

            </button>
            <button className="song-button" onClick={() => removeSong(data.name)}>
                <FaTrash color="#ed4557" />
            </button>
        </div>
    </div>
}



export default Menu