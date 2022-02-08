import { speedChangers } from "appConfig"
import Memoized from "components/Memoized";
import { FaSyncAlt, FaStop } from "react-icons/fa";
import { memo, useEffect, useState } from "react";
import { SongStore } from "stores/SongStore";
import { SliderStore } from "stores/SongSliderStore";
import { observe } from "mobx";
export default memo(function TopPage({restart,handleSpeedChanger,speedChanger,approachingScore, hasSong }) {
    const [sliderState, setSliderState] = useState(SliderStore.state.data)
    const [songData, setSongData] = useState(SongStore.state.data)
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
        SliderStore.setPosition(Number(event.target.value))
    }
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
                <div className="slider-current" style={{width: `${sliderState.current / sliderState.size * 100}%`}}/>
                <input
                    type="range"
                    className="slider"
                    min={0}
                    onChange={handleSliderEvent}
                    max={sliderState.size}
                    value={sliderState.position}
                />
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