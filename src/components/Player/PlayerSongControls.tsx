import { DEFAULT_DOM_RECT, SPEED_CHANGERS } from "appConfig"
import Memoized from "components/Utility/Memoized";
import { FaSyncAlt, FaStop } from "react-icons/fa";
import { memo, useEffect, useState, useRef, ChangeEvent } from "react";
import { playerStore } from "stores/PlayerStore";
import { playerControlsStore } from "stores/PlayerControlsStore";
import { BsTriangleFill } from "react-icons/bs";
import './Track.css'
import { clamp } from "lib/Utilities";
import { hasTooltip, Tooltip } from 'components/Utility/Tooltip'
import { SheetFrame } from "components/SheetVisualizer/SheetFrame";
import { IconButton } from "components/Inputs/IconButton";
import { useTheme } from "lib/Hooks/useTheme";
import { useObservableObject } from "lib/Hooks/useObservable";
import { GiMetronome } from "react-icons/gi";
import { AppButton } from "components/Inputs/AppButton";
interface PlayerSongControlsProps {
    onRestart: () => void
    onRawSpeedChange: (event: ChangeEvent<HTMLSelectElement>) => void
    onToggleRecordAudio: (override: boolean) => void
    onToggleMetronome: () => void
    speedChanger: typeof SPEED_CHANGERS[number]
    hasSong: boolean
    isMetronomePlaying: boolean
    isRecordingAudio: boolean
}

