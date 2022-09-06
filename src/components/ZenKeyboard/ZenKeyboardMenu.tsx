import useClickOutside from "$/lib/Hooks/useClickOutside"
import {homeStore} from "$stores/HomeStore"
import { FaBars, FaCog, FaHome, FaTimes } from "react-icons/fa"
import MenuPanel from "../Layout/MenuPanel"
import { MenuItem } from "../Miscellaneous/MenuItem"
import { useState } from 'react'
import { ZenKeyboardSettingsDataType } from "$/lib/BaseSettings"
import { SettingUpdate, SettingVolumeUpdate } from "$/types/SettingsPropriety"
import { SettingsPane } from "../Settings/SettingsPane"
import Memoized from "../Utility/Memoized"

interface ZenKeyboardMenuProps {
    settings: ZenKeyboardSettingsDataType

    handleSettingChange: (setting: SettingUpdate) => void
    onVolumeChange: (data: SettingVolumeUpdate) => void
}

export function ZenKeyboardMenu({ settings, handleSettingChange, onVolumeChange }: ZenKeyboardMenuProps) {
    const [selectedPage, setSelectedPage] = useState("Settings")
    const [isOpen, setIsOpen] = useState(true)
    const [isVisible, setIsVisible] = useState(false)
    const menuRef = useClickOutside<HTMLDivElement>(() => {
        setIsVisible(false)
    }, { ignoreFocusable: true, active: selectedPage !== "" })
    const sideClass = (isOpen && isVisible) ? "side-menu menu-open" : "side-menu"
    function toggleMenu() {
        setIsOpen(!isOpen)
    }
    return <div className="menu-wrapper" ref={menuRef}>
        <div
            className="hamburger-top"
            onClick={() => setIsVisible(!isVisible)}
        >
            <Memoized>
                <FaBars />
            </Memoized>
        </div>
        <div className={`menu ${isVisible ? "menu-visible" : ""}`} style={{ justifyContent: 'flex-end' }}>
            <MenuItem
                ariaLabel='Close menu'
                style={{ marginBottom: 'auto' }}
                onClick={() => setIsVisible(!isVisible)}
            >
                <FaTimes className="icon" />
            </MenuItem>
            <MenuItem
                onClick={() => {
                    setSelectedPage("Settings")
                    toggleMenu()
                }}
                isActive={selectedPage === "Settings" && isOpen}
                ariaLabel='Open settings'
            >
                <FaCog className="icon" />
            </MenuItem>
            <MenuItem onClick={homeStore.open} ariaLabel='Open home menu'>
                <FaHome className="icon" />
            </MenuItem>
        </div>
        <div className={sideClass}>
            <MenuPanel title="Settings" current={selectedPage} id="Settings">
                <SettingsPane
                    settings={settings}
                    onUpdate={handleSettingChange}
                    changeVolume={onVolumeChange}
                />
            </MenuPanel>
        </div>
    </div>
}