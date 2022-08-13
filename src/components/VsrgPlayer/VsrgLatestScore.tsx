import { memo, useEffect, useRef, useState } from "react"
import { subscribeVsrgLatestScore, vsrgPlayerStore } from "stores/VsrgPlayerStore"
import { Timer } from "types/GeneralTypes"


const colorMap = {
    'amazing': '#cff3e3',
    'perfect': '#d9af0a',
    'great': '#358a55 ',
    'good': '#0057d9',
    'bad': '#dd8d46',
    'miss': '#f24b5b',
    '': '#ffffff',
}
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
                setData({ ...d, type: '' })
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
            { transform: `rotate(${angle}deg) scale(1.3)`, color: colorMap[data.type] },
            { transform: `rotate(0) scale(1)`, color: colorMap[data.type] },
        ], {
            duration: 150,
            easing: 'ease-out'
        })
        setStyle({
            transform: `rotate(${angle}deg)`,
            color: colorMap[data.type]
        })
        //don't need 'style' to dep array since we need to animate only when data changes
    }, [data]) 

    return <>
        <div
            ref={ref}
            style={style}
            className="vsrg-floating-score"
        >
            {data.type}
        </div>
        <div
            className='vsrg-floating-combo'
        >
            {data.combo > 0 && `${data.combo}x`}
        </div>
    </>
}
export const VsrgPlayerLatestScore = memo(_VsrgPlayerLatestScore, (p, n) => {
    return false
})