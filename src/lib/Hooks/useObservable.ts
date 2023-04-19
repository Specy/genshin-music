import { IObjectDidChange, observe } from "mobx"
import { useEffect, useState } from "react"




export function useObservableObject<T extends Object>(target: T): T{
    const [observedTarget,setObservedTarget] = useState(target)
    useEffect(() => {
        const dispose = subscribeObeservableObject(target, setObservedTarget)
        return dispose
    },[target]) 
    return observedTarget
}
export function useObservableMap<K, V>(target: Map<K, V>): [Map<K, V>]{
    const [observedTarget,setObservedTarget] = useState<[Map<K, V>]>([target])
    useEffect(() => {
        const dispose = subscribeObservableMap(target, (newMap) => {
            setObservedTarget([newMap])
        })
        return dispose
    },[target]) 
    return observedTarget
}
export function useObservableArray<T>(target: T[]): T[]{
    const [observedTarget,setObservedTarget] = useState(target)
    useEffect(() => {
        const dispose = subscribeObservableArray(target, setObservedTarget)
        return dispose
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

export function subscribeObeservableObject<T extends Object>(target: T, callback: (target: T, change?: IObjectDidChange<T>) => void) {
    const dispose = observe(target, (change) => {
        callback({...target}, change)
    })
    callback({...target})
    return dispose
}

export function subscribeObservableMap<K, V>(target: Map<K, V>, callback: (target: Map<K, V>) => void){
    const dispose = observe(target, () => {
        callback(target)
    })
    callback(target)
    return dispose
}