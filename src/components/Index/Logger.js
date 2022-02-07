import LoggerStore from "stores/LoggerStore"
import { observe } from "mobx"
import { useState, useEffect } from "react"
export default function FloatingMessage(props) {
    const [data, setData] = useState(LoggerStore.state.data)
    useEffect(() => {
        const dispose = observe(LoggerStore.state, (newState) => {
            setData(newState.object.data)
        })
        return dispose
    }, [])
    const { title, text, visible, onClick } = data
    let classes = visible ? "floating-message floating-message-visible" : "floating-message"
    return <div className={classes} onClick={onClick}>
        <div className="floating-message-title">
            {title}
        </div>
        <div className="floating-message-text">
            {text}
        </div>
    </div>
}