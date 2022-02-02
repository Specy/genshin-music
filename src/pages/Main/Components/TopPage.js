import { speedChangers } from "appConfig"
import Memoized from "components/Memoized";
import { FaSyncAlt, FaStop } from "react-icons/fa";
import { memo } from "react";

export default memo(function TopPage({eventType,stop,restart,sliderState, handleSliderEvent,handleSpeedChanger,speedChanger,approachingScore }) {
    return <div className="upper-right">
        {eventType === 'approaching' &&
            <Score data={approachingScore} />
        }
        <div className="slider-wrapper">
            <button className="song-button" onClick={stop}>
                <Memoized>
                    <FaStop />
                </Memoized>
            </button>
            <input
                type="range"
                className="slider"
                min={0}
                onChange={handleSliderEvent}
                max={sliderState.size}
                value={sliderState.position}
            ></input>
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
    return prev.eventType === next.eventType && prev.speedChanger === next.speedChanger 
        && prev.approachingScore === next.approachingScore && prev.sliderState === next.sliderState
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