import LoggerStore, { LoggerDataProps } from "stores/LoggerStore"

import { useState, useEffect } from "react";
import { observe } from "mobx";

type UseLogger = [LoggerDataProps, (data: LoggerDataProps) => void]
export function useLogger(): UseLogger {
    const [data, setData] = useState(LoggerStore.state.data)
    useEffect(() => {
        const dispose = observe(LoggerStore.state, () => {
            setData({ ...LoggerStore.state.data })
        })
        return dispose
    }, [])
    return [data, setData]
}