function _PlayerSongControls({ onRestart, onRawSpeedChange, speedChanger, hasSong, isMetronomePlaying, onToggleMetronome, isRecordingAudio, onToggleRecordAudio }: PlayerSongControlsProps) {
    const sliderState = useObservableObject(playerControlsStore.state)
    const songData = useObservableObject(playerStore.state)
    const [selectedThumb, setSelectedThumb] = useState<'start' | 'end' | null>(null)
    const [theme] = useTheme()
    const [inputDimension, setInputDimension] = useState(DEFAULT_DOM_RECT)
    const thumb1 = useRef<HTMLDivElement>(null)
    const thumb2 = useRef<HTMLDivElement>(null)
    const slider = useRef<HTMLDivElement>(null)
    useEffect(() => {
        //TODO remove the dependency and instead use the callback for the set state
        if (selectedThumb === null) return
        function resetSelection() {
            if (selectedThumb !== null) setSelectedThumb(null)
        }
        window.addEventListener('pointerup', resetSelection)
        window.addEventListener('blur', resetSelection)
        return () => {
            window.removeEventListener('pointerup', resetSelection)
            window.removeEventListener('blur', resetSelection)
        }
    }, [selectedThumb])

    const handleSliderClick = (event: React.PointerEvent<HTMLDivElement>) => {
        if (slider.current && thumb1.current && thumb2.current) {
            const size = slider.current.getBoundingClientRect()
            const offset = event.clientY
            const thumb1Position = thumb1.current.getBoundingClientRect().y
            const thumb2Position = thumb2.current.getBoundingClientRect().y
            const left = Math.abs(thumb1Position - offset)
            const right = Math.abs(thumb2Position - offset)
            setInputDimension(size)
            const currentThumb = left >= right ? 'end' : 'start'
            setSelectedThumb(left >= right ? 'end' : 'start')
            handleSliderMove(event, currentThumb)
        }
    }
    function handleSliderLeave() {
        setSelectedThumb(null)
    }
    const handleSliderMove = (event: React.PointerEvent<HTMLDivElement>, override?: 'start' | 'end') => {
        if (selectedThumb === null && !override) return
        const currentThumb = override || selectedThumb
        const sliderSize = inputDimension.height
        const sliderOffset = inputDimension.y
        const eventPosition = event.clientY - sliderOffset
        //reverse the order from top to bottom
        const value = clamp(Math.round((1 - eventPosition / sliderSize) * sliderState.size), 0, sliderState.size)
        if (currentThumb === 'start') {
            if (value - sliderState.end < -1) playerControlsStore.setPosition(value)
        } else {
            if (value - sliderState.position > 1) playerControlsStore.setState({ end: value })
        }
    }
    const start = sliderState.size !== 0 ? sliderState.position / sliderState.size * 100 : 0
    const end = sliderState.size !== 0 ? sliderState.end / sliderState.size * 100 : 100
    return <>
        {songData.eventType === 'approaching' &&
            <Score />
        }
        <div className='column player-right-controls' >
            {//this div is here to keep an empty element to keep the styling consistent
            }
            <div>
                {songData.eventType !== 'approaching' &&
                    <AppButton
                        toggled={isRecordingAudio}
                        onClick={() => onToggleRecordAudio(!isRecordingAudio)}
                    >
                        {isRecordingAudio ? "Finish recording" : "Record audio"}
                    </AppButton>
                }
            </div>


            <div className="slider-wrapper column" style={!hasSong ? { display: 'none' } : {}} >
                <div className="row" style={{ width: '100%' }}>

                    <div className={`${hasTooltip(true)} row`} style={{ marginRight: '0.4rem', flex: 1}}>
                        <select
                            className='slider-select'
                            onChange={onRawSpeedChange}
                            value={speedChanger.name}
                            style={{ backgroundImage: 'none' }}
                        >
                            <option disabled>Speed</option>
                            {SPEED_CHANGERS.map(e => {
                                return <option value={e.name} key={e.name}>
                                    {e.name}
                                </option>
                            })}
                        </select>
                        <Tooltip position="left">
                            Change speed
                        </Tooltip>
                    </div>
                    <IconButton
                        onClick={() => {
                            playerStore.reset()
                            playerControlsStore.clearPages()
                            playerControlsStore.resetScore()
                        }}
                        style={{flex: 1}}
                        tooltip='Stop'
                        ariaLabel="Stop song"

                    >
                        <Memoized>
                            <FaStop />
                        </Memoized>
                    </IconButton>
                </div>

                <div
                    className="slider-outer"
                    ref={slider}
                    onPointerUp={handleSliderLeave}
                    onPointerMove={handleSliderMove}
                    onPointerDown={handleSliderClick}
                >
                    <div className="slider-full">
                        <div
                            className="slider-current"
                            style={{ transform: `translateY(${(100 - sliderState.current / sliderState.size * 100).toFixed(1)}%)` }}
                        />
                    </div>
                    <div className="two-way-slider">

                        <div className="two-way-slider-thumb" style={{ bottom: `calc(${end}% - 18px)` }} ref={thumb2}>
                            <div style={{ fontSize: '0.8rem' }}>
                                {sliderState.end}
                            </div>
                            <Memoized>
                                <BsTriangleFill width={16} style={{ filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)' }} />
                            </Memoized>

                        </div>
                        <div className="two-way-slider-thumb" style={{ bottom: `calc(${start}% - 14px)` }} ref={thumb1}>
                            <div style={{ fontSize: '0.8rem' }}>
                                {sliderState.position}
                            </div>
                            <Memoized>
                                <BsTriangleFill width={16} style={{ filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)' }} />
                            </Memoized>
                        </div>
                    </div>
                </div>
                <IconButton onClick={onRestart} tooltip='Restart' ariaLabel="Restart song">
                    <Memoized>
                        <FaSyncAlt />
                    </Memoized>
                </IconButton>
            </div>

            <IconButton
                toggled={isMetronomePlaying}
                onClick={onToggleMetronome}
                className='metronome-button'
                ariaLabel='Toggle metronome'
            >
                <GiMetronome size={22} />
            </IconButton>
        </div>
        {sliderState.pages.length > 0 &&
            <div className="player-chunks-page">
                {sliderState.currentPage?.map((e, i) =>
                    <SheetFrame
                        key={i}
                        theme={theme}
                        selected={i === sliderState.currentChunkIndex}
                        chunk={e}
                        rows={3}
                        hasText={false}
                    />
                )}
            </div>
        }
    </>
}
export const PlayerSongControls = memo(_PlayerSongControls, (prev, next) => {
    return prev.speedChanger === next.speedChanger && prev.hasSong === next.hasSong && prev.isMetronomePlaying === next.isMetronomePlaying
        && prev.isRecordingAudio === next.isRecordingAudio
})



function _Score() {
    const { combo, score, correct, wrong } = useObservableObject(playerControlsStore.score)
    return <div className='approaching-accuracy'>
        <table>
            <tbody>
                <tr>
                    <td className='sc-2'>Accuracy</td>
                    <td className='sc-1'>{(correct / (correct + wrong - 1) * 100).toFixed(1)}%</td>
                </tr>
                <tr>
                    <td className='sc-2'>Score</td>
                    <td className='sc-1'>{score}</td>
                </tr>
                <tr>
                    <td className='sc-2'>Combo</td>
                    <td className='sc-1'>{combo}</td>
                </tr>
            </tbody>
        </table>
    </div>
}
const Score = memo(_Score, () => true)