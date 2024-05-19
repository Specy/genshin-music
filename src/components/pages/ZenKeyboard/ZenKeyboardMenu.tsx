import useClickOutside from "$lib/Hooks/useClickOutside"
import {homeStore} from "$stores/HomeStore"
import {FaBars, FaCog, FaHome, FaTimes} from "react-icons/fa"
import {MenuPanel, MenuPanelWrapper} from "$cmp/shared/Menu/MenuPanel"
import {MenuButton, MenuItem} from "$cmp/shared/Menu/MenuItem"
import {useMemo, useState} from 'react'
import {ZenKeyboardSettingsDataType} from "$lib/BaseSettings"
import {SettingUpdate, SettingVolumeUpdate} from "$types/SettingsPropriety"
import {SettingsPane} from "$cmp/shared/Settings/SettingsPane"
import {MemoizedIcon} from "$cmp/shared/Utility/Memoized"
import {IconButton} from "$cmp/shared/Inputs/IconButton";
import {INSTRUMENTS, PITCHES} from "$config";
import {MdPiano} from "react-icons/md";
import {IoMdMusicalNote} from "react-icons/io";
import {GiMetronome} from "react-icons/gi";
import {MenuContextProvider, MenuSidebar} from "$cmp/shared/Menu/MenuContent";
import {useTranslation} from "react-i18next";
import {FloatingSelection} from "$cmp/shared/FloatingSelection/FloatingSelection";

interface ZenKeyboardMenuProps {
    settings: ZenKeyboardSettingsDataType
    isMetronomePlaying: boolean
    handleSettingChange: (setting: SettingUpdate) => void
    onVolumeChange: (data: SettingVolumeUpdate) => void
    setIsMetronomePlaying: (val: boolean) => void
}

const pitchesLabels = PITCHES.map(p => ({value: p, label: p}))



export function ZenKeyboardMenu({
                                    settings,
                                    handleSettingChange,
                                    onVolumeChange,
                                    isMetronomePlaying,
                                    setIsMetronomePlaying
                                }: ZenKeyboardMenuProps) {
    const {t} = useTranslation(['menu', 'settings', 'instruments'])
    const [selectedPage, setSelectedPage] = useState("Settings")
    const [isOpen, setIsOpen] = useState(true)
    const [isVisible, setIsVisible] = useState(false)
    const menuRef = useClickOutside<HTMLDivElement>(() => {
        setIsVisible(false)
    }, {ignoreFocusable: true, active: selectedPage !== ""})
    const instrumentLabels = useMemo(() => INSTRUMENTS.map(i => ({value: i, label: t(`instruments:${i}`)})), [t])
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
            ariaLabel={t('settings:toggle_metronome')}
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
                items={pitchesLabels}
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
                items={instrumentLabels}
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
        <MenuContextProvider
            open={isOpen}
            setOpen={setIsOpen}
            current={selectedPage}
            setCurrent={setSelectedPage}
            ref={menuRef}
            visible={isVisible}
        >
            <div
                className="hamburger-top"
                onClick={() => setIsVisible(!isVisible)}
            >
                <MemoizedIcon icon={FaBars}/>
            </div>
            <MenuSidebar style={{justifyContent: 'flex-end'}}>
                <MenuButton
                    ariaLabel={t('toggle_menu')}
                    style={{marginBottom: 'auto'}}
                    onClick={() => setIsVisible(!isVisible)}
                >
                    <MemoizedIcon icon={FaTimes} className={'icon'}/>
                </MenuButton>
                <MenuItem
                    id={"Settings"}
                    ariaLabel={t('open_settings_menu')}
                >
                    <MemoizedIcon icon={FaCog} className={'icon'}/>
                </MenuItem>
                <MenuButton
                    onClick={homeStore.open}
                    ariaLabel={t('open_home_menu')}
                    style={{border: "solid 0.1rem var(--secondary)"}}
                >
                    <MemoizedIcon icon={FaHome} className={'icon'}/>
                </MenuButton>
            </MenuSidebar>
            <MenuPanelWrapper>
                <MenuPanel title={t('settings')} id="Settings">
                    <SettingsPane
                        settings={settings}
                        onUpdate={handleSettingChange}
                        changeVolume={onVolumeChange}
                    />
                </MenuPanel>
            </MenuPanelWrapper>
        </MenuContextProvider>
    </>

}
