import { useState} from 'react'
import { FaHome, FaDiscord } from 'react-icons/fa';

import MenuItem from 'components/MenuItem'
import MenuPanel from 'components/MenuPanel'


export function SimpleMenu(props) {
    const [open, setOpen] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState("Settings")
    const { functions, children } = props
    const { changePage, toggleMenuVisible } = functions
    
    // eslint-disable-next-line
    const toggleMenu = (override) => {
        if (typeof override !== "boolean") override = undefined
        let newState = override !== undefined ? override : !open
        setOpen(newState)
        if (newState === false) toggleMenuVisible()
    }
    // eslint-disable-next-line
    const selectSideMenu = (selection) => {
        if (selection === this.state.selectedMenu && this.state.open) {
            return setOpen(false)
        }
        setSelectedMenu(selection)
        setOpen(true)
    }


    return <div className="menu-wrapper" >
        <div className="menu menu-visible" style={{ justifyContent: 'flex-end' }}>

            {children}

            <MenuItem type='Discord'>
                <a href='https://discord.gg/Arsf65YYHq' target='_blank' rel='noreferrer' >
                    <FaDiscord className="icon" />
                </a>
            </MenuItem>

            <MenuItem type="Home" action={() => changePage("home")}>
                <FaHome className="icon" />
            </MenuItem>

        </div>
        <div className={open ? "side-menu menu-open" : "side-menu"}>
            <MenuPanel title="No selection" visible={selectedMenu}>
            </MenuPanel>
        </div>
    </div>
}