import { APP_NAME } from "appConfig"
import Color from "color"
import { AppButton } from "components/Inputs/AppButton"
import { useTheme } from "lib/Hooks/useTheme"
import { VsrgHitObject, VsrgSong, VsrgTrack } from "lib/Songs/VsrgSong"
import { useEffect, useState } from "react"
import { FaCog, FaPlus } from "react-icons/fa"
import { ThemeStoreClass } from "stores/ThemeStore"
import { VsrgKeyboard } from "./VsrgKeyboard"
import { VsrgTrackSettings } from "./VsrgTrackSettings"

interface VsrgTopProps {
    vsrg: VsrgSong
    selectedTrack: number
    isHorizontal: boolean
    onTrackAdd: () => void
    onTrackDelete: (index: number) => void
    onTrackSelect: (index: number) => void
    onTrackChange: (track: VsrgTrack, index: number) => void
    onNoteSelect: (note: number) => void
    children: React.ReactNode
    lastCreatedHitObject: VsrgHitObject | null
    selectedHitObject: VsrgHitObject | null
}

export function VsrgTop({
    vsrg,
    selectedTrack,
    children,
    onTrackAdd,
    onTrackChange,
    onTrackSelect,
    onTrackDelete,
    onNoteSelect,
    lastCreatedHitObject,
    selectedHitObject
}: VsrgTopProps) {
    const [theme] = useTheme()
    const [keyboardElements, setKeyboardElements] = useState<number[]>([])
    const [isTrackSettingsOpen, setIsTrackSettingsOpen] = useState(false)
    const currentTrack = vsrg.tracks[selectedTrack]
    useEffect(() => {
        setKeyboardElements(
            new Array(APP_NAME === "Sky" ? 15 : 21).fill(0).map((_, index) => index)
        )
    }, [])
    return <>
        <div className={`vsrg-top`}>
            {children}
            <div className={`vsrg-top-right ${lastCreatedHitObject !== null ? 'vsrg-top-right-disabled' : ''}`} >
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
                    selected={selectedHitObject?.notes}
                    perRow={APP_NAME === "Sky" ? 5 : 7}
                    onClick={onNoteSelect}
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
