import {VSRG_SCORE_COLOR_MAP} from "$config";
import {useVsrgScore} from "$lib/Hooks/useVsrgScore";
import {memo} from "react";
import s from "./VsrgPlayerScore.module.css"
import {useTranslation} from "react-i18next";


function _VsrgPlayerScore() {
    const score = useVsrgScore()
    const {t} = useTranslation('vsrg_player')
    return <>
        <div className={s['vsrg-player-score']}>
            <div className="column space-between">
                <div>
                    {score.score}
                </div>
            </div>
        </div>
        {score.scoreVisible &&
            <div className={`${s['vsrg-final-score']} box-shadow`}>
                <ScoreElement text={t('amazing')} number={score.amazing} color={VSRG_SCORE_COLOR_MAP.amazing} gridArea='a'/>
                <ScoreElement text={t('perfect')} number={score.perfect} color={VSRG_SCORE_COLOR_MAP.perfect} gridArea='b'/>
                <ScoreElement text={t('great')}  number={score.great} color={VSRG_SCORE_COLOR_MAP.great} gridArea='c'/>
                <ScoreElement text={t('good')}  number={score.good} color={VSRG_SCORE_COLOR_MAP.good} gridArea='d'/>
                <ScoreElement text={t('miss')}  number={score.miss} color={VSRG_SCORE_COLOR_MAP.miss} gridArea='e'/>
                <div className="row space-between" style={{width: '100%', alignItems: 'center', gridArea: 'f'}}>
                    <div style={{fontSize: '1.2rem'}}>
                        {t('combo')}: {score.combo}x
                    </div>
                    <div className='flex' style={{fontSize: '1.2rem', alignItems: 'center'}}>
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

function ScoreElement({text, color, number, gridArea}: ScoreElementProps) {
    return <div className={`${s['floating-score-element']} row`} style={{gridArea}}>
        <span style={{color}}>
            {text}
        </span>
        <span>
            {number}
        </span>
    </div>
}
