import { Component } from 'react'
import { FaMusic, FaTimes, FaCog, FaTrash, FaCrosshairs, FaDownload, FaInfo, FaSearch, FaHome } from 'react-icons/fa';
import { FaDiscord, FaGithub } from 'react-icons/fa';
import { BsCircle } from 'react-icons/bs'
import { RiPlayListFill } from 'react-icons/ri'
import { FileDownloader, LoggerEvent, prepareSongImport, prepareSongDownload } from "lib/Utils"
import { FilePicker } from "react-file-picker"
import { appName, isTwa } from "appConfig"
import { songStore } from '../SongStore'
import { HelpTab } from 'components/HelpTab'
import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'
import MenuClose from 'components/MenuClose'
import SettingsRow from 'components/SettingsRow'
import DonateButton from 'components/DonateButton'
import LibrarySearchedSong from 'components/LibrarySearchedSong'
import "./menu.css"
class Menu extends Component {
    constructor(props) {
        super(props)
        this.state = {
            open: false,
            selectedMenu: "Songs",
            selectedSongType: "recorded",
            searchInput: '',
            searchedSongs: [],
            searchStatus: 'Write a song name then search!',
            isPersistentStorage: false
        }
    }
    componentDidMount() {
        this.checkPersistentStorage()
        window.addEventListener("keydown", this.handleKeyboard)
    }
    componentWillUnmount() {
        window.removeEventListener("keydown", this.handleKeyboard)
    }
    handleKeyboard = (event) => {
        let key = event.code
        if (document.activeElement.tagName === "INPUT") return
        document.activeElement?.blur()
        if (event.shiftKey) {
            switch (key) {
                case "KeyM": {
                    this.setState({ open: !this.state.open })
                    break
                }
                default: break;
            }
        } else {
            switch (key) {
                case "Escape": {
                    this.setState({ open: false })
                    break
                }
                default: break;
            }
        }

    }
    checkPersistentStorage = async () => {
        if (navigator.storage && navigator.storage.persist) {
            let isPersisted = await navigator.storage.persisted()
            if (!isPersisted) isPersisted = await navigator.storage.persist()
            this.setState({ isPersistentStorage: isPersisted })
        }
    }
    handleSearchInput = (text) => {
        this.setState({
            searchInput: text
        })
    }
    clearSearch = () => {
        this.setState({
            searchInput: '',
            searchedSongs: [],
            searchStatus: 'Write a song name then search!'
        })
    }
    searchSongs = async () => {
        const { searchInput, searchStatus } = this.state
        if (searchStatus === "Searching...") return
        if (searchInput.trim().length === 0) {
            return this.setState({
                searchStatus: 'Please write a non empty name'
            })
        }
        this.setState({
            searchStatus: 'Searching...'
        })
        let fetchedSongs = await fetch('https://sky-music.herokuapp.com/api/songs?search=' + encodeURI(searchInput)).then(data => data.json())
        if (fetchedSongs.error) {
            this.setState({
                searchStatus: 'Please write a non empty name'
            })
            return new LoggerEvent("Error", fetchedSongs.error).trigger()
        }
        this.setState({
            searchedSongs: fetchedSongs,
            searchStatus: 'success'
        })
    }
    toggleMenu = (override) => {
        if (typeof override !== "boolean") override = undefined
        let newState = override !== undefined ? override : !this.state.open
        this.setState({
            open: newState,
        })
    }
    selectSideMenu = (selection) => {
        if (selection === this.state.selectedMenu && this.state.open) {
            return this.setState({
                open: false,
            })
        }
        this.clearSearch()
        this.setState({
            selectedMenu: selection,
            open: true
        })
    }
    changeSelectedSongType = (name) => {
        this.setState({
            selectedSongType: name
        })
    }
    importSong = (file) => {
        const reader = new FileReader();
        reader.addEventListener('load', async (event) => {
            try {
                let songsInput = JSON.parse(event.target.result)
                if (!Array.isArray(songsInput)) songsInput = [songsInput]
                for (let song of songsInput) {
                    song = prepareSongImport(song)
                    await this.props.functions.addSong(song)
                }
            } catch (e) {
                let fileName = file.name
                console.error(e)
                if (fileName?.includes?.(".mid")) {
                    return new LoggerEvent("Error", "Midi files should be imported in the composer").trigger()
                }
                new LoggerEvent("Error", "Error importing song, invalid format").trigger()

            }
        })
        reader.readAsText(file)
    }
    downloadSong = (song) => {
        if (song._id) delete song._id
        let songName = song.name
        if (appName === "Sky") {
            //adds old format into the sheet
            song = prepareSongDownload(song)
        }
        if (!Array.isArray(song)) song = [song]
        song.forEach(song1 => {
            song1.data.appName = appName
        })
        let json = JSON.stringify(song)
        let fileDownloader = new FileDownloader()
        fileDownloader.download(json, `${songName}.${appName.toLowerCase()}sheet.json`)
        new LoggerEvent("Success", "Song downloaded").trigger()
    }

