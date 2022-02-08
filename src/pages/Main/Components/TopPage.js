import { speedChangers } from "appConfig"
import Memoized from "components/Memoized";
import { FaSyncAlt, FaStop } from "react-icons/fa";
import { memo, useEffect, useState } from "react";
import { SongStore } from "stores/SongStore";
import { SliderStore } from "stores/SongSliderStore";
import { observe } from "mobx";
import { BsTriangleFill } from "react-icons/bs";
import './Track.css'
export default memo(function TopPage({restart,handleSpeedChanger,speedChanger,approachingScore, hasSong }) {
    const [sliderState, setSliderState] = useState(SliderStore.state.data)
    const [sliderPosition, setSliderPosition] = useState(0)
    const [songData, setSongData] = useState(SongStore.state.data)
    const [selectedThumb, setSelectedThumb] = useState(null)
    useEffect(() => {
        const dispose = observe(SliderStore.state,(newState) => {
            setSliderState(newState.object.data)
        })
        const dispose2 = observe(SongStore.state,(newState2) => {
            setSongData(newState2.object.data)
        })
        return () => {dispose(); dispose2()}
    },[])
    const handleSliderEvent = (event) => {
        const value = Number(event.target.value)
        let currentThumb = selectedThumb
        if(currentThumb === null){
            const left = Math.abs(sliderState.position - value)
            const right = Math.abs(sliderState.end - value)
            currentThumb = left >= right ? 'right' : 'left'
            setSelectedThumb(currentThumb)
        }
        if(currentThumb === 'left'){
            if(value - sliderState.end < -1) SliderStore.setPosition(value)
        }else{
            if(value - sliderState.position > 1) SliderStore.setState({end: value})
        }
        setSliderPosition(value)
    }
    const handleSliderClick = (event) => {
        setSelectedThumb(null)
    }
    const left = sliderState.size !== 0 ? sliderState.position / sliderState.size * 100 : 0
    const right = sliderState.size !== 0 ? sliderState.end / sliderState.size * 100 : 100
    return <div className="upper-right" style={!hasSong ? {display:'none'} : {}} >
        {songData.eventType === 'approaching' &&
            <Score data={approachingScore} />
        }
        <div className="slider-wrapper">
            <button className="song-button" onClick={SongStore.reset}>
                <Memoized>
                    <FaStop />
                </Memoized>
            </button>
            <div className="slider-outer">
                <div className="slider-full">
                    <div className="slider-current" style={{width: `${sliderState.current / sliderState.size * 100}%`}}/>
                </div>
                <input
                    type="range"
                    className="hidden-slider"
                    min={0}
                    onChange={handleSliderEvent}
                    onPointerUp={handleSliderClick}
                    max={sliderState.size}
                    value={sliderPosition}
                />
                <div className="two-way-slider">
                    <div className="two-way-slider-thumb" style={{marginLeft: `calc(${left}% - 8px)`}}>
                        <BsTriangleFill width={16}/>
                        <div style={{fontSize: '0.8rem'}}>
                            {sliderState.position}
                        </div>
                    </div>
                    <div className="two-way-slider-thumb" style={{marginLeft: `calc(${right}% - 8px)`}}>
                        <BsTriangleFill width={16}/>
                        <div style={{fontSize: '0.8rem'}}>
                            {sliderState.end}
                        </div>
                    </div>
                </div>
            </div>

            <button className="song-button" onClick={restart}>
                <Memoized>
                    <FaSyncAlt />
                </Memoized>
            </button>
            <select
                className='slider-select'
                onChange={handleSpeedChanger}
                value={speedChanger.name}
            >
                <option disabled>Speed</option>
                {speedChangers.map(e => {
                    return <option value={e.name} key={e.name}>
                        {e.name}
                    </option>
                })}
            </select>
        </div>
    </div>
},(prev,next) => {
    return prev.speedChanger === next.speedChanger 
        && prev.approachingScore === next.approachingScore && prev.hasSong === next.hasSong
})


function Score(props) {
    const { combo, score, correct, wrong } = props.data
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