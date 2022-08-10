import { memo, useEffect, useRef } from "react";



interface VsrgPlayerProps {
    time: number
}



function _VsrgPlayerCountDown({ time }: VsrgPlayerProps) {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const element = ref.current
        if (element) {
            element.animate([
                { transform: 'scale(1.5)' },
                { transform: 'scale(1)' },
            ], {
                duration: 1000,
                iterations: 1
            })
        }
    }, [time])
    return <>
        <div className="vsrg-player-countdown flex-centered" ref={ref}>
            {time}
        </div>
    </>
}


export const VsrgPlayerCountDown = memo<VsrgPlayerProps>(_VsrgPlayerCountDown, (p, n) => {
    return p.time === n.time
})