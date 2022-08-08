import { useVsrgScore } from "lib/Hooks/useVsrgScore";
import { memo } from "react";





function _VsrgPlayerScore(){
    const score = useVsrgScore()
    return <>
        <div className="vsrg-player-score">
            <div className="column space-between">
                <div>
                    {score.score}
                </div>
                <div style={{fontSize: '1rem', textAlign:'end'}}>
                    {score.combo}x
                </div>
                
            </div>
        </div>
    </>
}


export const VsrgPlayerScore = memo(_VsrgPlayerScore, (p,n) => {
    return false
})