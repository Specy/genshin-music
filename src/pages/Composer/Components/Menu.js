import React, { Component } from 'react'
import { FaMusic, FaSave, FaCog, FaHome, FaTrash, FaDownload, FaTimes } from 'react-icons/fa';
import { FileDownloader, ComposerSongSerialization, prepareSongDownload } from "lib/Utils"
import { appName, isTwa } from 'appConfig'
import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'
import SettingsRow from 'components/SettingsRow'
import DonateButton from 'components/DonateButton'
import Memoized from 'components/Memoized';
import { isMidiAvailable } from 'appConfig';
import Analytics from 'lib/Analytics';
import LoggerStore from 'stores/LoggerStore';
import { AppButton } from 'components/AppButton';
import { SongMenu } from 'components/SongMenu';
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
    componentWillUnmount() {
        window.removeEventListener("keydown", this.handleKeyboard)
    }
    handleKeyboard = (event) => {
        let key = event.code
        if (document.activeElement.tagName === "INPUT") return
        document.activeElement?.blur()
        switch (key) {
            case "Escape": {
                if (this.state.open) this.props.functions.toggleMenuVisible()
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
        Analytics.UIEvent('menu',{tab: selection})
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
        LoggerStore.success("Song downloaded")
        Analytics.userSongs({name: song?.name, page: 'composer'},'download')
    }
    updateSong = () => {
        this.props.functions.updateSong(this.props.data.currentSong)
    }
    render() {
        const { data, functions } = this.props
        let sideClass = this.state.open ? "side-menu menu-open" : "side-menu"
        let selectedMenu = this.state.selectedMenu
        const { loadSong, removeSong, changePage, handleSettingChange, changeVolume, createNewSong, changeMidiVisibility } = functions
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
                <MenuItem action={this.toggleMenu} className='close-menu'>
                    <FaTimes className="icon" />
                </MenuItem>
                <MenuItem type="Save" action={this.updateSong} className={hasUnsaved}>
                    <Memoized>
                        <FaSave className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem type="Songs" action={this.selectSideMenu}>
                    <Memoized>
                        <FaMusic className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem type="Settings" action={this.selectSideMenu}>
                    <Memoized>
                        <FaCog className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem type="Home" action={() => changePage("home")}>
                    <Memoized>
                        <FaHome className="icon" />
                    </Memoized>
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
                    <SongMenu 
                        songs={data.songs}
                        SongComponent={SongRow}
                        componentProps={{
                            functions:songFunctions
                        }}
                    />
                    <div className="songs-buttons-wrapper" style={{ marginTop: 'auto' }}>
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
                            key={key}
                            objKey={key}
                            data={data}
                            changeVolume={changeVolume}
                            update={handleSettingChange}
                        />
                    })}
                    <div className='settings-row-wrap'>
                        <AppButton 
                            onClick={() => changePage('Theme')} 
                            style={{width:'fit-content'}}
                        >
                            Change app theme
                        </AppButton>
                        {isMidiAvailable && 
                            <button 
                                className='genshin-button' 
                                onClick={() => changePage('MidiSetup')} 
                                style={{width:'fit-content'}}
                            >
                                Connect MIDI keyboard
                            </button>
                        }
                    </div>                    
                    {!isTwa() && <DonateButton onClick={changePage} />}
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
                <Memoized>
                    <FaDownload />
                </Memoized>
            </button>
            <button className="song-button" onClick={() => removeSong(data.name)}>
                <Memoized>
                    <FaTrash color="#ed4557" />
                </Memoized>
            </button>
        </div>
    </div>
}



export default Menu