import { observable } from "mobx"

export enum LoggerStatus{
    ERROR = 'var(--red)',
    WARN = 'var(--orange)',
    SUCCESS = 'var(--accent)'
}

export interface LoggerDataProps{
    timestamp: number
    visible: boolean
    text: string
    timeout: number
    id: number
    type: LoggerStatus
}
type LoggerData = {
    data: LoggerDataProps
}
export class LoggerStore {
    state: LoggerData
    timeout: any
    constructor() {
        this.state = observable({
            data: {
                timestamp: 0,
                visible: false,
                text: "Text",
                timeout: 3000,
                id: 0,
                type: LoggerStatus.WARN
            }
        })
        this.timeout = undefined
    }
    log = (
        text: string, 
        timeout: number = 3500, 
        type: LoggerStatus = LoggerStatus.SUCCESS,
    ) => {
        this.state.data = {
            text,
            timestamp: new Date().getTime(),
            visible: true,
            timeout,
            id: ++this.state.data.id,
            type
        }
        if(this.timeout !== undefined) clearTimeout(this.timeout)
        this.timeout = setTimeout(this.close, timeout)
    }
    error = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.ERROR)
    }
    success = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.SUCCESS)
    }
    warn = (text: string, timeout?: number) => {
        this.log(text, timeout, LoggerStatus.WARN)
    }
    close = () => {
        this.setState({visible: false})
    }
    setState = (state: Partial<LoggerDataProps>) => {
        this.state.data = {...this.state.data, ...state}
    }
}

export const logger = new LoggerStore()