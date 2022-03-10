import LoggerStore from "stores/LoggerStore"
import { observe } from "mobx"
import { useState, useEffect } from "react"
export default function FloatingMessage() {
    const [data, setData] = useState(LoggerStore.state.data)
    useEffect(() => {
        const dispose = observe(LoggerStore.state, (newState) => {
            setData(newState.object.data)
        })
        return dispose
    }, [])
    const { title, text, visible, timeout } = data
    const classes = visible ? "logger logger-visible" : "logger"
    const barClass = (visible ? "logger-progress-bar-visible" : "") + " logger-progress-bar-base"
    return <div className={classes} onClick={LoggerStore.close}>
        <div className="column logger-content">
            <div className="logger-title">
                {title}
            </div>
            <div className="logger-text">
                {text}
            </div>
            </div>
        <div className={barClass} style={{transition: `width ${visible ? timeout : 0}ms linear`}}>

        </div>
    </div>
}