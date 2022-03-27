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
    const { title, text, visible, timeout, id, color } = data
    const classes = visible ? "logger logger-visible" : "logger"
    return <div className={classes} onClick={LoggerStore.close}>
        <div className="column logger-content">
            <div className="logger-title">
                {title}
            </div>
            <div className="logger-text">
                {text}
            </div>
            </div>
        {visible && 
            <div 
                className="logger-progress-bar" 
                style={{animation: `logger-animation ${timeout}ms linear`, backgroundColor: color}}
                key={id}
            />
        }
    </div>
}