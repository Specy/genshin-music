import {APP_NAME} from "$config"
import Color from "color"
import {AppButton} from "$cmp/shared/Inputs/AppButton"
import Memoized, {MemoizedIcon} from "$cmp/shared/Utility/Memoized"
import {useTheme} from "$lib/Hooks/useTheme"
import {VsrgHitObject, VsrgSong, VsrgTrack} from "$lib/Songs/VsrgSong"
import {useEffect, useState} from "react"
import {FaCog, FaMinus, FaPlus, FaStepBackward, FaStepForward} from "react-icons/fa"
import {Theme} from "$stores/ThemeStore/ThemeProvider"
import {VsrgComposerKeyboard} from "./VsrgComposerKeyboard"
import {VsrgTrackSettings} from "./VsrgTrackSettings"
import {Row} from "$cmp/shared/layout/Row";

interface VsrgTopProps {
    vsrg: VsrgSong
    selectedTrack: number
    isHorizontal: boolean
    onTrackAdd: () => void
    onTrackDelete: (index: number) => void
    onTrackSelect: (index: number) => void
    onTrackChange: (track: VsrgTrack, index: number) => void
    onNoteSelect: (note: number) => void
    onBreakpointChange: (remove: boolean) => void
    onBreakpointSelect: (index: -1 | 1) => void
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
                            onBreakpointChange,
                            onBreakpointSelect,
                            lastCreatedHitObject,
                            selectedHitObject,
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
        {children}
        <div className={`vsrg-top-right ${lastCreatedHitObject !== null ? 'vsrg-top-right-disabled' : ''}`}>
            {isTrackSettingsOpen &&
                <VsrgTrackSettings
                    track={currentTrack}
                    onSave={() => setIsTrackSettingsOpen(false)}
                    onDelete={() => onTrackDelete(selectedTrack)}
                    onChange={(track) => onTrackChange(track, selectedTrack)}
                />
            }
            <Row align={'center'} className="vsrg-breakpoints-buttons" style={{marginBottom: '0.4rem'}}>
                <AppButton style={{marginLeft: 0}} onClick={() => onBreakpointSelect(-1)}>
                    <MemoizedIcon icon={FaStepBackward}/>
                </AppButton>
                <AppButton onClick={() => onBreakpointChange(true)}>
                    <MemoizedIcon icon={FaMinus}/>
                </AppButton>
                <AppButton onClick={() => onBreakpointChange(false)}>
                    <MemoizedIcon icon={FaPlus}/>
                </AppButton>
                <AppButton onClick={() => onBreakpointSelect(1)}>
                    <MemoizedIcon icon={FaStepForward}/>
                </AppButton>
            </Row>
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

                <div style={{width: '100%', height: '1.4rem'}}>

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
                    style={{marginTop: 'auto', padding: '0.3rem'}}
                >
                    <FaPlus size={16} color='var(--icon-color)'/>
                </AppButton>
            </div>
            <VsrgComposerKeyboard
                elements={keyboardElements}
                selected={selectedHitObject?.notes}
                perRow={APP_NAME === "Sky" ? 5 : 7}
                onClick={onNoteSelect}
            />
        </div>
    </>
}

interface TrackSelectorProps {
    track: VsrgTrack
    selected: boolean
    theme: Theme
    onSettingsClick: () => void
    onTrackClick: () => void
}

function TrackSelector({track, selected, theme, onSettingsClick, onTrackClick}: TrackSelectorProps) {
    const [selectedColor, setSelectedColor] = useState({
        background: 'var(--primary)',
        text: 'var(--primary-text)'
    })
    const [color, setColor] = useState({
        background: 'var(--primary)',
        text: 'var(--primary-text)'
    })
    useEffect(() => {
        const themeColor = theme.get('primary')
        const mixed = themeColor.mix(new Color(track.color), 0.3)
        setSelectedColor({
            background: mixed.toString(),
            text: mixed.isDark() ? 'var(--text-light)' : 'var(--text-dark)'
        })
        const color = new Color(track.color)
        setColor({
            background: color.toString(),
            text: color.isDark() ? 'rgb(220 219 216)' : 'rgb(55 55 55)'
        })
    }, [theme, track.color])
    return <>
        <div
            className="vsrg-track row-centered"
            style={{
                backgroundColor: selected ? selectedColor.background : 'var(--primary)',
                color: selected ? selectedColor.text : 'var(--primary-text)',
            }}
            onClick={onTrackClick}
        >
            <span
                className="text-ellipsis"
                style={{
                    color: selected ? selectedColor.text : 'var(--text-color)',
                    paddingLeft: '0.6rem',
                    paddingRight: '0.2rem',
                    flex: 1
                }}
            >
                {track.instrument.alias || track.instrument.name}
            </span>
            <AppButton
                onClick={() => selected && onSettingsClick()}
                style={{backgroundColor: color.background}}
                className='vsrg-track-left flex-centered'
            >
                {selected &&
                    <FaCog color={color.text}/>
                }
            </AppButton>
        </div>
    </>
}
