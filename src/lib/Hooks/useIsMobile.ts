import isMobile from "is-mobile"
import {useEffect, useState} from "react"


export function useIsMobile() {
    const [state, setIsMobile] = useState(false)
    useEffect(() => {
        setIsMobile(isMobile())
    }, [])
    return state
}
