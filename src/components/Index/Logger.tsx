import { LoggerStatus, logger, ToastState } from "$stores/LoggerStore"
import { FaCheckCircle, FaExclamationTriangle, FaTimesCircle } from "react-icons/fa"
import { useObservableArray, useObservableObject } from "$lib/Hooks/useObservable"
import { DecorationBorderedBox } from "../Miscellaneous/BorderDecoration"
export default function FloatingMessage() {
    const toasts = useObservableArray(logger.toasts)
    const pillData = useObservableObject(logger.pillState)
    return <>
        <div className="logger-wrapper">
            {toasts.map(toast => {
                return <Toast 
                    toast={toast}
                    key={toast.id}
                />
            })}
        </div>
        <div
            className={`flex-centered pill ${pillData.visible ? "pill-visible" : ""}`}
        >
            {pillData.text}
        </div>
    </>
}

interface ToastProps {
    toast: ToastState
}


function Toast({ toast }: ToastProps) {
    const observableToast = useObservableObject(toast)
    const { text, type, id, timeout, visible } = observableToast
    const isBig = text.length > 150
    return <DecorationBorderedBox
        key={id}
        boxProps={{
            className: visible ? "logger-toast" : "logger-toast logger-toast-hidden",
            style: { maxWidth: isBig ? '24rem' : '19rem' }
        }}
        onClick={() => {
            logger.removeToast(id)
        }}
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
        <div className="logger-progress-outer">
            <div
                className="logger-progress-bar"
                style={{ animation: `logger-animation ${timeout}ms linear forwards`, backgroundColor: type }}
                key={id}
            />
        </div>
    </DecorationBorderedBox>
}