    downloadAllSongs = () => {
        let toDownload = []
        this.props.data.songs.forEach(song => {
            if (song._id) delete song._id
            if (appName === "Sky") {
                song = prepareSongDownload(song)
            }
            Array.isArray(song) ? toDownload.push(...song) : toDownload.push(song)
        })
        let fileDownloader = new FileDownloader()
        let json = JSON.stringify(toDownload)
        let date = new Date().toISOString().split('T')[0]
        fileDownloader.download(json, `${appName}_Backup_${date}.json`)
        new LoggerEvent("Success", "Song backup downloaded").trigger()
    }

    render() {
        let sideClass = this.state.open ? "side-menu menu-open" : "side-menu"
        const { data, functions } = this.props
        const { handleSettingChange } = functions
        functions.toggleMenu = this.toggleMenu
        functions.downloadSong = this.downloadSong
        let changePage = this.props.functions.changePage
        let songs = data.songs.filter(song => !song.data.isComposedVersion)
        let composedSongs = data.songs.filter(song => song.data.isComposedVersion)
        const { searchStatus, searchedSongs, selectedMenu } = this.state
        let searchedSongFunctions = {
            importSong: functions.addSong,
        }
        return <div className="menu-wrapper">
            <div className="menu menu-visible menu-main-page">
                {this.state.open && <MenuClose action={this.toggleMenu} />}
                <MenuItem type="Help" action={this.selectSideMenu} className="margin-top-auto">
                    <FaInfo className="icon" />
                </MenuItem>
                <MenuItem type="Library" action={this.selectSideMenu}>
                    <RiPlayListFill className='icon' />
                </MenuItem>
                <MenuItem type="Songs" action={this.selectSideMenu} >
                    <FaMusic className="icon" />
                </MenuItem>
                <MenuItem type="Settings" action={this.selectSideMenu}>
                    <FaCog className="icon" />
                </MenuItem>
                <MenuItem type="Home" action={() => changePage("home")}>
                    <FaHome className="icon" />
                </MenuItem>
            </div>
            <div className={sideClass}>
                <MenuPanel title="No selection" visible={selectedMenu}>
                </MenuPanel>
                <MenuPanel title="Songs" visible={selectedMenu}>
                    <div className="songs-buttons-wrapper">
                        <button className="genshin-button"
                            onClick={() => changePage("Composer")}
                        >
                            Compose song
                        </button>
                        <FilePicker
                            onChange={(file) => this.importSong(file)}
                        >
                            <button className="genshin-button">
                                Import song
                            </button>
                        </FilePicker>

                    </div>
                    <div className="tab-selector-wrapper">
                        <button
                            className={this.state.selectedSongType === "recorded" ? "tab-selector tab-selected" : "tab-selector"}
                            onClick={() => this.changeSelectedSongType("recorded")}
                        >
                            Recorded
                        </button>
                        <button
                            className={this.state.selectedSongType === "composed" ? "tab-selector tab-selected" : "tab-selector"}
                            onClick={() => this.changeSelectedSongType("composed")}
                        >
                            Composed
                        </button>
                    </div>
                    <div className="songs-wrapper">
                        {this.state.selectedSongType === "recorded"
                            ? songs.map(song => {
                                return <SongRow
                                    data={song}
                                    key={song.name}
                                    functions={functions}
                                >
                                </SongRow>
                            })
                            : composedSongs.map(song => {
                                return <SongRow
                                    data={song}
                                    key={song.name}
                                    functions={functions}
                                >
                                </SongRow>
                            })
                        }
                    </div>
                    <div style={{ marginTop: "auto", paddingTop: '0.5rem', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className='genshin-button'
                            style={{ marginLeft: 'auto' }}
                            onClick={this.downloadAllSongs}
                        >
                            Download all songs (backup)
                        </button>
                    </div>
                </MenuPanel>

                <MenuPanel title="Settings" visible={selectedMenu}>
                    {Object.entries(data.settings).map(([key, data]) => {
                        return <SettingsRow
                            key={key + data.value}
                            objKey={key}
                            data={data}
                            changeVolume={functions.changeVolume}
                            update={handleSettingChange}
                        >

                        </SettingsRow>
                    })}
                    <div style={{ marginTop: '1rem' }}>
                        {this.state.isPersistentStorage ? "Storage is persisted" : "Storage is not persisted"}
                    </div>
                    {!isTwa() && <DonateButton onClick={changePage} />}

                </MenuPanel>

                <MenuPanel title="Library" visible={selectedMenu}>
                    <div>
                        Here you can find songs to learn, they are provided by the sky-music library.
                    </div>
                    <div className='library-search-row' >
                        <input
                            className='library-search-input'
                            placeholder='Song name'
                            onKeyDown={(e) => {
                                if (e.code === "Enter") this.searchSongs()
                            }}
                            onInput={(e) => this.handleSearchInput(e.target.value)}
                            value={this.state.searchInput}
                        />
                        <button className='library-search-btn' onClick={this.clearSearch}>
                            <FaTimes />
                        </button>
                        <button className='library-search-btn' onClick={this.searchSongs}>
                            <FaSearch />
                        </button>
                    </div>
                    <div className='library-search-songs-wrapper'>
                        {searchStatus === "success" ?
                            searchedSongs.length > 0
                                ? searchedSongs.map(song =>
                                    <LibrarySearchedSong
                                        key={song.file}
                                        data={song}
                                        functions={searchedSongFunctions}
                                        songStore={songStore}
                                    >
                                        {song.name}
                                    </LibrarySearchedSong>)
                                : <div className='library-search-result-text'>
                                    No results
                                </div>
                            : <div className='library-search-result-text'>
                                {searchStatus}
                            </div>
                        }
                    </div>
                </MenuPanel>
                <MenuPanel title="Help" visible={selectedMenu}>
                    <div className='help-icon-wrapper'>
                        <a href='https://discord.gg/Arsf65YYHq' >
                            <FaDiscord className='help-icon' />
                        </a>
                        <a href='https://github.com/Specy/genshin-music' >
                            <FaGithub className='help-icon' />
                        </a>

                    </div>
                    <HelpTab />
                    {!isTwa() && <DonateButton onClick={changePage} />}
                </MenuPanel>
            </div>
        </div>
    }
}
function SongRow(props) {
    let data = props.data
    let deleteSong = props.functions.removeSong
    let toggleMenu = props.functions.toggleMenu
    let downloadSong = props.functions.downloadSong

    return <div className="song-row">
        <div className="song-name" onClick={() => {
            songStore.data = {
                eventType: 'play',
                song: data,
                start: 0
            }
            toggleMenu(false)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => {
                songStore.data = {
                    eventType: 'practice',
                    song: data,
                    start: 0
                }
                toggleMenu(false)
            }}
            >
                <FaCrosshairs />
            </button>

            <button className="song-button" onClick={() => {
                songStore.data = {
                    eventType: 'approaching',
                    song: data,
                    start: 0
                }
                toggleMenu(false)
            }}
            >
                <BsCircle />
            </button>
            <button className="song-button" onClick={() => downloadSong(data)}>
                <FaDownload />

            </button>
            <button className="song-button" onClick={() => deleteSong(data.name)}>
                <FaTrash color="#ed4557" />
            </button>
        </div>
    </div>
}



export default Menu