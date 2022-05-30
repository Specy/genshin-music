import LoggerStore from "stores/LoggerStore"
import { useLogger } from "lib/hooks/useLogger"
export default function FloatingMessage() {
    const [data] = useLogger()
    const { title, text, visible, timeout, id, color } = data
    return <div
        className={visible ? "logger logger-visible" : "logger"}
        onClick={LoggerStore.close}
    >
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
                style={{ animation: `logger-animation ${timeout}ms linear`, backgroundColor: color }}
                key={id}
            />
        }
    </div>
}