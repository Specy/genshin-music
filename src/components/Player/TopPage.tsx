import { SPEED_CHANGERS } from "appConfig"
import Memoized from "components/Memoized";
import { FaSyncAlt, FaStop } from "react-icons/fa";
import { memo, useEffect, useState, useRef, ChangeEvent } from "react";
import { PlayerStore } from "stores/PlayerStore";
import { SliderStore } from "stores/SongSliderStore";
import { observe } from "mobx";
import { BsTriangleFill } from "react-icons/bs";
import './Track.css'
import { AppButton } from "components/AppButton";
import { ApproachingScore } from "types/GeneralTypes";
import { clamp } from "lib/Tools";
import { Tooltip } from 'components/Tooltip'
interface TopPageProps {
    restart: () => void
    handleSpeedChanger: (event: ChangeEvent<HTMLSelectElement>) => void
    speedChanger: typeof SPEED_CHANGERS[number]
    approachingScore: ApproachingScore
    hasSong: boolean
}
export default memo(function TopPage({ restart, handleSpeedChanger, speedChanger, approachingScore, hasSong }: TopPageProps) {
    const [sliderState, setSliderState] = useState(SliderStore.state.data)
    const [songData, setSongData] = useState(PlayerStore.state.data)
    const [selectedThumb, setSelectedThumb] = useState<'left' | 'right' | null>(null)
    const [inputDimension, setInputDimension] = useState({
        x: 0,
        width: 0
    })
    const thumb1 = useRef<HTMLDivElement>(null)
    const thumb2 = useRef<HTMLDivElement>(null)
    const slider = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const dispose = observe(SliderStore.state, (newState) => {
            setSliderState(newState.object.data)
        })
        const dispose2 = observe(PlayerStore.state, (newState2) => {
            setSongData(newState2.object.data)
        })
        return () => {
            dispose();
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
            if (value - sliderState.end < -1) SliderStore.setPosition(value)
        } else {
            if (value - sliderState.position > 1) SliderStore.setState({ end: value })
        }
    }
    const left = sliderState.size !== 0 ? sliderState.position / sliderState.size * 100 : 0
    const right = sliderState.size !== 0 ? sliderState.end / sliderState.size * 100 : 100
    return <div className="upper-right" style={!hasSong ? { display: 'none' } : {}} >
        {songData.eventType === 'approaching' &&
            <Score {...approachingScore} />
        }
        <div className="slider-wrapper">
            <AppButton className="slider-button" onClick={PlayerStore.reset} tooltip='Stop' ariaLabel="Stop song">
                <Memoized>
                    <FaStop />
                </Memoized>
            </AppButton>
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

            <AppButton className="slider-button" onClick={restart} tooltip='Restart' ariaLabel="Restart song">
                <Memoized>
                    <FaSyncAlt />
                </Memoized>
            </AppButton>
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
                <Tooltip style={{ transform: 'translateY(2px) translateX(-1.1rem)'}}>
                    Change speed
                </Tooltip>
            </div>
        </div>
    </div>
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
