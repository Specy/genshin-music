import useClickOutside from "$lib/Hooks/useClickOutside"
import {homeStore} from "$stores/HomeStore"
import {FaBars, FaCog, FaHome, FaTimes} from "react-icons/fa"
import MenuPanel from "$cmp/Layout/MenuPanel"
import {MenuItem} from "$cmp/Miscellaneous/MenuItem"
import {FC, useState} from 'react'
import {ZenKeyboardSettingsDataType} from "$lib/BaseSettings"
import {SettingUpdate, SettingVolumeUpdate} from "$/types/SettingsPropriety"
import {SettingsPane} from "$cmp/Settings/SettingsPane"
import Memoized from "$cmp/Utility/Memoized"
import {IconButton} from "$cmp/Inputs/IconButton";
import {INSTRUMENTS, PITCHES} from "$config";
import s from './ZenKeyboard.module.css'
import {MdPiano} from "react-icons/md";
import {IoMdMusicalNote} from "react-icons/io";
import {GiMetronome} from "react-icons/gi";
import {IconType} from "react-icons";

interface ZenKeyboardMenuProps {
    settings: ZenKeyboardSettingsDataType
    isMetronomePlaying: boolean
    handleSettingChange: (setting: SettingUpdate) => void
    onVolumeChange: (data: SettingVolumeUpdate) => void
    setIsMetronomePlaying: (val: boolean) => void
}


export function ZenKeyboardMenu({
                                    settings,
                                    handleSettingChange,
                                    onVolumeChange,
                                    isMetronomePlaying,
                                    setIsMetronomePlaying
                                }: ZenKeyboardMenuProps) {
    const [selectedPage, setSelectedPage] = useState("Settings")
    const [isOpen, setIsOpen] = useState(true)
    const [isVisible, setIsVisible] = useState(false)
    const menuRef = useClickOutside<HTMLDivElement>(() => {
        setIsVisible(false)
    }, {ignoreFocusable: true, active: selectedPage !== ""})
    const sideClass = (isOpen && isVisible) ? "side-menu menu-open" : "side-menu"

    function toggleMenu() {
        setIsOpen(!isOpen)
    }

    return <>

        <IconButton
            toggled={isMetronomePlaying}
            onClick={() => setIsMetronomePlaying(!isMetronomePlaying)}
            className='metronome-button'
            style={{
                position: 'absolute',
                top: "0.5rem",
                right: "5.1rem",
                borderRadius: '1rem',
                border: 'solid 0.1rem var(--secondary)'
            }}
            ariaLabel='Toggle metronome'
        >
            <GiMetronome size={18}/>
        </IconButton>
        <div
            style={{
                position: 'absolute',
                top: '0.5rem',
                right: '2.8rem',
            }}
        >
            <FloatingSelection
                value={settings.pitch.value}
                items={PITCHES}
                Icon={IoMdMusicalNote}
                onChange={(pitch) => handleSettingChange({
                    key: "pitch",
                    data: {
                        ...settings.pitch,
                        value: pitch
                    }
                })}
            />
        </div>
        <div
            style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',

            }}
        >
            <FloatingSelection
                value={settings.instrument.value}
                items={INSTRUMENTS}
                Icon={MdPiano}
                onChange={(instrument) => handleSettingChange({
                    key: "instrument",
                    data: {
                        ...settings.instrument,
                        value: instrument
                    }
                })}
            />
        </div>

        <div className="menu-wrapper" ref={menuRef}>

            <div
                className="hamburger-top"
                onClick={() => setIsVisible(!isVisible)}
            >
                <Memoized>
                    <FaBars/>
                </Memoized>
            </div>
            <div className={`menu ${isVisible ? "menu-visible" : ""}`} style={{justifyContent: 'flex-end'}}>
                <MenuItem
                    ariaLabel='Close menu'
                    style={{marginBottom: 'auto'}}
                    onClick={() => setIsVisible(!isVisible)}
                >
                    <FaTimes className="icon"/>
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        setSelectedPage("Settings")
                        toggleMenu()
                    }}
                    isActive={selectedPage === "Settings" && isOpen}
                    ariaLabel='Open settings'
                >
                    <FaCog className="icon"/>
                </MenuItem>
                <MenuItem onClick={homeStore.open} ariaLabel='Open home menu'
                          style={{border: "solid 0.1rem var(--secondary)"}}>
                    <FaHome className="icon"/>
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
    </>

}

interface FloatingSelectionProps<T extends string | number> {
    items: readonly T[]
    value: T
    Icon: IconType
    onChange: (val: T) => void
}

function FloatingSelection<T extends string | number>({items, onChange, value, Icon}: FloatingSelectionProps<T>) {

    const [open, setOpen] = useState(false)
    const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), {active: open})

    function selectItem(item: T) {
        onChange(item)
        setOpen(false)
    }

    return <div
        className={'column'}
        ref={ref}
        style={{
            alignItems: 'flex-end',
            gap: '0.5rem'
        }}
    >
        <IconButton
            onClick={() => setOpen(!open)}
            style={{
                zIndex: 2,
                borderRadius: '1rem',
                border: "solid 0.1rem var(--secondary)"
            }}
            toggled={open}
        >
            <Icon size={18}/>
        </IconButton>
        {open &&
            <div
                className={s['floating-selection-card']}
                style={{
                    maxHeight: '75vh'
                }}
            >
                {items.map(ins =>
                    <button
                        className={`${s['floating-selection-card-item']}`}
                        style={value === ins ? {backgroundColor: 'var(--accent)', color: "var(--accent-text)"} : {}}
                        key={ins}
                        onClick={() => selectItem(ins)}
                    >
                        {ins}
                    </button>
                )}
            </div>
        }
    </div>
}
