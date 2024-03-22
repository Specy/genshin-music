import {observe} from "mobx"
import {useEffect, useState} from "react"
import {KeyboardKey, vsrgPlayerStore} from "$stores/VsrgPlayerStore"

export function useVsrgKeyboardLayout() {
    const [layout, setLayout] = useState<KeyboardKey[]>(vsrgPlayerStore.keyboard)
    useEffect(() => {
        const dispose = subscribeVsrgKeyboardLayout(setLayout)
        return dispose
    }, [])
    return layout
}

export function subscribeVsrgKeyboardLayout(callback: (layout: KeyboardKey[]) => void) {
    const dispose = observe(vsrgPlayerStore.keyboard, () => {
        callback([...vsrgPlayerStore.keyboard])
    })
    callback([...vsrgPlayerStore.keyboard])
    return dispose
}