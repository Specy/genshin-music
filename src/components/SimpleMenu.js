import React, { Component } from 'react'
import { FaHome } from 'react-icons/fa';

import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'


export class SimpleMenu extends Component {
    constructor(props) {
        super(props)
        this.state = {
            open: false,
            selectedMenu: "Settings"
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
        const {      functions } = this.props
        let sideClass = this.state.open ? "side-menu menu-open" : "side-menu"
        let selectedMenu = this.state.selectedMenu
        const { changePage } = functions
        let menuClass = "menu menu-visible"
        return <div className="menu-wrapper" >
            <div className={menuClass} style={{justifyContent: 'flex-end'}}>
            {this.props.children}
                <MenuItem type="Home" action={() => changePage("home")}>
                    <FaHome className="icon" />
                </MenuItem>
            </div>
            <div className={sideClass}>
                <MenuPanel title="No selection" visible={selectedMenu}>
                </MenuPanel>
            </div>
        </div>
    }
}