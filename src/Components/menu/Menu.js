import React, { Component } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMusic, faTimes, faCog, faTrash, faCrosshairs } from '@fortawesome/free-solid-svg-icons'
import "./menu.css"
class Menu extends Component {
    constructor(props) {
        super(props)
        this.state = {
            open: false,
            selectedMenu: "Songs"
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
    render() {
        let sideClass = this.state.open ? "side-menu menu-open" : "side-menu"
        let selectedMenu = this.state.selectedMenu
        let data = this.props.data
        let functions = this.props.functions
        functions.toggleMenu = this.toggleMenu
        return <div className="menu-wrapper">
            <div className="menu">
                <CloseMenu action={this.toggleMenu} />
                <MenuItem type="Songs" action={this.selectSideMenu} className="margin-top-auto">
                    <FontAwesomeIcon icon={faMusic} className="icon" />
                </MenuItem>
                <MenuItem type="Settings" action={this.selectSideMenu}>
                    <FontAwesomeIcon icon={faCog} className="icon" />
                </MenuItem>
            </div>
            <div className={sideClass}>
                <MenuPanel title="No selection" visible={selectedMenu}> 
                </MenuPanel>
                <MenuPanel title="Songs" visible={selectedMenu}>
                    {data.songs.map(song => {
                        return <SongRow 
                            key={song.name}
                            data={song} 
                            functions={functions}>
                            
                        </SongRow>
                    })}
                </MenuPanel>
                <MenuPanel title="Settings" visible={selectedMenu}>

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
    let data = props.data
    let deleteSong = props.functions.removeSong
    let playSong = props.functions.playSong
    let practiceSong = props.functions.practiceSong
    let toggleMenu = props.functions.toggleMenu
    return <div className="song-row">
        <div className="song-name" onClick={() => {
            playSong(data)
            toggleMenu(false)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => practiceSong(data)}>
                <FontAwesomeIcon icon={faCrosshairs}  />
            </button>
            <button className="song-button"  onClick={() => deleteSong(data.name)}>
            <FontAwesomeIcon icon={faTrash} color=" #eb001a" />
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