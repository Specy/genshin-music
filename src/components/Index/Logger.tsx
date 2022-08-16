import { LoggerStatus, logger } from "stores/LoggerStore"
import { FaCheckCircle, FaExclamationTriangle, FaTimesCircle } from "react-icons/fa"
import { useObservableObject } from "lib/Hooks/useObservable"
export default function FloatingMessage() {
    const loggerData = useObservableObject(logger.toastState)
    const pillData = useObservableObject(logger.pillState)
    const { type, text, visible, timeout, id } = loggerData
    const isBig = text.length > 150
    return <>
        <div
            className={visible ? "logger logger-visible" : "logger"}
            style={{ maxWidth: (isBig && visible) ? '24rem' : '19rem' }}
            onClick={logger.close}
        >
            <div className="logger-content">
                {!isBig &&
                    <div className="logger-status">
                        {type === LoggerStatus.ERROR &&
                            <FaTimesCircle color={type} size={20} />
                        }
                        {type === LoggerStatus.SUCCESS &&
                            <FaCheckCircle color={type} size={20} />
                        }
                        {type === LoggerStatus.WARN &&
                            <FaExclamationTriangle color={type} size={20} />
                        }
                    </div>
                }
                <div className="logger-text">
                    {text}
                </div>
            </div>
            {visible &&
                <div className="logger-progress-outer">
                    <div
                        className="logger-progress-bar"
                        style={{ animation: `logger-animation ${timeout}ms linear`, backgroundColor: type }}
                        key={id}
                    />
                </div>

            }
        </div>
        <div 
            className={`flex-centered pill ${pillData.visible ? "pill-visible" : ""}`}
        >
            {pillData.text}
        </div>
    </>
}