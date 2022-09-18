import { VSRG_SCORE_COLOR_MAP } from "$/Config";
import { useVsrgScore } from "$lib/Hooks/useVsrgScore";
import { memo } from "react";





function _VsrgPlayerScore() {
    const score = useVsrgScore()
    return <>
        <div className="vsrg-player-score">
            <div className="column space-between">
                <div>
                    {score.score}
                </div>
            </div>
        </div>
        {score.scoreVisible &&
            <div className="vsrg-final-score box-shadow">
                <ScoreElement text='Amazing' number={score.amazing} color={VSRG_SCORE_COLOR_MAP.amazing} gridArea='a' />
                <ScoreElement text='Perfect' number={score.perfect} color={VSRG_SCORE_COLOR_MAP.perfect} gridArea='b' />
                <ScoreElement text='Great' number={score.great} color={VSRG_SCORE_COLOR_MAP.great} gridArea='c' />
                <ScoreElement text='Good' number={score.good} color={VSRG_SCORE_COLOR_MAP.good} gridArea='d' />
                <ScoreElement text='Miss' number={score.miss} color={VSRG_SCORE_COLOR_MAP.miss} gridArea='e' />
                <div className="row space-between" style={{ width: '100%', alignItems: 'center', gridArea: 'f'}}>
                    <div style={{ fontSize: '1.2rem'}}>
                        Combo: {score.combo}x
                    </div>
                    <div className='flex' style={{ fontSize: '0.8rem', alignItems: 'center'}}>
                        {score.score}
                    </div>
                </div>
            </div>
        }
    </>
}
export const VsrgPlayerScore = memo(_VsrgPlayerScore, (p, n) => {
    return false
})
interface ScoreElementProps {
    number: number
    text: string
    color: string
    gridArea: string
}
function ScoreElement({ text, color, number, gridArea }: ScoreElementProps) {
    return <div className='row floating-score-element' style={{ gridArea }}>
        <span style={{ color }}>
            {text}
        </span>
        <span>
            {number}
        </span>
    </div>
}
