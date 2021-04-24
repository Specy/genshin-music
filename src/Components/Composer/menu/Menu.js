import React, { Component, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSave, faMusic, faTimes, faCog, faTrash, faCompactDisc } from '@fortawesome/free-solid-svg-icons'
import "../../menu/menu.css"

import { FileDownloader, LoggerEvent } from "../../SongUtils"
class Menu extends Component {
    constructor(props) {
        super(props)
        this.state = {
            open: false,
            selectedMenu: "Settings",
            selectedSongType: "composed",
        }
    }
    toggleMenu = (override) => {
        if (typeof override !== "boolean") override = undefined
        let newState = override !== undefined ? override : !this.state.open
        this.setState({
            open: newState,
        })
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
        let json = JSON.stringify(song)
        let fileDownloader = new FileDownloader()
        fileDownloader.download(json, song.name + ".json")
    }
    render() {
        const { data, functions } = this.props
        let sideClass = this.state.open ? "side-menu menu-open" : "side-menu"
        let selectedMenu = this.state.selectedMenu
        const { loadSong, removeSong, updateSong, changePage, handleSettingChange } = functions
        let songFunctions = {
            loadSong: loadSong,
            removeSong: removeSong,
            toggleMenu: this.toggleMenu
        }
        let songs = data.songs.filter(song => !song.data?.isComposedVersion)
        let composedSongs = data.songs.filter(song => song.data?.isComposedVersion)
        let hasUnsaved = data.hasChanges ? "margin-top-auto not-saved" : "margin-top-auto"
        return <div className="menu-wrapper">
            <div className="menu">
                <CloseMenu action={this.toggleMenu} />
                <MenuItem type="Save" action={() => updateSong(data.currentSong)} className={hasUnsaved}>
                    <FontAwesomeIcon icon={faSave} className="icon" />
                </MenuItem>
                <MenuItem type="Songs" action={this.selectSideMenu}>
                    <FontAwesomeIcon icon={faMusic} className="icon" />
                </MenuItem>
                <MenuItem type="Settings" action={this.selectSideMenu}>
                    <FontAwesomeIcon icon={faCog} className="icon" />
                </MenuItem>
                <MenuItem type="Composer" action={() => changePage("App")} className="inverted">
                    <FontAwesomeIcon icon={faCompactDisc} className="icon" />
                </MenuItem>
            </div>
            <div className={sideClass}>
                <MenuPanel title="No selection" visible={selectedMenu}>
                </MenuPanel>
                <MenuPanel title="Songs" visible={selectedMenu}>
                    <div className="songs-buttons-wrapper">
                        <button className="genshin-button" onClick={this.props.functions.createNewSong}>
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
                    <div className="songs-wrapper no-margin">
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

function SongRow(props) {
    const { data, functions } = props
    const { removeSong, toggleMenu, loadSong } = functions
    return <div className="song-row">
        <div className="song-name" onClick={() => {
            loadSong(data)
            toggleMenu(false)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => removeSong(data.name)}>
                <FontAwesomeIcon icon={faTrash} color="#ed4557" />
            </button>
        </div>
    </div>
}

function SettingsRow(props) {
    const { data, update, objKey } = props
    const [valueHook, setter] = useState(data.value)
    function handleChange(e) {
        let el = e.target
        let value = el.value
        if (data.type === "number") {
            value = Number(value)
            e.target.value = "" //have to do this to remove a react bug that adds a 0 at the start
            if (value < data.threshold[0] || value > data.threshold[1] ) {
                return
            }
        }
        setter(value)
    }
    function sendChange() {
        if(data.value === valueHook) return
        data.value = valueHook
        let obj = {
            key: objKey,
            data: data
        }
        update(obj)
    }
    function sendChangeSelect(e){
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
                onChange={handleChange}
                onBlur={sendChange}
            />}
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