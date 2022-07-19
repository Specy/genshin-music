import MenuPanel from "components/Layout/MenuPanel";
import { MenuItem } from "components/Miscellaneous/MenuItem";
import Memoized from "components/Utility/Memoized";
import isMobile from "is-mobile";
import Analytics from "lib/Analytics";
import useClickOutside from "lib/Hooks/useClickOutside";
import { memo, useCallback, useState } from "react";
import { FaBars, FaHome, FaMusic, FaTimes } from "react-icons/fa";
import HomeStore from "stores/HomeStore";

type MenuTabs = 'Songs' | 'Settings'
const isOnMobile = isMobile()
function VsrgMenu(){
    const [isOpen, setOpen] = useState(false)
    const [isVisible, setVisible] = useState(false)
    const [selectedMenu, setSelectedMenu] = useState<MenuTabs>('Settings')
    const menuRef = useClickOutside<HTMLDivElement>((e) => {
        setOpen(false)
        if (isOnMobile) setVisible(false)
    }, { active: isOpen, ignoreFocusable: true })

    const toggleMenu = useCallback((override?: boolean) => {
        if (typeof override !== "boolean") override = undefined
        const newState = override !== undefined ? override : !isOpen
        setOpen(newState)
        setVisible(newState)
    }, [isOpen])
    const selectSideMenu = useCallback((selection?: MenuTabs) => {
        if (selection === selectedMenu && isOpen) {
            return setOpen(false)
        }
        setOpen(true)
        if (selection) {
            setSelectedMenu(selection)
            Analytics.UIEvent('menu', { tab: selection })
        }
    }, [isOpen, selectedMenu])
    const menuClass = isVisible ? "menu menu-visible" : "menu"
    const sideClass = isOpen ? "side-menu menu-open" : "side-menu"
    return <>
        <div className="hamburger" onClick={() => setVisible(!isVisible)}>
            <Memoized>
                <FaBars />
            </Memoized>
        </div>
        <div className="menu-wrapper" ref={menuRef}>

            <div className={menuClass}>
                <MenuItem onClick={() => toggleMenu(false)} className='close-menu' ariaLabel='Close menu'>
                    <FaTimes className="icon" />
                </MenuItem>

                <MenuItem   
                    onClick={() => selectSideMenu("Songs")} 
                    isActive={isOpen && selectedMenu === "Songs"} 
                    ariaLabel='Song menu'
                    style={{ marginTop: 'auto'}}
                >
                    <Memoized>
                        <FaMusic className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={() => selectSideMenu("Settings")} isActive={isOpen && selectedMenu === "Settings"} ariaLabel='Settings menu'>
                    <Memoized>
                        <FaHome className="icon" />
                    </Memoized>
                </MenuItem>
                <MenuItem onClick={() => HomeStore.open()} ariaLabel='Open home menu'>
                    <Memoized>
                        <FaHome className="icon" />
                    </Memoized>
                </MenuItem>
            </div>
            <div className={sideClass}>

                <MenuPanel current={selectedMenu} id="Songs">
                    songs
                </MenuPanel>
                <MenuPanel current={selectedMenu} id="Settings">
                    settings
                </MenuPanel>
            </div>
        </div>
    </>
}
export default memo(VsrgMenu, (p, n) => {
    return true
})