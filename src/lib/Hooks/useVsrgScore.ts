import {useEffect, useState} from "react"
import {subscribeVsrgScore, vsrgPlayerStore} from "$stores/VsrgPlayerStore"


export function useVsrgScore() {
    const [score, setScore] = useState(vsrgPlayerStore.score)
    useEffect(() => {
        const dispose = subscribeVsrgScore(setScore)
        return dispose
    }, [])
    return score
}