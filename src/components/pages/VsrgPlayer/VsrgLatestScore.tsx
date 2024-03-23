import {VSRG_SCORE_COLOR_MAP} from "$config"
import {memo, useEffect, useRef, useState} from "react"
import {subscribeVsrgLatestScore, vsrgPlayerStore} from "$stores/VsrgPlayerStore"
import {Timer} from "$types/GeneralTypes"
import s from "./VsrgPlayerScore.module.css"

const defaultStyle = {
    transform: 'rotate(0) scale(1)',
    color: 'var(--primary-text)'
}

function _VsrgPlayerLatestScore() {
    const [data, setData] = useState(vsrgPlayerStore.score.lastScore)
    const ref = useRef<HTMLDivElement>(null)
    const [style, setStyle] = useState(defaultStyle)
    useEffect(() => {
        let lastTimeout: Timer = 0
        const dispose = subscribeVsrgLatestScore((d) => {
            setData(d)
            clearTimeout(lastTimeout)
            lastTimeout = setTimeout(() => {
                setData({...d, type: ''})
            }, 800)
        })
        return () => {
            dispose()
            clearTimeout(lastTimeout)
        }
    }, [])
    useEffect(() => {
        const current = ref.current
        if (!current) return
        const angle = Math.floor(Math.random() * 25 - 12.5)
        current.animate([
            style,
            {transform: `rotate(${angle}deg) scale(1.3)`, color: VSRG_SCORE_COLOR_MAP[data.type]},
            {transform: `rotate(0) scale(1)`, color: VSRG_SCORE_COLOR_MAP[data.type]},
        ], {
            duration: 150,
            easing: 'ease-out'
        })
        setStyle({
            transform: `rotate(${angle}deg)`,
            color: VSRG_SCORE_COLOR_MAP[data.type]
        })
        //don't need 'style' to dep array since we need to animate only when data changes
    }, [data])

    return <>
        <div
            ref={ref}
            style={style}
            className={s['vsrg-floating-score']}
        >
            {data.type}
        </div>
        <div
            className={s['vsrg-floating-combo']}
        >
            {data.combo > 0 && `${data.combo}x`}
        </div>
    </>
}

export const VsrgPlayerLatestScore = memo(_VsrgPlayerLatestScore, (p, n) => {
    return false
})