import { APP_NAME, DEFAULT_DOM_RECT, SPEED_CHANGERS } from "appConfig"
import Memoized from "components/Utility/Memoized";
import { FaSyncAlt, FaStop } from "react-icons/fa";
import { memo, useEffect, useState, useRef, ChangeEvent } from "react";
import { playerStore, subscribePlayer } from "stores/PlayerStore";
import { playerTopStore, subscribePlayerTopStore } from "stores/PlayerTopStore";
import { BsTriangleFill } from "react-icons/bs";
import './Track.css'
import { AppButton } from "components/Inputs/AppButton";
import { ApproachingScore } from "types/GeneralTypes";
import { clamp } from "lib/Utilities";
import { Tooltip } from 'components/Utility/Tooltip'
import { SheetFrame } from "components/SheetVisualizer/SheetFrame";
import { IconButton } from "components/Inputs/IconButton";
import { useTheme } from "lib/Hooks/useTheme";
interface TopPageProps {
    restart: () => void
    handleSpeedChanger: (event: ChangeEvent<HTMLSelectElement>) => void
    speedChanger: typeof SPEED_CHANGERS[number]
    approachingScore: ApproachingScore
    hasSong: boolean
}

export default memo(function TopPage({ restart, handleSpeedChanger, speedChanger, approachingScore, hasSong }: TopPageProps) {
    const [sliderState, setSliderState] = useState(playerTopStore.state.data)
    const [songData, setSongData] = useState(playerStore.state.data)
    const [selectedThumb, setSelectedThumb] = useState<'left' | 'right' | null>(null)
    const [theme] = useTheme()
    const [inputDimension, setInputDimension] = useState(DEFAULT_DOM_RECT)
    const thumb1 = useRef<HTMLDivElement>(null)
    const thumb2 = useRef<HTMLDivElement>(null)
    const slider = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const dispose = subscribePlayerTopStore(setSliderState)
        const dispose2 = subscribePlayer(setSongData)
        return () => {
            dispose()
            dispose2()
        }
    }, [])
    useEffect(() => {
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
            const x = event.clientX
            const thumb1X = thumb1.current.getBoundingClientRect().x
            const thumb2X = thumb2.current.getBoundingClientRect().x
            const left = Math.abs(thumb1X - x)
            const right = Math.abs(thumb2X - x)
            setInputDimension(size)
            const currentThumb = left >= right ? 'right' : 'left'
            setSelectedThumb(left >= right ? 'right' : 'left')
            handleSliderMove(event, currentThumb)
        }
    }
    function handleSliderLeave() {
        setSelectedThumb(null)
    }
    const handleSliderMove = (event: React.PointerEvent<HTMLDivElement>, override?: 'left' | 'right') => {
        if (selectedThumb === null && !override) return
        const currentThumb = override || selectedThumb
        const sliderX = inputDimension.x
        const sliderWidth = inputDimension.width
        const x = event.clientX - sliderX
        const value = clamp(Math.round(x / sliderWidth * sliderState.size), 0, sliderState.size)
        if (currentThumb === 'left') {
            if (value - sliderState.end < -1) playerTopStore.setPosition(value)
        } else {
            if (value - sliderState.position > 1) playerTopStore.setState({ end: value })
        }
    }
    const left = sliderState.size !== 0 ? sliderState.position / sliderState.size * 100 : 0
    const right = sliderState.size !== 0 ? sliderState.end / sliderState.size * 100 : 100
    return <>
        {songData.eventType === 'approaching' &&
            <Score
                {...approachingScore}
            />
        }
        <div className="upper-right" style={!hasSong ? { display: 'none' } : {}} >
            <div className="slider-wrapper">
                <IconButton onClick={playerStore.reset} tooltip='Stop' ariaLabel="Stop song">
                    <Memoized>
                        <FaStop />
                    </Memoized>
                </IconButton>
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
                            style={{ transform: `translateX(-${(100 - sliderState.current / sliderState.size * 100).toFixed(1)}%)` }}
                        />
                    </div>
                    <div className="two-way-slider">
                        <div className="two-way-slider-thumb" style={{ marginLeft: `calc(${left}% - 8px)` }} ref={thumb1}>
                            <Memoized>
                                <BsTriangleFill width={16} style={{ filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)' }} />
                            </Memoized>
                            <div style={{ fontSize: '0.8rem' }}>
                                {sliderState.position}
                            </div>
                        </div>
                        <div className="two-way-slider-thumb" style={{ marginLeft: `calc(${right}% - 8px)` }} ref={thumb2}>
                            <Memoized>
                                <BsTriangleFill width={16} style={{ filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)' }} />
                            </Memoized>
                            <div style={{ fontSize: '0.8rem' }}>
                                {sliderState.end}
                            </div>
                        </div>
                    </div>
                </div>
                <IconButton onClick={restart} tooltip='Restart' ariaLabel="Restart song">
                    <Memoized>
                        <FaSyncAlt />
                    </Memoized>
                </IconButton>
                <div className="has-tooltip">
                    <select
                        className='slider-select'
                        onChange={handleSpeedChanger}
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
                    <Tooltip >
                        Change speed
                    </Tooltip>
                </div>
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
        </div>
    </>
}, (prev, next) => {
    return prev.speedChanger === next.speedChanger
        && prev.approachingScore === next.approachingScore && prev.hasSong === next.hasSong
})



function Score({ combo, score, correct, wrong }: ApproachingScore) {
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
