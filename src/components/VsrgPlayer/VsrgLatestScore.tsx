import { memo, useEffect, useRef, useState } from "react"
import { subscribeVsrgLatestScore, vsrgPlayerStore } from "stores/VsrgPlayerStore"

interface VsrgScoreRendererProps {
}


const colorMap = {
    'perfect': 'var(--green)',
    'good': '#ffff00',
    'bad': '#ffffff',
    'miss': 'var(--red)',
    '': '#ffffff',
}
const defaultStyle = {
    transform: 'rotate(0) scale(1)',
    color: 'var(--primary)'
}
function _VsrgPlayerLatestScore({ }: VsrgScoreRendererProps) {
    const [data, setData] = useState(vsrgPlayerStore.score.lastScore)
    const ref = useRef<HTMLDivElement>(null)
    const [style, setStyle] = useState(defaultStyle)
    useEffect(() => {
        return subscribeVsrgLatestScore((d) => {
            setData(d)
            setTimeout(() => {
                if(d.timestamp !== vsrgPlayerStore.score.lastScore.timestamp) return
                setData({...d, type: '' })
            },800)
        })
    },[])
    useEffect(() => {
        const current = ref.current
        if(!current) return
        const angle = Math.floor(Math.random() * 25 - 12.5)
        current.animate([
            style,
            { transform: `rotate(${angle}deg) scale(1.3)`, color: colorMap[data.type] },
            { transform: `rotate(0) scale(1)`, color: colorMap[data.type] },
        ],{
            duration: 150,
            easing: 'ease-out'
        })
        setStyle({
            transform: `rotate(${angle}deg)`,
            color: colorMap[data.type]
        })
    },[data])

    return <>
        <div
            ref={ref}
            style={style}
            className="vsrg-floating-score"
        >
            {data.type}
        </div>
    </>
}
export const VsrgPlayerLatestScore = memo(_VsrgPlayerLatestScore, (p, n) => {
    return false
})