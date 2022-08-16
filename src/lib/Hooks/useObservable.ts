import { observe } from "mobx"
import { useEffect, useState } from "react"




export function useObservableObject<T extends Object>(target: T): T{
    const [observedTarget,setObservedTarget] = useState(target)
    useEffect(() => {
        const dispose = subscribeObeservableObject(target, setObservedTarget)
        return () => {
            dispose()
        }
    },[target]) 
    return observedTarget
}

export function useObservableArray<T>(target: T[]): T[]{
    const [observedTarget,setObservedTarget] = useState(target)
    useEffect(() => {
        const dispose = subscribeObservableArray(target, setObservedTarget)
        return () => {
            dispose()
        }
    },[target]) 
    return observedTarget
}
export function subscribeObservableArray<T>(target: T[], callback: (target: T[]) => void){
    const dispose = observe(target, () => {
        callback([...target])
    })
    callback([...target])
    return dispose
}

export function subscribeObeservableObject<T extends Object>(target: T, callback: (target: T) => void) {
    const dispose = observe(target, () => {
        callback({...target})
    })
    callback({...target})
    return dispose
}