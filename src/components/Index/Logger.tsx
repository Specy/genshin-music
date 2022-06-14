import LoggerStore, { LoggerStatus } from "stores/LoggerStore"
import { useLogger } from "lib/Hooks/useLogger"
import { FaCheckCircle, FaExclamationTriangle, FaTimesCircle } from "react-icons/fa"
export default function FloatingMessage() {
    const [data] = useLogger()
    const { type, text, visible, timeout, id } = data
    const isBig = text.length > 150
    return <div
        className={visible ? "logger logger-visible" : "logger"}
        style={{ maxWidth: (isBig && visible) ? '24rem' : '19rem' }}
        onClick={LoggerStore.close}
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
}