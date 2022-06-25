import { logger,  LoggerDataProps } from "stores/LoggerStore"

import { useState, useEffect } from "react";
import { observe } from "mobx";

type UseLogger = [LoggerDataProps, (data: LoggerDataProps) => void]
export function useLogger(): UseLogger {
    const [data, setData] = useState(logger.state.data)
    useEffect(() => {
        const dispose = observe(logger.state, () => {
            setData({ ...logger.state.data })
        })
        return dispose
    }, [])
    return [data, setData]
}