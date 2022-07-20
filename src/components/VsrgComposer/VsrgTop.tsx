import { APP_NAME } from "appConfig"
import Color from "color"
import { AppButton } from "components/Inputs/AppButton"
import { useTheme } from "lib/Hooks/useTheme"
import { VsrgSong, VsrgTrack } from "lib/Songs/VsrgSong"
import { useEffect, useState } from "react"
import { FaCog, FaPlus } from "react-icons/fa"
import { ThemeStoreClass } from "stores/ThemeStore"
import { VsrgKeyboard, VsrgKeyboardElement } from "./VsrgKeyboard"
import { VsrgTrackSettings } from "./VsrgTrackSettings"

interface VsrgTopProps {
    vsrg: VsrgSong
    selectedTrack: number
    onTrackAdd: () => void
    onTrackDelete: (index: number) => void
    onTrackSelect: (index: number) => void
    onTrackChange: (track: VsrgTrack, index: number) => void
    children: React.ReactNode
}

export function VsrgTop({
    vsrg,
    selectedTrack,
    children,
    onTrackAdd,
    onTrackChange,
    onTrackSelect,
    onTrackDelete
}: VsrgTopProps) {
    const [theme] = useTheme()
    const [keyboardElements, setKeyboardElements] = useState<VsrgKeyboardElement[]>([])
    const [isTrackSettingsOpen, setIsTrackSettingsOpen] = useState(false)
    const currentTrack = vsrg.tracks[selectedTrack]
    useEffect(() => {
        setKeyboardElements(
            new Array(APP_NAME === "Sky" ? 15 : 21).fill(0).map((_, index) => ({
                index,
                selected: false
            }))
        )
    }, [])
    return <>
        <div className="vsrg-top">
            {children}
            <div className="vsrg-top-right">
                {isTrackSettingsOpen &&
                    <VsrgTrackSettings
                        track={currentTrack}
                        onSave={() => setIsTrackSettingsOpen(false)}
                        onDelete={() => onTrackDelete(selectedTrack)}
                        onChange={(track) => onTrackChange(track, selectedTrack)}
                    />
                }
                <div className="vsrg-track-wrapper column">
                    {vsrg.tracks.map((track, index) =>
                        <TrackSelector
                            key={index}
                            track={track}
                            selected={index === selectedTrack}
                            theme={theme}
                            onSettingsClick={() => setIsTrackSettingsOpen(!isTrackSettingsOpen)}
                            onTrackClick={() => onTrackSelect(index)}
                        />
                    )}

                    <div style={{ width: '100%', height: '1.4rem' }}>

                    </div>
                    <AppButton
                        onClick={(e) => {
                            setTimeout(() => {
                                onTrackAdd()
                                // @ts-ignore
                                e.target?.scrollIntoView()
                            }, 50)
                        }}
                        ariaLabel='Add new instrument'
                        className="flex-centered"
                        style={{ marginTop: 'auto', padding: '0.3rem' }}
                    >
                        <FaPlus size={16} color='var(--icon-color)' />
                    </AppButton>
                </div>
                <VsrgKeyboard
                    elements={keyboardElements}
                    perRow={APP_NAME === "Sky" ? 5 : 7}
                    onClick={(index: number) => {
                        keyboardElements[index].selected = !keyboardElements[index].selected
                        setKeyboardElements([...keyboardElements])
                    }}
                />
            </div>
        </div>
    </>
}
interface TrackSelectorProps {
    track: VsrgTrack
    selected: boolean
    theme: ThemeStoreClass
    onSettingsClick: () => void
    onTrackClick: () => void
}

function TrackSelector({ track, selected, theme, onSettingsClick, onTrackClick }: TrackSelectorProps) {
    const [selectedColor, setSelectedColor] = useState({
        background: 'var(--primary)',
        text: 'var(--text-color)'
    })

    useEffect(() => {
        const themeColor = theme.get('primary')
        const mixed = themeColor.mix(new Color(track.color), 0.3)
        setSelectedColor({
            background: mixed.toString(),
            text: 'var(--primary-text)'
        })
    }, [theme, track.color])
    return <>
        <div
            className="vsrg-track column flex-centered"
            style={{
                backgroundColor: selected ? selectedColor.background : 'var(--primary)',
                color: selected ? selectedColor.text : 'var(--text-color)',
            }}
            onClick={onTrackClick}
        >
            {track.alias || track.instrument}
            <div className="vsrg-track-color" style={{ backgroundColor: track.color }} />
            {selected &&
                <AppButton
                    onClick={onSettingsClick}
                    className="vsrg-track-settings flex-centered"
                >
                    <FaCog />
                </AppButton>

            }
        </div>
    </>
}
