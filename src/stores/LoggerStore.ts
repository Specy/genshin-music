import { observable } from "mobx"

enum LOGGER_COLOR{
    error = 'var(--red)',
    warn = 'var(--orange)',
    success = 'var(--accent)'
}

interface LoggerDataProps{
    timestamp: number
    visible: boolean
    text: string
    title: string
    timeout: number
    id: number
    color: LOGGER_COLOR
}
type LoggerData = {
    data: LoggerDataProps
}
class LoggerStore {
    state: LoggerData
    timeout: any
    constructor() {
        this.state = observable({
            data: {
                timestamp: 0,
                visible: false,
                text: "Text",
                title: "Title",
                timeout: 3000,
                id: 0,
                color: LOGGER_COLOR.success
            }
        })
        this.timeout = undefined
    }
    log = (
        status: string, 
        text: string, 
        timeout: number = 3500, 
        color: LOGGER_COLOR = LOGGER_COLOR.success,
    ) => {
        this.state.data = {
            title: status,
            text,
            timestamp: new Date().getTime(),
            visible: true,
            timeout,
            id: ++this.state.data.id,
            color
        }
        if(this.timeout !== undefined) clearTimeout(this.timeout)
        this.timeout = setTimeout(this.close, timeout)
    }
    error = (text: string, timeout?: number) => {
        this.log('Error', text, timeout, LOGGER_COLOR.error)
    }
    success = (text: string, timeout?: number) => {
        this.log('Success', text, timeout, LOGGER_COLOR.success)
    }
    warn = (text: string, timeout?: number) => {
        this.log('Warning', text, timeout, LOGGER_COLOR.warn)
    }
    close = () => {
        this.setState({visible: false})
    }
    setState = (state: Partial<LoggerDataProps>) => {
        this.state.data = {...this.state.data, ...state}
    }
}

export default new LoggerStore()