import React, { Component, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMusic, faTimes, faCog, faTrash, faCrosshairs, faDownload, faCompactDisc, } from '@fortawesome/free-solid-svg-icons'
import "./menu.css"

import { FileDownloader, LoggerEvent,getSongType,SkyToGenshin } from "../SongUtils"
import { FilePicker } from "react-file-picker"
class Menu extends Component {
    constructor(props) {
        super(props)
        this.state = {
            open: false,
            selectedMenu: "Settings",
            selectedSongType: "recorded",

        }
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
        reader.addEventListener('load', (event) => {

            try {
                let song = JSON.parse(event.target.result)
                let type = getSongType(song)
                if(type === "none"){
                    return new LoggerEvent("Error", "Invalid song").trigger() 
                }
                if(["skyRecorded","skyComposed"].includes(type)){
                    song = SkyToGenshin(song)
                }
                this.props.functions.addSong(song)
            } catch (e) {
                new LoggerEvent("Error", "Error importing song").trigger()
                console.error(e)
            }

        });
        reader.readAsText(file)
    }
    downloadSong = (song) => {
        if (song._id) delete song._id
        let json = JSON.stringify(song)
        let fileDownloader = new FileDownloader()
        fileDownloader.download(json, song.name + ".gensheet")
    }
    render() {
        let sideClass = this.state.open ? "side-menu menu-open" : "side-menu"
        let selectedMenu = this.state.selectedMenu
        const { data, functions } = this.props
        const { handleSettingChange } = functions
        functions.toggleMenu = this.toggleMenu
        functions.downloadSong = this.downloadSong
        let changePage = this.props.functions.changePage
        let songs = data.songs.filter(song => !song.data.isComposedVersion)
        let composedSongs = data.songs.filter(song => song.data.isComposedVersion)

        return <div className="menu-wrapper">
            <div className="menu menu-visible">
                {this.state.open && <CloseMenu action={this.toggleMenu} />}
                <MenuItem type="Songs" action={this.selectSideMenu} className="margin-top-auto">
                    <FontAwesomeIcon icon={faMusic} className="icon" />
                </MenuItem>
                <MenuItem type="Settings" action={this.selectSideMenu}>
                    <FontAwesomeIcon icon={faCog} className="icon" />
                </MenuItem>
                <MenuItem type="Composer" action={() => changePage("Composer")}>
                    <FontAwesomeIcon icon={faCompactDisc} className="icon" />
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

                </MenuPanel>
                <MenuPanel title="Settings" visible={selectedMenu}>
                    {Object.entries(data.settings).map(([key, data]) => {
                        return <SettingsRow
                            key={key + data.value}
                            objKey={key}
                            data={data}
                            update={handleSettingChange}
                        >

                        </SettingsRow>
                    })}
                    <a className="donate-button" href="https://www.buymeacoffee.com/Specy" target="_blank">
                        Support me
                    </a>

                </MenuPanel>
            </div>
        </div>
    }
}



function MenuPanel(props) {
    let className = props.visible === props.title ? "menu-panel menu-panel-visible" : "menu-panel"
    return <div className={className}>
        <div className="menu-title">
            {props.title}
        </div>
        <div className="panel-content-wrapper">
            {props.children}
        </div>
    </div>
}
function CloseMenu(props) {
    return <div onClick={() => props.action(false)} className="close-menu menu-item">
        <FontAwesomeIcon icon={faTimes} className="icon" />
    </div>
}
function SettingsRow(props) {
    const { data, update, objKey } = props
    const [valueHook, setter] = useState(data.value)
    function handleChange(e) {
        let el = e.target
        let value = data.type === "checkbox" ? el.checked : el.value
        if (data.type === "number") {
            value = Number(value)
            e.target.value = "" //have to do this to remove a react bug that adds a 0 at the start
            if (value < data.threshold[0] || value > data.threshold[1]) {
                return
            }
        }

        setter(value)
    }
    function sendChange() {
        if (data.value === valueHook) return
        data.value = valueHook
        let obj = {
            key: objKey,
            data: data
        }
        update(obj)
    }
    function sendChangeSelect(e) {
        let value = e.target.value
        data.value = value
        let obj = {
            key: objKey,
            data: data
        }
        update(obj)
    }
    if (objKey === "settingVesion") return null
    return <div className="settings-row">
        <div>
            {data.name}
        </div>
        {data.type === "select"
            ? <select value={data.value}
                onChange={sendChangeSelect}
            >
                {data.options.map(e => {
                    return <option value={e} key={e}>{e}</option>
                })}
            </select>
            : <input
                type={data.type}
                value={valueHook}
                checked={valueHook}
                onChange={handleChange}
                onBlur={sendChange}
            />}
    </div>
}
function SongRow(props) {
    let data = props.data
    let deleteSong = props.functions.removeSong
    let playSong = props.functions.playSong
    let practiceSong = props.functions.practiceSong
    let toggleMenu = props.functions.toggleMenu
    let downloadSong = props.functions.downloadSong
    return <div className="song-row">
        <div className="song-name" onClick={() => {
            playSong(data)
            toggleMenu(false)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => {
                practiceSong(data)
                toggleMenu(false)
            }}
            >
                <FontAwesomeIcon icon={faCrosshairs} />
            </button>
            <button className="song-button" onClick={() => downloadSong(data)}>
                <FontAwesomeIcon icon={faDownload} />

            </button>
            <button className="song-button" onClick={() => deleteSong(data.name)}>
                <FontAwesomeIcon icon={faTrash} color="#ed4557" />
            </button>
        </div>
    </div>
}
class MenuItem extends Component {
    constructor(props) {
        super(props)
    }
    render() {
        let className = this.props.className ? `menu-item ${this.props.className}` : "menu-item"
        return <div
            className={className}
            onClick={() => this.props.action(this.props.type)}
        >
            {this.props.children}
        </div>
    }
}
export default Menu