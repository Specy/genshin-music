import React, { Component } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faMusic, faCog, faTrash, faCompactDisc, faDownload } from '@fortawesome/free-solid-svg-icons'
import { FileDownloader, LoggerEvent, ComposerSongSerialization, prepareSongDownload } from "lib/SongUtils"
import { appName,isTwa } from 'appConfig'
import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'
import MenuClose from 'components/MenuClose'
import SettingsRow from 'components/SettingsRow'


class Menu extends Component {
    constructor(props) {
        super(props)
        this.state = {
            open: false,
            selectedMenu: "Settings",
            selectedSongType: "composed",
        }    
    }
    componentDidMount() {
        window.addEventListener("keydown", this.handleKeyboard)
    }
    componentWillUnmount(){
        window.removeEventListener("keydown", this.handleKeyboard)
    }
    handleKeyboard = (event) => {
        let key = event.code
        if (document.activeElement.tagName === "INPUT") return

        switch (key) {
            case "Escape": {
                if(this.state.open) this.props.functions.toggleMenuVisible()
                this.setState({ open: false })
                break
            }
            default: break;
        }
    }
    toggleMenu = (override) => {
        if (typeof override !== "boolean") override = undefined
        let newState = override !== undefined ? override : !this.state.open
        this.setState({
            open: newState,
        })
        if (newState === false) {
            this.props.functions.toggleMenuVisible()
        }
    }
    changeSelectedSongType = (name) => {
        this.setState({
            selectedSongType: name
        })
    }
    selectSideMenu = (selection) => {
        if (selection === this.state.selectedMenu && this.state.open) {
            return this.setState({
                open: false,
            })
        }
        this.setState({
            selectedMenu: selection,
            open: true
        })
    }
    downloadSong = (song) => {
        if (song._id) delete song._id
        if (song.data.isComposedVersion) {
            song = ComposerSongSerialization(song)
        }
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
    render() {
        const { data, functions } = this.props
        let sideClass = this.state.open ? "side-menu menu-open" : "side-menu"
        let selectedMenu = this.state.selectedMenu
        const { loadSong, removeSong, updateSong, changePage, handleSettingChange, changeVolume, createNewSong, changeMidiVisibility } = functions
        let songFunctions = {
            loadSong: loadSong,
            removeSong: removeSong,
            toggleMenu: this.toggleMenu,
            downloadSong: this.downloadSong
        }
        let songs = data.songs.filter(song => !song.data?.isComposedVersion)
        let composedSongs = data.songs.filter(song => song.data?.isComposedVersion)
        let hasUnsaved = data.hasChanges ? "margin-top-auto not-saved" : "margin-top-auto"
        let menuClass = data.menuOpen ? "menu menu-visible" : "menu"
        return <div className="menu-wrapper">
            <div className={menuClass}>
                <MenuClose action={this.toggleMenu} />
                <MenuItem type="Save" action={() => updateSong(data.currentSong)} className={hasUnsaved}>
                    <FontAwesomeIcon icon={faSave} className="icon" />
                </MenuItem>
                <MenuItem type="Songs" action={this.selectSideMenu}>
                    <FontAwesomeIcon icon={faMusic} className="icon" />
                </MenuItem>
                <MenuItem type="Settings" action={this.selectSideMenu}>
                    <FontAwesomeIcon icon={faCog} className="icon" />
                </MenuItem>
                <MenuItem type="Composer" action={() => changePage("")} className="inverted">
                    <FontAwesomeIcon icon={faCompactDisc} className="icon" />
                </MenuItem>
            </div>
            <div className={sideClass}>
                <MenuPanel title="No selection" visible={selectedMenu}>
                </MenuPanel>
                <MenuPanel title="Songs" visible={selectedMenu}>
                    <div className="songs-buttons-wrapper">
                        <button className="genshin-button" onClick={() => { changeMidiVisibility(true); this.toggleMenu() }}>
                            Create from MIDI
                        </button>
                        <button className="genshin-button" onClick={createNewSong}>
                            Create new song
                        </button>
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
                    <div className="songs-wrapper" style={{marginBottom: '0.5rem'}}>
                        {this.state.selectedSongType === "recorded"
                            ? songs.map(song => {
                                return <SongRow
                                    data={song}
                                    key={song.name}
                                    functions={songFunctions}
                                >
                                </SongRow>
                            })

                            : composedSongs.map(song => {
                                return <SongRow
                                    data={song}
                                    key={song.name}
                                    functions={songFunctions}
                                >
                                </SongRow>
                            })
                        }

                    </div>
                    <div className="songs-buttons-wrapper" style={{marginTop: 'auto'}}>
                        <button 
                            className={`genshin-button record-btn ${data.isRecordingAudio ? "selected" : ""}`}
                            onClick={() => functions.startRecordingAudio(!data.isRecordingAudio)}
                        >
                                {data.isRecordingAudio ? "Stop recording audio" : "Start recording audio"}
                        </button>
                    </div>

                </MenuPanel>
                <MenuPanel title="Settings" visible={selectedMenu}>
                    {Object.entries(data.settings).map(([key, data]) => {
                        return <SettingsRow
                            key={key + data.value}
                            objKey={key}
                            data={data}
                            changeVolume={changeVolume}
                            update={handleSettingChange}
                        >

                        </SettingsRow>
                    })}
                    {!isTwa() && <a className="donate-button" href="https://www.buymeacoffee.com/Specy" target="_blank" rel="noreferrer">
                        Support me
                    </a>}
                </MenuPanel>
            </div>
        </div>
    }
}


function SongRow(props) {
    const { data, functions } = props
    const { removeSong, toggleMenu, loadSong, downloadSong } = functions
    return <div className="song-row">
        <div className="song-name" onClick={() => {
            loadSong(data)
            toggleMenu(false)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => downloadSong(data)}>
                <FontAwesomeIcon icon={faDownload} />
            </button>
            <button className="song-button" onClick={() => removeSong(data.name)}>
                <FontAwesomeIcon icon={faTrash} color="#ed4557" />
            </button>
        </div>
    </div>
}



export default Menu